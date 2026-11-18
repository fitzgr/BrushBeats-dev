const test = require("node:test");
const assert = require("node:assert/strict");
const { evaluateHouseholdEntitlement, TRIAL_DAYS } = require("../src/services/subscriptionPolicy");

const DAY_MS = 86400000;
const START = new Date("2026-11-18T12:00:00.000Z");
const trialEnds = new Date(START.getTime() + TRIAL_DAYS * DAY_MS);

test("60 days of free trial, ending exactly at expiry", () => {
  const record = { status: "trial", trial_ends_at: trialEnds };
  assert.equal(evaluateHouseholdEntitlement(record, START).trialDaysRemaining, 60);
  assert.equal(evaluateHouseholdEntitlement(record, new Date(trialEnds.getTime() - 1)).allowed, true);
  assert.equal(evaluateHouseholdEntitlement(record, trialEnds).allowed, false);
});

test("seven-day reminder only becomes due in the final week", () => {
  const record = { status: "trial", trial_ends_at: trialEnds };
  assert.equal(evaluateHouseholdEntitlement(record, new Date(trialEnds.getTime() - 8 * DAY_MS)).reminderDue, false);
  assert.equal(evaluateHouseholdEntitlement(record, new Date(trialEnds.getTime() - 7 * DAY_MS)).reminderDue, true);
});

test("verified paid access remains valid for a canceled auto-renewal until paidThrough", () => {
  const record = { status: "canceled", trial_ends_at: trialEnds, paid_through: "2028-01-01T00:00:00Z" };
  const result = evaluateHouseholdEntitlement(record, new Date("2027-06-01T00:00:00Z"));
  assert.equal(result.allowed, true);
  assert.equal(result.state, "paid");
});

test("non-active or expired subscriptions do not grant access", () => {
  assert.equal(evaluateHouseholdEntitlement(null, START).allowed, false);
  const result = evaluateHouseholdEntitlement(
    { status: "past_due", trial_ends_at: "2026-01-01T00:00:00Z", paid_through: "2028-01-01T00:00:00Z" },
    START
  );
  assert.equal(result.allowed, false);
});

test("client tier cannot confer premium rights", () => {
  const result = evaluateHouseholdEntitlement({ subscription_tier: "premium" }, START);
  assert.equal(result.allowed, false);
});
