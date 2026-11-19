"use strict";

const { evaluateHouseholdEntitlement } = require("./subscriptionPolicy");

// Server UTC Monday calendar weeks. All devices share the same household quota.
function weekStartUtc(value = new Date()) {
  const now = new Date(value);
  if (!Number.isFinite(now.getTime())) throw new TypeError("Invalid date");
  const day = now.getUTCDay();
  const diff = (day + 6) % 7; // Monday = 0, Sunday = 6.
  const result = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - diff));
  return result.toISOString().slice(0, 10);
}

function nextWeekStartUtc(value = new Date()) {
  const start = weekStartUtc(value);
  const next = new Date(Date.parse(start + "T00:00:00.000Z") + 7 * 86400000);
  return next.toISOString();
}

/**
 * Guidance for an authenticated household. The full app does not become paid
 * without enforcing this decision on *all* playback discovery/server routes.
 * An unclaimed or unknown household never receives premium music here.
 */
function evaluateMusicAccess(subscriptionRow, hasTeaserUseThisWeek, now = new Date()) {
  if (typeof hasTeaserUseThisWeek !== "boolean") throw new TypeError("hasTeaserUseThisWeek must be boolean");
  const weekStart = weekStartUtc(now);
  const entitlement = evaluateHouseholdEntitlement(subscriptionRow, now);
  if (entitlement.allowed) {
    return {
      access: "unlimited",
      reason: entitlement.state,
      canStartMusic: true,
      canUseBasicTimer: true,
      weeklyTeaserRemaining: null,
      weekStart
    };
  }

  return {
    access: hasTeaserUseThisWeek ? "basic_only" : "weekly_teaser",
    reason: entitlement.state,
    canStartMusic: !hasTeaserUseThisWeek,
    canUseBasicTimer: true,
    weeklyTeaserRemaining: hasTeaserUseThisWeek ? 0 : 1,
    weekStart,
    nextTeaserAt: nextWeekStartUtc(now),
    showUpgradeAfterTeaser: !hasTeaserUseThisWeek
  };
}

module.exports = { weekStartUtc, nextWeekStartUtc, evaluateMusicAccess };
