"use strict";

// When enabled, Brush Beats' song discovery and YouTube lookup routes are
// premium/trial-only. Expired households obtain their one weekly random song
// via the separate server-selected teaser endpoint, never these open routes.
// This does not and cannot restrict a URL played independently on YouTube.
const { requireNeonAuth } = require("./neonAuth");
const { getPool } = require("../config/database");
const { isSafeIdentifier } = require("../utils/inputValidation");
const { findHouseholdAccess } = require("../services/householdAccess");
const { evaluateHouseholdEntitlement } = require("../services/subscriptionPolicy");

function isMusicApiEnforced() {
  return process.env.ENABLE_MUSIC_API_ENFORCEMENT === "true";
}

function requireMusicEntitlement(req, res, next) {
  if (!isMusicApiEnforced()) return next();

  return requireNeonAuth(req, res, async (error) => {
    if (error) return next(error);
    const householdId = req.get("x-brushbeats-household");
    if (!isSafeIdentifier(householdId, { maxLength: 64 })) {
      return res.status(400).json({
        code: "household_required",
        error: "A signed-in household is required for music. The basic brushing timer remains free."
      });
    }
    try {
      const household = await findHouseholdAccess(getPool(), householdId, req.authAccount.subject);
      if (!household) {
        return res.status(404).json({ code: "household_not_found", error: "Household not found" });
      }
      if (!evaluateHouseholdEntitlement(household).allowed) {
        return res.status(402).json({
          code: "weekly_teaser_only",
          error: "Your trial has ended. Use your weekly random song or brush without music.",
          basicBrushingAvailable: true
        });
      }
      return next();
    } catch (error) { return next(error); }
  });
}

module.exports = { isMusicApiEnforced, requireMusicEntitlement };
