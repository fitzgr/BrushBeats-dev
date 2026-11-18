"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { generateKeyPairSync, sign } = require("node:crypto");
const { validateToken } = require("../src/middleware/neonAuth");

const origin = "https://auth.example.test";
const now = 1800000000;
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const jwk = { ...publicKey.export({ format: "jwk" }), kid: "test-key", alg: "EdDSA", use: "sig" };

function mint(overrides = {}, headerOverrides = {}) {
  const header = Buffer.from(JSON.stringify({ alg: "EdDSA", kid: "test-key", ...headerOverrides })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({
    sub: "parent-account-123",
    emailVerified: true,
    iss: origin,
    aud: origin,
    iat: now - 120,
    exp: now + 600,
    ...overrides
  })).toString("base64url");
  const signed = header + "." + payload;
  return signed + "." + sign(null, Buffer.from(signed), privateKey).toString("base64url");
}

test("verified Ed25519 user gets a validated subject", () => {
  assert.equal(validateToken(mint(), [jwk], origin, now).sub, "parent-account-123");
});

test("unverified sign-in cannot access a household", () => {
  assert.throws(() => validateToken(mint({ emailVerified: false }), [jwk], origin, now));
});

test("expired and not-yet-valid credentials fail", () => {
  assert.throws(() => validateToken(mint({ exp: now }), [jwk], origin, now));
  assert.throws(() => validateToken(mint({ nbf: now + 100 }), [jwk], origin, now));
});

test("wrong issuer and audience fail even with a valid signature", () => {
  assert.throws(() => validateToken(mint({ iss: "https://evil.test" }), [jwk], origin, now));
  assert.throws(() => validateToken(mint({ aud: "https://evil.test" }), [jwk], origin, now));
});

test("unknown signing keys or modified payloads fail", () => {
  assert.throws(() => validateToken(mint(), [], origin, now));
  const token = mint();
  const parts = token.split(".");
  const modified = Buffer.from(JSON.stringify({ sub: "attacker", emailVerified: true, iss: origin, aud: origin, exp: now + 600 })).toString("base64url");
  assert.throws(() => validateToken(parts[0] + "." + modified + "." + parts[2], [jwk], origin, now));
});

test("algorithm substitution attacks fail", () => {
  assert.throws(() => validateToken(mint({}, { alg: "none" }), [jwk], origin, now));
  assert.throws(() => validateToken(mint({}, { alg: "HS256" }), [jwk], origin, now));
});
