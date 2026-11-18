// Only send playable 11-character YouTube IDs to the IFrame Player API.
const VIDEO_ID_PATTERN = /^[a-zA-Z0-9_-]{11}$/;
const EMBED_HOSTS = new Set([
  "www.youtube.com", "youtube.com",
  "www.youtube-nocookie.com", "youtube-nocookie.com"
]);

export function normalizePlayerVideoId(value) {
  const candidate = typeof value === "string" ? value.trim() : "";
  return VIDEO_ID_PATTERN.test(candidate) ? candidate : null;
}

export function parsePlayerVideoId(playerData) {
  const directId = normalizePlayerVideoId(playerData?.videoId);
  if (directId) return directId;

  if (typeof playerData?.embedUrl !== "string") return null;

  try {
    const url = new URL(playerData.embedUrl);
    if (url.protocol !== "https:" || !EMBED_HOSTS.has(url.hostname.toLowerCase())) return null;
    const segments = url.pathname.split("/").filter(Boolean);
    if (segments.length !== 2 || segments[0] !== "embed") return null;
    return normalizePlayerVideoId(segments[1]);
  } catch {
    return null;
  }
}
