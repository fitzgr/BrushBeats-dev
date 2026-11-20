"use strict";

const { getHouseholdPlan } = require("./householdPlanPolicy");

/**
 * Count the server-side result of an INCREMENTAL profile sync. A missing
 * profile is preserved; only explicitly archived/deleted profiles stop
 * counting. Do not trust a client-supplied total or subscription tier.
 */
function evaluateProfileSyncCapacity({ planCode, existingProfiles, incomingProfiles }) {
  const plan = getHouseholdPlan(planCode);
  if (!plan) return { allowed: false, reason: "unknown_plan" };
  if (!Array.isArray(existingProfiles) || !Array.isArray(incomingProfiles)) {
    throw new TypeError("Profile snapshots must be arrays");
  }

  const stateById = new Map();
  for (const item of existingProfiles) {
    if (typeof item?.user_id !== "string" || !item.user_id) {
      throw new TypeError("Stored profile has an invalid ID");
    }
    stateById.set(item.user_id, !(item.is_deleted || item.is_archived));
  }
  const activeBefore = [...stateById.values()].filter(Boolean).length;
  const seenIncoming = new Set();
  for (const item of incomingProfiles) {
    if (typeof item?.userId !== "string" || !item.userId) {
      throw new TypeError("Incoming profile has an invalid ID");
    }
    if (seenIncoming.has(item.userId)) {
      return { allowed: false, reason: "duplicate_profile", limit: plan.maxProfiles };
    }
    seenIncoming.add(item.userId);
    stateById.set(item.userId, !(item.isDeleted || item.isArchived));
  }

  const activeAfter = [...stateById.values()].filter(Boolean).length;
  // Legacy households already above quota can still update or archive users.
  // They cannot increase their active profile count until it fits the plan.
  return {
    allowed: activeAfter <= plan.maxProfiles || activeAfter <= activeBefore,
    reason: activeAfter > plan.maxProfiles && activeAfter > activeBefore ? "profile_limit" : null,
    activeBefore,
    activeAfter,
    limit: plan.maxProfiles
  };
}

module.exports = { evaluateProfileSyncCapacity };
