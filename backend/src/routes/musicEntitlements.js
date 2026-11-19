"use strict";

const express = require("express");
const { randomInt } = require("node:crypto");
const { requireNeonAuth } = require("../middleware/neonAuth");
const { getPool } = require("../config/database");
const { isSafeIdentifier } = require("../utils/inputValidation");
const { evaluateHouseholdEntitlement } = require("../services/subscriptionPolicy");
const { evaluateMusicAccess, weekStartUtc } = require("../services/musicTrialPolicy");
const { findHouseholdAccess } = require("../services/householdAccess");
const { isMusicApiEnforced } = require("../middleware/musicApiAccess");
const { fetchSongsByBpm } = require("../services/getSongBpmService");
const { searchYoutubeVideo } = require("../services/youtubeService");

const router = express.Router();
router.use(requireNeonAuth);

function isWeeklyTeaserEnabled() {
  // Explicit rollout gate. Never silently activate new subscription rules.
  return process.env.ENABLE_WEEKLY_MUSIC_TEASER === "true";
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
    const owned = await findHouseholdAccess(pool, id, req.authAccount.subject);
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

// Random playable song is chosen by the server BEFORE consuming the weekly
// allowance. A unique DB key then prevents two household devices from spending
// the same calendar-week allowance simultaneously. External YouTube playback
// is not DRM and remains beyond Brush Beats' control.
router.post("/:householdId/weekly-random-song", async (req, res, next) => {
  const householdId = String(req.params.householdId || "");
  if (!isSafeIdentifier(householdId, { maxLength: 64 })) {
    return res.status(400).json({ code: "invalid_household_id", error: "Invalid household ID" });
  }
  if (!isWeeklyTeaserEnabled() || !isMusicApiEnforced()) {
    return res.status(503).json({
      code: "weekly_teaser_not_enabled",
      error: "Weekly random song is not yet enabled."
    });
  }
  const bpm = Number(req.body?.bpm);
  const teeth = Number(req.body?.totalTeeth ?? 28);
  if (!Number.isFinite(bpm) || bpm < 40 || bpm > 240 ||
      !Number.isSafeInteger(teeth) || teeth < 0 || teeth > 32) {
    return res.status(400).json({ code: "invalid_music_request", error: "Valid BPM and tooth count are required" });
  }
  try {
    // Reject already-spent weeks before contacting external music services.
    const pool = getPool();
    const access = await findHouseholdAccess(pool, householdId, req.authAccount.subject);
    if (!access) return rejectUnknownHousehold(res);
    const now = new Date();
    if (evaluateHouseholdEntitlement(access, now).allowed) {
      return res.status(409).json({
        code: "music_already_unlimited",
        error: "Your subscription already includes unlimited music."
      });
    }
    const weekStart = weekStartUtc(now);
    const existing = await pool.query(
      "SELECT 1 FROM household_music_teaser_uses WHERE household_id = $1 AND week_start = $2::date",
      [householdId, weekStart]
    );
    if (existing.rowCount) {
      return res.status(429).json({
        code: "weekly_teaser_used",
        error: "Your household's weekly random music session has already been used.",
        music: evaluateMusicAccess(access, true, now)
      });
    }

    const songResult = await fetchSongsByBpm({
      bpm: Math.round(bpm),
      tolerance: 15,
      totalTeeth: teeth,
      limit: 25
    });
    const candidates = (songResult.songs || []).filter(
      (song) => song && typeof song.title === "string" && typeof song.artist === "string"
    ).slice(0, 25);
    if (!candidates.length) {
      return res.status(503).json({
        code: "music_unavailable",
        error: "No tempo-matched random music is available. Your weekly allowance was not used."
      });
    }

    // Uniform random pick without allowing the caller to choose a specific
    // title, artist or video. Retry up to three candidates if a video fails.
    let chosen = null;
    let video = null;
    for (let i = 0; i < Math.min(3, candidates.length); i += 1) {
      const song = candidates.splice(randomInt(candidates.length), 1)[0];
      try {
        const result = await searchYoutubeVideo({ title: song.title, artist: song.artist });
        if (typeof result?.videoId === "string" && /^[A-Za-z0-9_-]{11}$/.test(result.videoId)) {
          chosen = song;
          video = result;
          break;
        }
      } catch (_error) {
        // Try another candidate; do not burn a weekly use on a lookup error.
      }
    }
    if (!chosen) {
      return res.status(503).json({
        code: "video_unavailable",
        error: "No playable random music video was found. Your weekly allowance was not used."
      });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const locked = await findHouseholdAccess(client, householdId, req.authAccount.subject, { lock: true });
      if (!locked) {
        await client.query("ROLLBACK");
        return rejectUnknownHousehold(res);
      }
      if (evaluateHouseholdEntitlement(locked).allowed) {
        await client.query("ROLLBACK");
        return res.status(409).json({ code: "music_already_unlimited", error: "Full music is already available." });
      }
      const currentWeek = weekStartUtc(new Date());
      const inserted = await client.query(
        "INSERT INTO household_music_teaser_uses (household_id, week_start) "
          + "VALUES ($1, $2::date) ON CONFLICT (household_id, week_start) DO NOTHING "
          + "RETURNING household_id",
        [householdId, currentWeek]
      );
      if (!inserted.rowCount) {
        await client.query("COMMIT");
        return res.status(429).json({
          code: "weekly_teaser_used",
          error: "Your household's weekly music session has already been used."
        });
      }
      await client.query("COMMIT");
      return res.json({
        song: chosen,
        video: {
          videoId: video.videoId,
          title: video.title || chosen.title,
          channelTitle: video.channelTitle || null,
          youtubeUrl: "https://www.youtube.com/watch?v=" + video.videoId,
          embedUrl: "https://www.youtube.com/embed/" + video.videoId
        },
        musicAccess: {
          access: "weekly_teaser",
          serverConfirmed: true,
          weekStart: currentWeek,
          nextTeaserAt: evaluateMusicAccess(locked, true, new Date()).nextTeaserAt
        }
      });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      return next(error);
    } finally {
      client.release();
    }
  } catch (error) { return next(error); }
});

// Only reserves a teaser slot. This must NOT be used as proof of premium
// access until all music discovery/playback routes require server-granted
// access. Disabled unless explicitly configured for integration testing.
router.post("/:householdId/weekly-teaser", async (req, res, next) => {
  const id = String(req.params.householdId || "");
  if (!isSafeIdentifier(id, { maxLength: 64 })) {
    return res.status(400).json({ code: "invalid_household_id", error: "Invalid household ID" });
  }
  if (!isWeeklyTeaserEnabled() || isMusicApiEnforced()) {
    // When the full music gate is active, the random-song endpoint must
    // select a playable video before reserving the household allowance.
    return res.status(503).json({
      code: "weekly_teaser_not_enabled",
      error: "Use the weekly random music session instead."
    });
  }

  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    // Lock ensures concurrent devices cannot both consume the weekly allowance.
    const owned = await findHouseholdAccess(client, id, req.authAccount.subject, { lock: true });
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
