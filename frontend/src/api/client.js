import i18n from "../i18n.ts";
import { getHouseholdBearerToken } from "../auth/neonAuthClient";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:4000";
const REQUEST_TIMEOUT_MS = 35000;
const MUSIC_API_ENFORCED = import.meta.env.VITE_ENABLE_MUSIC_API_ENFORCEMENT === "true";

async function request(path) {
  return requestWithOptions(path);
}

async function requestWithOptions(path, options = {}) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response;

  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        ...(options.headers || {})
      }
    });
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(i18n.t("errors.backendTimeout"));
    }

    throw new Error(i18n.t("errors.backendUnavailable"));
  } finally {
    window.clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const contentType = String(response.headers.get("content-type") || "").toLowerCase();
    const isJson = contentType.includes("application/json");
    const body = isJson ? await response.json().catch(() => ({})) : {};
    const rawText = isJson ? "" : await response.text().catch(() => "");
    const statusLabel = `HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""}`;
    const messageFromBody = body.error || body.message || "";
    const detailFromBody = body.detail
      ? (typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail))
      : "";
    const rawSnippet = String(rawText || "").replace(/\s+/g, " ").trim().slice(0, 180);
    const errorMessage = messageFromBody || detailFromBody || rawSnippet || statusLabel || "Request failed";
    const error = new Error(errorMessage);
    error.status = response.status;
    error.code = body.code || null;
    error.detail = detailFromBody || rawSnippet || null;
    error.statusLabel = statusLabel;
    throw error;
  }

  return response.json();
}

export function getBpm({ top, bottom, duration }) {
  const params = new URLSearchParams({
    top: String(top),
    bottom: String(bottom),
    duration: String(duration ?? 120)
  });

  return request(`/api/bpm?${params.toString()}`);
}

export function getSongs({ bpm, tolerance, danceability, acousticness, totalTeeth, keyword, seed = 0, browserLanguage, countryCode, genreHint, ageBucket, householdId }) {
  const params = new URLSearchParams({
    bpm: String(Math.round(bpm)),
    tolerance: String(tolerance),
    danceability: String(danceability),
    acousticness: String(acousticness),
    totalTeeth: String(totalTeeth ?? 32),
    q: keyword || "",
    seed: String(seed),
    browserLanguage: browserLanguage || "",
    countryCode: countryCode || "",
    genreHint: genreHint || "",
    ageBucket: ageBucket || ""
  });

  return musicRequest(`/api/songs?${params.toString()}`, householdId);
}

export function getYoutubeVideo({ title, artist, householdId }) {
  const params = new URLSearchParams({
    title,
    artist
  });
  return musicRequest(`/api/youtube?${params.toString()}`, householdId);
}

export function searchYoutubeVideos({ query, maxResults = 8 }) {
  const params = new URLSearchParams({
    q: String(query || "").trim(),
    maxResults: String(Math.max(1, Math.min(15, Math.round(Number(maxResults) || 8))))
  });

  return musicRequest(`/api/youtube/search?${params.toString()}`, null);
}

export function getGeoCountry() {
  return request("/api/geo/country");
}

async function authenticatedHouseholdRequest(path, options = {}) {
  const token = await getHouseholdBearerToken();
  return requestWithOptions(path, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`
    }
  });
}

// When the optional music paywall is enabled, song/video search requests
// must be authorized by the server using the verified household account.
async function musicRequest(path, householdId) {
  if (!MUSIC_API_ENFORCED) return request(path);
  if (!householdId) {
    throw new Error("Sign in to a family account for music, or use the free brushing timer.");
  }
  return authenticatedHouseholdRequest(path, {
    headers: { "x-brushbeats-household": householdId }
  });
}

export function getHouseholdSnapshot(householdId) {
  return authenticatedHouseholdRequest(`/api/households/${encodeURIComponent(householdId)}`);
}

export function syncHouseholdSnapshot(householdId, payload) {
  return authenticatedHouseholdRequest(`/api/households/${encodeURIComponent(householdId)}/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export function claimHousehold({ householdId, householdName }) {
  return authenticatedHouseholdRequest(`/api/households/${encodeURIComponent(householdId)}/claim`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ householdName })
  });
}

export function getOwnedHouseholds() {
  return authenticatedHouseholdRequest("/api/households/mine");
}

// Server-owned trial/weekly-teaser status; does not itself enable checkout or music enforcement.
// Invitations remain behind an independent frontend/backend rollout flag.
export function createHouseholdInvitation(householdId, recipientEmail) {
  return authenticatedHouseholdRequest(`/api/households/${encodeURIComponent(householdId)}/invitations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recipientEmail })
  });
}

export function acceptHouseholdInvitation(token) {
  return authenticatedHouseholdRequest("/api/households/invitations/accept", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token })
  });
}

export function getHouseholdAccountMembers(householdId) {
  return authenticatedHouseholdRequest(`/api/households/${encodeURIComponent(householdId)}/account-members`);
}

export function revokeHouseholdAccountMember(householdId, accountId) {
  return authenticatedHouseholdRequest(`/api/households/${encodeURIComponent(householdId)}/account-members/${encodeURIComponent(accountId)}`, {
    method: "DELETE"
  });
}

export function getHouseholdMusicAccess(householdId) {
  return authenticatedHouseholdRequest(`/api/households/${encodeURIComponent(householdId)}/music-access`);
}

// Reserve a weekly use on the server. Do not call until a random playable track
// is available and the music API enforces the resulting entitlement.
export function reserveHouseholdWeeklyTeaser(householdId) {
  return authenticatedHouseholdRequest(`/api/households/${encodeURIComponent(householdId)}/weekly-teaser`, {
    method: "POST"
  });
}

// Server selects one tempo-matched random, playable song and atomically
// consumes a household's weekly allowance only after a video is found.
export function beginHouseholdWeeklyRandomSong(householdId, { bpm, totalTeeth }) {
  return authenticatedHouseholdRequest(`/api/households/${encodeURIComponent(householdId)}/weekly-random-song`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bpm, totalTeeth })
  });
}

export function getHouseholdEntitlement(householdId) {
  return authenticatedHouseholdRequest(`/api/households/${encodeURIComponent(householdId)}/entitlement`);
}

export function getAdminLocale(language, password) {
  return requestWithOptions(`/api/admin/locales/${encodeURIComponent(language)}`, {
    headers: {
      "x-admin-password": password
    }
  });
}

export function saveAdminLocale(language, translation, password) {
  return requestWithOptions(`/api/admin/locales/${encodeURIComponent(language)}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "x-admin-password": password
    },
    body: JSON.stringify({ translation })
  });
}
