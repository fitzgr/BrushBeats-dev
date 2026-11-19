"use strict";

// Neon Auth signs blocking delivery events using detached Ed25519 JWS.
// This module deliberately does not log verification codes or recipient addresses.
const crypto = require("node:crypto");

const AUTH_BASE_URL = process.env.NEON_AUTH_BASE_URL;
const MAX_AGE_MS = 5 * 60 * 1000;
const EMAIL_FROM = "Brush Beats <accounts@brushbeats.ca>";
const OTP_TYPES = new Set(["email-verification", "sign-in", "forget-password"]);
const deliveredEvents = new Map();

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}

function ttlLabel(expiresAt, now = Date.now()) {
  const ms = Date.parse(expiresAt) - now;
  if (!Number.isFinite(ms) || ms <= 0) return "This code expires soon.";
  const mins = Math.max(1, Math.ceil(ms / 60000));
  return `This code expires in about ${mins} minute${mins === 1 ? "" : "s"}.`;
}

function buildOtpEmail({ code, type, expiresAt, now }) {
  if (!/^\d{4,10}$/.test(String(code)) || !OTP_TYPES.has(type)) {
    throw new Error("Invalid OTP payload");
  }

  const verification = type === "email-verification";
  const title = verification
    ? "🎵 You're one beat away! Verify your Brush Beats email"
    : type === "sign-in"
      ? "Your Brush Beats sign-in code"
      : "Reset your Brush Beats password";
  const intro = verification
    ? "Welcome to Brush Beats!"
    : type === "sign-in"
      ? "Ready to get back in the groove?"
      : "Let's get your Brush Beats account back on track.";
  const body = verification
    ? "You're just one quick step away from making your brushing routine a whole lot more fun."
    : type === "sign-in"
      ? "Use this one-time code to sign in."
      : "Use this one-time code to reset your password.";
  const action = verification
    ? "Enter this code to confirm your email and get the good vibes rolling."
    : "Enter this code in Brush Beats to continue.";
  const expires = ttlLabel(expiresAt, now);
  const greeting = "Hey there! 👋";
  const safeCode = escapeHtml(code);
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Brush Beats</title></head>
<body style="margin:0;padding:24px 12px;background:#f2f7f5;font-family:Arial,Helvetica,sans-serif;color:#17352e">
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;margin:auto;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #dcece7">
<tr><td style="padding:24px 26px 23px;background:#113e38;color:white">
  <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse">
    <tr>
      <td style="vertical-align:middle;text-align:left">
        <div style="font-size:30px;line-height:1.2;font-weight:800;letter-spacing:-0.5px;color:#ffffff">🪥 Brush Beats</div>
        <div style="margin-top:10px;color:#d7f1e8;font-size:14px;line-height:1.4">Better brushing. One beat at a time.</div>
      </td>
      <td style="width:76px;text-align:right;vertical-align:middle;padding-left:10px">
        <img src="https://brushbeats.ca/brushbeats-email-icon.png" alt="Brush Beats tooth and music note" width="68" height="68" style="display:block;width:68px;height:68px;border:0;outline:none" />
      </td>
    </tr>
  </table>
</td></tr>
<tr><td style="padding:28px 30px 16px">
  <h1 style="font-size:23px;line-height:1.3;margin:0 0 14px;color:#17352e">${escapeHtml(greeting)}</h1>
  <p style="font-size:18px;line-height:1.5;margin:0 0 10px;font-weight:700">${escapeHtml(intro)}</p>
  <p style="font-size:15px;line-height:1.65;margin:0 0 18px">${escapeHtml(body)}</p>
  <p style="font-size:14px;line-height:1.5;margin:0 0 12px;font-weight:700">Here's your verification code:</p>
  <div style="background:#e8f7f1;border:2px solid #73c9aa;border-radius:13px;text-align:center;padding:18px 10px;font-size:34px;letter-spacing:7px;font-weight:800;color:#124e43">${safeCode}</div>
  <p style="font-size:15px;line-height:1.6;margin:19px 0 9px">${escapeHtml(action)}</p>
  <p style="font-size:14px;line-height:1.6;margin:0 0 16px">⏱️ <strong>Heads up!</strong> ${escapeHtml(expires)} Don't miss the beat!</p>
  <p style="font-size:14px;line-height:1.6;margin:0 0 22px">Didn't request this code? No worries. You can safely ignore this email.</p>
  <p style="font-size:15px;line-height:1.55;margin:0"><strong>Keep smiling. Keep grooving. 🎶</strong></p>
  <p style="font-size:14px;margin:10px 0 0">The Brush Beats Team</p>
</td></tr>
<tr><td style="padding:19px 30px 25px;text-align:center;border-top:1px solid #e9f1ee;color:#255848;font-size:15px;font-style:italic;font-weight:600">Brush to the beat. Smile to the rhythm.</td></tr>
</table></body></html>`;
  const text = `Brush Beats
Better brushing. One beat at a time.

${greeting}

${intro}
${body}

Here's your verification code:

${code}

${action}

Heads up! ${expires} Don't miss the beat!

Didn't request this code? No worries. You can safely ignore this email.

Keep smiling. Keep grooving.
The Brush Beats Team

Brush to the beat. Smile to the rhythm.`;
  return { subject: title, html, text };
}

async function verifyNeonWebhook(rawBody, headers, { baseUrl = AUTH_BASE_URL, fetchImpl = fetch, now = Date.now() } = {}) {
  const signature = headers["x-neon-signature"];
  const kid = headers["x-neon-signature-kid"];
  const timestamp = headers["x-neon-timestamp"];
  if (!signature || !kid || !timestamp || !Buffer.isBuffer(rawBody)) throw new Error("Missing Neon webhook signature");
  const age = now - Number(timestamp);
  if (!/^\d{13}$/.test(String(timestamp)) || !Number.isFinite(age) || Math.abs(age) > MAX_AGE_MS) {
    throw new Error("Expired Neon webhook timestamp");
  }
  const [headerB64, middle, signatureB64, extra] = signature.split(".");
  if (!headerB64 || middle !== "" || !signatureB64 || extra !== undefined) throw new Error("Malformed detached signature");
  const signedHeader = JSON.parse(Buffer.from(headerB64, "base64url").toString("utf8"));
  if (signedHeader.alg !== "EdDSA" || signedHeader.kid !== kid) throw new Error("Unexpected signing algorithm or key");
  if (!baseUrl || !/^https:\/\//.test(baseUrl)) throw new Error("Neon Auth URL not configured");
  const jwksResponse = await fetchImpl(`${baseUrl.replace(/\/$/, "")}/.well-known/jwks.json`, { signal: AbortSignal.timeout(4000) });
  if (!jwksResponse.ok) throw new Error("Neon signing keys unavailable");
  const jwks = await jwksResponse.json();
  const jwk = jwks.keys?.find((k) => k.kid === kid && k.kty === "OKP" && k.crv === "Ed25519");
  if (!jwk) throw new Error("Unrecognized Neon webhook signing key");

  const signaturePayload = `${timestamp}.${rawBody.toString("base64url")}`;
  const signingInput = `${headerB64}.${Buffer.from(signaturePayload, "utf8").toString("base64url")}`;
  const publicKey = crypto.createPublicKey({ key: jwk, format: "jwk" });
  if (!crypto.verify(null, Buffer.from(signingInput), publicKey, Buffer.from(signatureB64, "base64url"))) {
    throw new Error("Invalid Neon webhook signature");
  }
  return JSON.parse(rawBody.toString("utf8"));
}

async function sendViaResend(email, { apiKey = process.env.RESEND_API_KEY, fetchImpl = fetch, eventId } = {}) {
  if (!apiKey) throw new Error("RESEND_API_KEY is not configured");
  const response = await fetchImpl("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": eventId
    },
    body: JSON.stringify({ from: EMAIL_FROM, ...email }),
    signal: AbortSignal.timeout(6500)
  });
  if (!response.ok) throw new Error(`Email delivery failed (HTTP ${response.status})`);
}

function createNeonEmailWebhook({ verify = verifyNeonWebhook, send = sendViaResend, now = () => Date.now() } = {}) {
  return async (req, res) => {
    let event;
    try {
      event = await verify(req.body, req.headers);
    } catch {
      return res.status(401).json({ error: "Invalid webhook signature" });
    }
    if (event.event_type !== "send.otp") return res.status(400).json({ error: "Unsupported Neon event" });
    if (req.headers["x-neon-event-type"] && req.headers["x-neon-event-type"] !== event.event_type) {
      return res.status(400).json({ error: "Event type mismatch" });
    }
    if (!/^[-a-zA-Z0-9_]{8,128}$/.test(String(event.event_id || ""))) return res.status(400).json({ error: "Invalid event id" });
    if (req.headers["x-neon-event-id"] && req.headers["x-neon-event-id"] !== event.event_id) {
      return res.status(400).json({ error: "Event id mismatch" });
    }
    const recipient = event.user?.email;
    const code = event.event_data?.otp_code;
    const type = event.event_data?.otp_type;
    if (typeof recipient !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient) || !/^\d{4,10}$/.test(String(code)) || !OTP_TYPES.has(type)) {
      return res.status(400).json({ error: "Invalid OTP event" });
    }
    const current = now();
    for (const [id, at] of deliveredEvents) if (at < current - 15 * 60 * 1000) deliveredEvents.delete(id);
    if (deliveredEvents.has(event.event_id)) return res.status(204).end();
    try {
      const email = buildOtpEmail({ code, type, expiresAt: event.event_data.expires_at, now: current });
      await send({ to: recipient, ...email }, { eventId: event.event_id });
      deliveredEvents.set(event.event_id, current);
      return res.status(204).end();
    } catch {
      // A non-2xx response lets Neon retry rather than treating an unsent OTP as delivered.
      return res.status(503).json({ error: "Verification email could not be delivered" });
    }
  };
}

module.exports = { buildOtpEmail, ttlLabel, verifyNeonWebhook, sendViaResend, createNeonEmailWebhook };
