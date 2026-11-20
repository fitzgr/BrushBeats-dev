"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const {
  HOUSEHOLD_PLANS,
  getHouseholdPlan,
  evaluateHouseholdCapacity
} = require("../src/services/householdPlanPolicy");

const migration = readFileSync(
  path.resolve(__dirname, "../src/db/migrations/004_household_family_plans_and_invites.sql"),
  "utf8"
);

test("UK launch plan values are explicit and match the migration", () => {
  assert.equal(HOUSEHOLD_PLANS.family.annualPriceMinor, 1499);
  assert.equal(HOUSEHOLD_PLANS.family.maxProfiles, 6);
  assert.equal(HOUSEHOLD_PLANS.family.maxRegisteredDevices, 5);
  assert.equal(HOUSEHOLD_PLANS.family_plus.annualPriceMinor, 2499);
  assert.equal(HOUSEHOLD_PLANS.family_plus.maxProfiles, 12);
  assert.equal(HOUSEHOLD_PLANS.family_plus.maxRegisteredDevices, 10);
  assert.match(migration, /\('family', 'Brush Beats Family', 'GBP', 1499, 6, 5\)/);
  assert.match(migration, /\('family_plus', 'Brush Beats Family Plus', 'GBP', 2499, 12, 10\)/);
});

test("six profiles and five devices fit the base family plan", () => {
  const result = evaluateHouseholdCapacity({
    planCode: "family", activeProfiles: 5, registeredDevices: 4,
    addProfiles: 1, addDevices: 1
  });
  assert.equal(result.allowed, true);
  assert.equal(result.profilesRemaining, 1);
  assert.equal(result.devicesRemaining, 1);
});

test("a seventh person prompts a family upgrade, not location checking", () => {
  const result = evaluateHouseholdCapacity({
    planCode: "family", activeProfiles: 6, registeredDevices: 2, addProfiles: 1
  });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, "profile_limit");
  assert.equal(result.upgradeAvailable, true);
});

test("a sixth registered device exceeds the base plan", () => {
  const result = evaluateHouseholdCapacity({
    planCode: "family", activeProfiles: 3, registeredDevices: 5, addDevices: 1
  });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, "device_limit");
});

test("Family Plus allows twelve profiles and ten registered devices", () => {
  const result = evaluateHouseholdCapacity({
    planCode: "family_plus", activeProfiles: 11, registeredDevices: 9,
    addProfiles: 1, addDevices: 1
  });
  assert.equal(result.allowed, true);
  assert.equal(result.upgradeAvailable, false);
});

test("unknown or client-invented plan codes never grant capacity", () => {
  assert.equal(getHouseholdPlan("ultra"), null);
  const result = evaluateHouseholdCapacity({
    planCode: "ultra", activeProfiles: 0, registeredDevices: 0
  });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, "unknown_plan");
});

test("negative, fractional, and missing counts fail closed", () => {
  for (const value of [-1, 0.5, undefined, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => evaluateHouseholdCapacity({
      planCode: "family", activeProfiles: value, registeredDevices: 0
    }), TypeError);
  }
});

test("invites and enrolled devices store only token digests", () => {
  assert.match(migration, /token_hash text NOT NULL UNIQUE/);
  assert.match(migration, /credential_hash text NOT NULL UNIQUE/);
  assert.match(migration, /provisional_expires_at timestamptz/);
  assert.doesNotMatch(migration, /\braw_token\b|\bpassword_plaintext\b/i);
});
