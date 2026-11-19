"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const {
  buildOtpEmail, ttlLabel, verifyNeonWebhook, sendViaResend, createNeonEmailWebhook
} = require("../services/neonOtpEmail");

test("verification email uses approved Brush Beats copy and ends with tagline, no domain link", () => {
  const now = Date.parse("2026-11-18T12:00:00.000Z");
  const email = buildOtpEmail({ code: "017568", type: "email-verification", expiresAt: "2026-11-18T12:10:00.000Z", now });
  assert.match(email.subject, /You're one beat away!/);
  assert.match(email.html, /Better brushing\. One beat at a time\./);
  assert.match(email.html, /017568/);
  assert.match(email.html, /Don't miss the beat/);
  assert.match(email.html, /Brush to the beat\. Smile to the rhythm\./);
  assert.match(email.html, /<\/td><\/tr>\s*<\/table><\/body><\/html>$/);
  assert.doesNotMatch(email.html, /brushbeats\.com/i);
  assert.match(email.text, /Brush to the beat\. Smile to the rhythm\.$/);
  assert.match(email.text, /10 minutes/);
});

test("OTP email types distinguish sign-in and password reset from signup verification", () => {
  const inputs = { code: "123456", expiresAt: "2026-11-18T12:10:00Z", now: Date.parse("2026-11-18T12:00:00Z") };
  const login = buildOtpEmail({ ...inputs, type: "sign-in" });
  const reset = buildOtpEmail({ ...inputs, type: "forget-password" });
  assert.match(login.subject, /sign-in code/);
  assert.match(reset.subject, /Reset/);
  assert.doesNotMatch(reset.html, /Welcome to Brush Beats!/);
  assert.throws(() => buildOtpEmail({ ...inputs, code: "<script>", type: "email-verification" }));
});

test("expiration text reflects signed Neon event expiration instead of hardcoded duration", () => {
  const now = Date.parse("2026-11-18T12:00:00Z");
  assert.equal(ttlLabel("2026-11-18T12:03:00Z", now), "This code expires in about 3 minutes.");
  assert.equal(ttlLabel(null, now), "This code expires soon.");
});

function makeSignedWebhook(payload, { invalidSignature = false, stale = false } = {}) {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const kid = "test-key";
  const timestamp = String(Date.now() - (stale ? 6 * 60 * 1000 : 0));
  const headerB64 = Buffer.from(JSON.stringify({ alg: "EdDSA", kid }), "utf8").toString("base64url");
  const body = Buffer.from(JSON.stringify(payload), "utf8");
  const toSign = Buffer.from(`${headerB64}.${Buffer.from(`${timestamp}.${body.toString("base64url")}`).toString("base64url")}`);
  const sig = crypto.sign(null, toSign, privateKey).toString("base64url");
  return {
    body: invalidSignature ? Buffer.from(JSON.stringify({ ...payload, event_id: "altered" })) : body,
    headers: {
      "x-neon-signature": `${headerB64}..${sig}`,
      "x-neon-signature-kid": kid,
      "x-neon-timestamp": timestamp,
      "x-neon-event-type": "send.otp",
      "x-neon-event-id": payload.event_id
    },
    fetchImpl: async () => ({ ok: true, json: async () => ({ keys: [publicKey.export({ format: "jwk" })].map(k => ({ ...k, kid })) }) })
  };
}

test("verifies signed Neon webhooks; rejects tampering, missing signature and stale timestamps", async () => {
  const payload = { event_type: "send.otp", event_id: "test-event-1234" };
  const valid = makeSignedWebhook(payload);
  assert.deepEqual(await verifyNeonWebhook(valid.body, valid.headers, { baseUrl: "https://auth.example.com", fetchImpl: valid.fetchImpl }), payload);
  const altered = makeSignedWebhook(payload, { invalidSignature: true });
  await assert.rejects(verifyNeonWebhook(altered.body, altered.headers, { baseUrl: "https://auth.example.com", fetchImpl: altered.fetchImpl }));
  const stale = makeSignedWebhook(payload, { stale: true });
  await assert.rejects(verifyNeonWebhook(stale.body, stale.headers, { baseUrl: "https://auth.example.com", fetchImpl: stale.fetchImpl }));
  await assert.rejects(verifyNeonWebhook(valid.body, {}, { baseUrl: "https://auth.example.com", fetchImpl: valid.fetchImpl }));
});

function fakeResponse() {
  return { code: 200, jsonBody: null, status(value) { this.code = value; return this; }, json(value) { this.jsonBody = value; return this; }, end() { return this; } };
}

test("webhook sends one email then ignores retries with the same event id", async () => {
  const data = {
    event_type: "send.otp",
    event_id: `test-event-${crypto.randomUUID()}`,
    user: { email: "test@example.com" },
    event_data: { otp_code: "123456", otp_type: "email-verification", expires_at: new Date(Date.now() + 600000).toISOString() }
  };
  const sent = [];
  const handler = createNeonEmailWebhook({ verify: async () => data, send: async (email, metadata) => { sent.push({ email, metadata }); } });
  for (let i = 0; i < 2; i++) {
    const result = fakeResponse();
    await handler({ body: Buffer.from("unused"), headers: { "x-neon-event-type": "send.otp", "x-neon-event-id": data.event_id } }, result);
    assert.equal(result.code, 204);
  }
  assert.equal(sent.length, 1);
  assert.equal(sent[0].email.to, "test@example.com");
  assert.equal(sent[0].metadata.eventId, data.event_id);
});

test("Resend delivery sends branded HTML and text with an idempotency key", async () => {
  let call;
  await sendViaResend({ to: "test@example.com", subject: "Code", html: "<p>Hi</p>", text: "Hi" }, {
    apiKey: "fake-key",
    eventId: "event-123",
    fetchImpl: async (url, options) => { call = { url, options }; return { ok: true, status: 200 }; }
  });
  assert.equal(call.url, "https://api.resend.com/emails");
  assert.equal(call.options.headers["Idempotency-Key"], "event-123");
  assert.equal(JSON.parse(call.options.body).from, "Brush Beats <accounts@brushbeats.ca>");
  assert.equal(JSON.parse(call.options.body).text, "Hi");
});
