const express = require("express");
const { fetchSongsByBpm } = require("../services/getSongBpmService");
const { songsCache } = require("../utils/cache");
const { getClientIp, lookupCountryByIp, normalizeCountryCode } = require("../services/geoLocationService");
const { sanitizeText, toBoundedNumber } = require("../utils/inputValidation");

const { requireMusicEntitlement } = require("../middleware/musicApiAccess");

const router = express.Router();

// Opt-in server-side entitlement gate. Disabled until family onboarding and
// weekly random-teaser flows have completed integration tests.
router.use(requireMusicEntitlement);

function seededShuffle(songs, seed) {
  if (!Array.isArray(songs) || songs.length <= 1) {
    return songs;
  }

  const items = [...songs];
  let value = Number.isFinite(seed) ? seed : 0;

  for (let i = items.length - 1; i > 0; i -= 1) {
    value = (value * 1664525 + 1013904223) % 4294967296;
    const j = value % (i + 1);
    [items[i], items[j]] = [items[j], items[i]];
  }

  return items;
}

router.get("/", async (req, res, next) => {
  try {
    const bpmRaw = Number(req.query.bpm);
    const tolerance = toBoundedNumber(req.query.tolerance, { min: 1, max: 20, fallback: 5, integer: true });
    const danceability = toBoundedNumber(req.query.danceability, { min: 0, max: 100, fallback: 50, integer: true });
    const acousticness = toBoundedNumber(req.query.acousticness, { min: 0, max: 100, fallback: 50, integer: true });
    const totalTeeth = toBoundedNumber(req.query.totalTeeth, { min: 0, max: 32, fallback: 32, integer: true });
    const keyword = sanitizeText(req.query.q, { maxLength: 80 });
    const seed = toBoundedNumber(req.query.seed, { min: 0, max: 2_147_483_647, fallback: 0, integer: true });
    const browserLanguage = sanitizeText(req.query.browserLanguage, { maxLength: 32, toLowerCase: true });
    const countryCodeInput = sanitizeText(req.query.countryCode, { maxLength: 8, toLowerCase: true });
    const genreHint = sanitizeText(req.query.genreHint, { maxLength: 40, toLowerCase: true });
    const ageBucket = sanitizeText(req.query.ageBucket, { maxLength: 16, toLowerCase: true });

    if (!Number.isFinite(bpmRaw) || bpmRaw < 40 || bpmRaw > 240) {
      return res.status(400).json({ error: "bpm query param is required" });
    }

    const bpm = Math.round(bpmRaw);

    let countryCode = normalizeCountryCode(countryCodeInput);
    let geoSource = "query";

    if (!countryCodeInput || countryCode === "--") {
      const ip = getClientIp(req);
      const geo = await lookupCountryByIp(ip);
      countryCode = normalizeCountryCode(geo.countryCode);
      geoSource = geo.source;
    }

    const cacheKey = `songs:${totalTeeth}:${bpm}:${tolerance}:${danceability}:${acousticness}:${keyword.toLowerCase()}:${seed}`;
    const contextCacheKey = `${browserLanguage.toLowerCase()}:${countryCode}:${genreHint.toLowerCase()}:${ageBucket}`;
    const fullCacheKey = `${cacheKey}:${contextCacheKey}`;
    const cached = songsCache.get(fullCacheKey);

    if (cached) {
      return res.json({ ...cached, cached: true });
    }

    const result = await fetchSongsByBpm({
      bpm,
      tolerance,
      danceability,
      acousticness,
      totalTeeth,
      keyword,
      seed,
      browserLanguage,
      countryCode,
      genreHint,
      ageBucket
    });
    const shuffled = {
      ...result,
      geoSource,
      context: {
        browserLanguage,
        countryCode,
        genreHint,
        ageBucket,
        targetBpm: Math.round(bpm),
        toothCount: totalTeeth
      },
      songs: seededShuffle(result.songs || [], seed)
    };

    songsCache.set(fullCacheKey, shuffled);
    return res.json({ ...shuffled, cached: false });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
