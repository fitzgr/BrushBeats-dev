const express = require("express");
const { searchYoutubeVideo, searchYoutubeVideosByQuery } = require("../services/youtubeService");
const { youtubeCache } = require("../utils/cache");
const { sanitizeText } = require("../utils/inputValidation");

const router = express.Router();

router.get("/search", async (req, res, next) => {
  try {
    const query = sanitizeText(req.query.q, { maxLength: 160 });
    const maxResults = Number(req.query.maxResults || 8);

    if (!query) {
      return res.status(400).json({ error: "q is required" });
    }

    const cacheKey = [
      "ytv3-search",
      query.toLowerCase(),
      Math.max(1, Math.min(15, Math.round(Number(maxResults) || 8)))
    ].join(":");
    const cached = youtubeCache.get(cacheKey);

    if (cached) {
      return res.json({ ...cached, cached: true });
    }

    const result = await searchYoutubeVideosByQuery({ query, maxResults });
    youtubeCache.set(cacheKey, result);
    return res.json({ ...result, cached: false });
  } catch (error) {
    if (error.response?.status === 403) {
      return res.status(429).json({
        error: "YouTube API quota exceeded or request blocked.",
        detail: error.response?.data
      });
    }

    return next(error);
  }
});

router.get("/", async (req, res, next) => {
  try {
    const title = sanitizeText(req.query.title, { maxLength: 120 });
    const artist = sanitizeText(req.query.artist, { maxLength: 120 });
    if (!title || !artist) {
      return res.status(400).json({ error: "title and artist are required" });
    }

    const cacheKey = [
      "ytv3",
      title.toLowerCase(),
      artist.toLowerCase()
    ].join(":");
    const cached = youtubeCache.get(cacheKey);

    if (cached) {
      return res.json({ ...cached, cached: true });
    }

    const result = await searchYoutubeVideo({ title, artist });
    const payload = {
      ...result,
      geoSource: "direct-title-artist",
      youtubeUrl: result.videoId ? `https://www.youtube.com/watch?v=${result.videoId}` : null,
      embedUrl: result.videoId ? `https://www.youtube.com/embed/${result.videoId}` : null
    };

    youtubeCache.set(cacheKey, payload);
    return res.json({ ...payload, cached: false });
  } catch (error) {
    if (error.response?.status === 403) {
      return res.status(429).json({
        error: "YouTube API quota exceeded or request blocked.",
        detail: error.response?.data
      });
    }

    return next(error);
  }
});

module.exports = router;
