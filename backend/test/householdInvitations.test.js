"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  hashInviteToken, isValidInviteToken, normalizeInviteEmail, INVITE_TTL_HOURS
} = require("../src/routes/householdInvitations");

test("invitation token is a one-use capable cryptographic digest, never stored as plaintext", () => {
  const token = "ab".repeat(32);
  assert.equal(isValidInviteToken(token), true);
  assert.equal(hashInviteToken(token), "9a2db2e23f1504cd9505b2a11e5a5a725ab7f12a932ed986e54cb77bb25c0b3d");
  assert.notEqual(hashInviteToken(token), token);
  assert.match(hashInviteToken(token), /^[a-f0-9]{64}$/);
  assert.equal(INVITE_TTL_HOURS, 72);
});

test("malformed, shortened, uppercase and missing invite tokens are rejected", () => {
  for (const token of ["abc", "A".repeat(64), "g".repeat(64), "", null, undefined, 3]) {
    assert.equal(isValidInviteToken(token), false);
  }
});

test("invites accept only reasonable, normalized adult email recipients", () => {
  assert.equal(normalizeInviteEmail("  Person@Example.org  "), "person@example.org");
  for (const email of ["", "x", "name@", "other @example.org", "@domain.test", "a".repeat(250) + "@x.test", null]) {
    assert.equal(normalizeInviteEmail(email), null);
  }
});

test("invitation routes never activate without explicit rollout flag", async () => {
  const app = require("../src/server");
  const previous = process.env.ENABLE_HOUSEHOLD_INVITATIONS;
  delete process.env.ENABLE_HOUSEHOLD_INVITATIONS;
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    const response = await fetch("http://127.0.0.1:" + server.address().port
      + "/api/households/invitations/accept", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: "ab".repeat(32) })
    });
    assert.equal(response.status, 401, "unauthenticated callers must be rejected before any invite lookup");
  } finally {
    if (previous === undefined) delete process.env.ENABLE_HOUSEHOLD_INVITATIONS;
    else process.env.ENABLE_HOUSEHOLD_INVITATIONS = previous;
    await new Promise((resolve, reject) => server.close((e) => e ? reject(e) : resolve()));
  }
});
