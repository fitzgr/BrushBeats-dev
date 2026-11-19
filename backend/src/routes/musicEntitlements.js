"use strict";

const express = require("express");
const { requireNeonAuth } = require("../middleware/neonAuth");
const { getPool } = require("../config/database");
const { isSafeIdentifier } = require("../utils/inputValidation");
const { evaluateHouseholdEntitlement } = require("../services/subscriptionPolicy");
const { evaluateMusicAccess, weekStartUtc } = require("../services/musicTrialPolicy");

const router = express.Router();
router.use(requireNeonAuth);

function isWeeklyTeaserEnabled() {
  // Explicit rollout gate. Never silently activate new subscription rules.
  return process.env.ENABLE_WEEKLY_MUSIC_TEASER === "true";
}

async function ownedHousehold(client, householdId, subject, lock = false) {
  const sql = "SELECT h.household_id, s.status, s.trial_ends_at, s.paid_through "
    + "FROM households h "
    + "JOIN accounts a ON a.account_id = h.owner_account_id "
    + "LEFT JOIN household_subscriptions s ON s.household_id = h.household_id "
    + "WHERE h.household_id = $1 AND a.auth_subject = $2 "
    + (lock ? "FOR UPDATE OF h" : "");
  const result = await client.query(sql, [householdId, subject]);
  return result.rows[0] || null;
}

function rejectUnknownHousehold(res) {
  // Do not disclose whether someone else's household ID exists.
  return res.status(404).json({ code: "household_not_found", error: "Household not found" });
}

router.get("/:householdId/music-access", async (req, res, next) => {
  const id = String(req.params.householdId || "");
  if (!isSafeIdentifier(id, { maxLength: 64 })) {
    return res.status(400).json({ code: "invalid_household_id", error: "Invalid household ID" });
  }
  try {
    const pool = getPool();
    const owned = await ownedHousehold(pool, id, req.authAccount.subject);
    if (!owned) return rejectUnknownHousehold(res);
    const now = new Date();
    const claimed = await pool.query(
      "SELECT 1 FROM household_music_teaser_uses WHERE household_id = $1 AND week_start = $2::date",
      [id, weekStartUtc(now)]
    );
    return res.json({
      householdId: id,
      enforcementActive: isWeeklyTeaserEnabled(),
      music: evaluateMusicAccess(owned, claimed.rowCount > 0, now)
    });
  } catch (error) {
    return next(error);
  }
});

// Only reserves a teaser slot. This must NOT be used as proof of premium
// access until all music discovery/playback routes require server-granted
// access. Disabled unless explicitly configured for integration testing.
router.post("/:householdId/weekly-teaser", async (req, res, next) => {
  const id = String(req.params.householdId || "");
  if (!isSafeIdentifier(id, { maxLength: 64 })) {
    return res.status(400).json({ code: "invalid_household_id", error: "Invalid household ID" });
  }
  if (!isWeeklyTeaserEnabled()) {
    return res.status(503).json({
      code: "weekly_teaser_not_enabled",
      error: "Weekly music access is not yet available."
    });
  }

  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    // Lock ensures concurrent devices cannot both consume the weekly allowance.
    const owned = await ownedHousehold(client, id, req.authAccount.subject, true);
    if (!owned) {
      await client.query("ROLLBACK");
      return rejectUnknownHousehold(res);
    }
    const now = new Date();
    const entitlement = evaluateHouseholdEntitlement(owned, now);
    if (entitlement.allowed) {
      await client.query("COMMIT");
      return res.json({ music: evaluateMusicAccess(owned, false, now), reserved: false });
    }
    const weekStart = weekStartUtc(now);
    const row = await client.query(
      "INSERT INTO household_music_teaser_uses (household_id, week_start) "
        + "VALUES ($1, $2::date) ON CONFLICT (household_id, week_start) DO NOTHING "
        + "RETURNING household_id",
      [id, weekStart]
    );
    if (!row.rowCount) {
      await client.query("COMMIT");
      const music = evaluateMusicAccess(owned, true, now);
      return res.status(429).json({
        code: "weekly_teaser_used",
        error: "Your free music session has already been used this week.",
        music
      });
    }
    await client.query("COMMIT");
    return res.json({
      reserved: true,
      // A reservation belongs to the current week; do not trust a
      // browser-supplied week or locally edited subscription tier.
      weekStart,
      nextTeaserAt: evaluateMusicAccess(owned, true, now).nextTeaserAt
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    return next(error);
  } finally {
    client.release();
  }
});

module.exports = router;
