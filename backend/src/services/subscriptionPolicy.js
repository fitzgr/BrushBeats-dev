"use strict";

const DAY_MS = 24 * 60 * 60 * 1000;
const TRIAL_DAYS = 60;
const EXPIRY_REMINDER_DAYS = 7;

function asTime(value) {
  if (value === undefined || value === null || value === "") return NaN;
  return new Date(value).getTime();
}

/**
 * Return the household entitlement using server-owned billing records only.
 * The household profile's client-supplied subscription_tier is never trusted.
 */
function evaluateHouseholdEntitlement(record, now = new Date()) {
  const currentTime = asTime(now);
  if (!Number.isFinite(currentTime)) throw new Error("Invalid evaluation time");
  if (!record) {
    return { allowed: false, state: "no_subscription", reminderDue: false, trialDaysRemaining: 0 };
  }

  const paidUntil = asTime(record.paid_through ?? record.paidThrough);
  const trialUntil = asTime(record.trial_ends_at ?? record.trialEndsAt);
  const currentStatus = record.status;

  if ((currentStatus === "active" || currentStatus === "canceled") &&
      Number.isFinite(paidUntil) && paidUntil > currentTime) {
    return {
      allowed: true,
      state: "paid",
      paidThrough: new Date(paidUntil).toISOString(),
      reminderDue: false,
      trialDaysRemaining: 0
    };
  }

  if (currentStatus === "trial" && Number.isFinite(trialUntil) && trialUntil > currentTime) {
    const trialDaysRemaining = Math.ceil((trialUntil - currentTime) / DAY_MS);
    return {
      allowed: true,
      state: "trial",
      trialEndsAt: new Date(trialUntil).toISOString(),
      trialDaysRemaining,
      reminderDue: trialDaysRemaining <= EXPIRY_REMINDER_DAYS
    };
  }

  return { allowed: false, state: "expired", reminderDue: false, trialDaysRemaining: 0 };
}

module.exports = { evaluateHouseholdEntitlement, TRIAL_DAYS, EXPIRY_REMINDER_DAYS };
