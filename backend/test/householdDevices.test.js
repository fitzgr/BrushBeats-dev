"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { validSecret, hashSecret, enabled, ENROLLMENT_TTL_MINUTES } =
  require("../src/routes/householdDevices");
const app = require("../src/server");

test("device enrollment secrets are strong and digests are not reusable tickets", () => {
  const ticket = "ab".repeat(32);
  assert.equal(validSecret(ticket), true);
  assert.equal(ENROLLMENT_TTL_MINUTES, 30);
  assert.match(hashSecret(ticket), /^[a-f0-9]{64}$/);
  assert.notEqual(hashSecret(ticket), ticket);
  for (const input of ["a".repeat(63), "A".repeat(64), "g".repeat(64), "", null, 22]) {
    assert.equal(validSecret(input), false);
  }
});

test("device enrollment is disabled by default and owner routes require login", async () => {
  const previous = process.env.ENABLE_HOUSEHOLD_DEVICE_ENROLLMENT;
  delete process.env.ENABLE_HOUSEHOLD_DEVICE_ENROLLMENT;
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  const base = "http://127.0.0.1:" + server.address().port;
  const householdId = "household_01234567-89ab-4cde-8fab-0123456789ab";
  try {
    assert.equal(enabled(), false);
    const enroll = await fetch(base + "/api/households/" + householdId + "/devices/enrollment", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: "{}"
    });
    assert.equal(enroll.status, 401);
    const list = await fetch(base + "/api/households/" + householdId + "/devices");
    assert.equal(list.status, 401);
    const revoke = await fetch(base + "/api/households/" + householdId +
      "/devices/11111111-1111-4111-8111-111111111111", { method: "DELETE" });
    assert.equal(revoke.status, 401);
    const activate = await fetch(base + "/api/households/devices/activate", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticket: "ab".repeat(32) })
    });
    assert.equal(activate.status, 503);
    assert.equal((await activate.json()).code, "device_enrollment_disabled");
    const malformed = await fetch(base + "/api/households/devices/activate", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ticket: "wrong" })
    });
    assert.equal(malformed.status, 400);
  } finally {
    if (previous === undefined) delete process.env.ENABLE_HOUSEHOLD_DEVICE_ENROLLMENT;
    else process.env.ENABLE_HOUSEHOLD_DEVICE_ENROLLMENT = previous;
    await new Promise((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
  }
});
