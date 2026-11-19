"use strict";

// Proposed UK annual prices. These are NOT checkout prices or payment entitlements.
// The payment integration must verify plan and price server-side.
const HOUSEHOLD_PLANS = Object.freeze({
  family: Object.freeze({
    code: "family",
    name: "Brush Beats Family",
    currency: "GBP",
    annualPriceMinor: 1499,
    maxProfiles: 6,
    maxRegisteredDevices: 5
  }),
  family_plus: Object.freeze({
    code: "family_plus",
    name: "Brush Beats Family Plus",
    currency: "GBP",
    annualPriceMinor: 2499,
    maxProfiles: 12,
    maxRegisteredDevices: 10
  })
});

function getHouseholdPlan(planCode) {
  return Object.hasOwn(HOUSEHOLD_PLANS, planCode) ? HOUSEHOLD_PLANS[planCode] : null;
}

function assertNonNegativeCount(value, name) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(name + " must be a non-negative safe integer");
  }
}

/**
 * Pure capacity calculation to support a future authenticated, transactional API.
 * activeProfiles excludes deleted/archived profiles; registeredDevices counts
 * active devices plus unexpired provisional devices.
 *
 * IMPORTANT: This function by itself does not enforce a limit. The API must
 * authenticate membership, lock the household row, recount from the database,
 * then write in the same database transaction to prevent race-condition bypass.
 */
function evaluateHouseholdCapacity({
  planCode,
  activeProfiles,
  registeredDevices,
  addProfiles = 0,
  addDevices = 0
}) {
  for (const [name, value] of Object.entries({
    activeProfiles, registeredDevices, addProfiles, addDevices
  })) assertNonNegativeCount(value, name);
  const plan = getHouseholdPlan(planCode);
  if (!plan) {
    return { allowed: false, reason: "unknown_plan" };
  }
  const profilesRemaining = Math.max(0, plan.maxProfiles - activeProfiles);
  const devicesRemaining = Math.max(0, plan.maxRegisteredDevices - registeredDevices);
  const withinProfiles = addProfiles <= profilesRemaining;
  const withinDevices = addDevices <= devicesRemaining;
  return {
    allowed: withinProfiles && withinDevices,
    reason: !withinProfiles ? "profile_limit" : !withinDevices ? "device_limit" : null,
    planCode: plan.code,
    profileLimit: plan.maxProfiles,
    deviceLimit: plan.maxRegisteredDevices,
    profilesRemaining,
    devicesRemaining,
    upgradeAvailable: plan.code === "family"
  };
}

module.exports = { HOUSEHOLD_PLANS, getHouseholdPlan, evaluateHouseholdCapacity };
