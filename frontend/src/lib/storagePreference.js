import {
  clearLegacyFavoriteSongsMirror,
  clearLegacyLastSessionMirror,
  clearLegacyPreferencesMirror,
  syncLegacyFavoriteSongs,
  syncLegacyLastSession,
  syncLegacyPreferences,
  syncLegacyStorageBannerDismissed,
  syncLegacyStorageConsent
} from "../db/legacyStorageMirror";

const STORAGE_CONSENT_KEY = "brushbeats_storage_consent";
const STORAGE_BANNER_DISMISSED_KEY = "brushbeats_storage_banner_dismissed";
const LAST_SESSION_KEY = "brushbeats_last_session_v1";
const PREFERENCES_KEY = "brushbeats_preferences_v1";
const FAVORITE_SONGS_KEY = "brushbeats_favorite_songs_v1";

const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 180;
const MAX_FAVORITE_SONGS = 25;
const LEGACY_STORAGE_KEYS = [
  STORAGE_CONSENT_KEY,
  STORAGE_BANNER_DISMISSED_KEY,
  LAST_SESSION_KEY,
  PREFERENCES_KEY,
  FAVORITE_SONGS_KEY
];

const CONSENT_STATUS = {
  granted: "granted",
  denied: "denied",
  unknown: "unknown"
};

function canUseStorage() {
  try {
    return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
  } catch {
    return false;
  }
}

function canUseCookies() {
  return typeof document !== "undefined";
}

function isIndexedDbPrimaryStorageActive() {
  return typeof window !== "undefined" && window.__brushbeatsDbStatus?.ready === true;
}

function shouldWriteCompatibilityCookie() {
  if (!canUseStorage()) {
    return true;
  }

  return !isIndexedDbPrimaryStorageActive();
}

function readCookie(name) {
  if (!canUseCookies()) {
    return null;
  }

  const prefix = `${name}=`;
  const cookie = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));

  if (!cookie) {
    return null;
  }

  return decodeURIComponent(cookie.slice(prefix.length));
}

function writeCookie(name, value) {
  if (!canUseCookies()) {
    return;
  }

  document.cookie = `${name}=${encodeURIComponent(value)}; Max-Age=${COOKIE_MAX_AGE_SECONDS}; Path=/; SameSite=Lax`;
}

function removeCookie(name) {
  if (!canUseCookies()) {
    return;
  }

  document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax`;
}

function readStoredValue(key) {
  if (canUseStorage()) {
    const value = window.localStorage.getItem(key);
    if (value) {
      return value;
    }
  }

  return readCookie(key);
}

function writeStoredValue(key, value) {
  if (canUseStorage()) {
    window.localStorage.setItem(key, value);
  }

  if (shouldWriteCompatibilityCookie()) {
    writeCookie(key, value);
    return;
  }

  removeCookie(key);
}

function removeStoredValue(key) {
  if (canUseStorage()) {
    window.localStorage.removeItem(key);
  }

  removeCookie(key);
}

function clampInteger(value, min, max, fallback) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.round(numericValue)));
}

function normalizeAgeEstimate(ageEstimate) {
  if (!ageEstimate || typeof ageEstimate !== "object") {
    return null;
  }

  const phase = typeof ageEstimate.phase === "string" ? ageEstimate.phase : undefined;
  const unit = ageEstimate.unit === "months" ? "months" : ageEstimate.unit === "years" ? "years" : undefined;

  return {
    phase,
    unit,
    minAge: Number.isFinite(Number(ageEstimate.minAge)) ? Number(ageEstimate.minAge) : undefined,
    maxAge: Number.isFinite(Number(ageEstimate.maxAge)) ? Number(ageEstimate.maxAge) : undefined
  };
}

function normalizeBpmSnapshot(snapshot, values, brushDurationSeconds) {
  if (!snapshot || typeof snapshot !== "object") {
    return null;
  }

  return {
    searchBpm: Number.isFinite(Number(snapshot.searchBpm)) ? Number(snapshot.searchBpm) : undefined,
    musicBpm: Number.isFinite(Number(snapshot.musicBpm)) ? Number(snapshot.musicBpm) : undefined,
    secondsPerTooth: Number.isFinite(Number(snapshot.secondsPerTooth)) ? Number(snapshot.secondsPerTooth) : undefined,
    transitionBufferSeconds: Number.isFinite(Number(snapshot.transitionBufferSeconds)) ? Number(snapshot.transitionBufferSeconds) : undefined,
    totalTransitions: Number.isFinite(Number(snapshot.totalTransitions)) ? Number(snapshot.totalTransitions) : undefined,
    totalToothTimeSeconds: Number.isFinite(Number(snapshot.totalToothTimeSeconds)) ? Number(snapshot.totalToothTimeSeconds) : undefined,
    totalTransitionSeconds: Number.isFinite(Number(snapshot.totalTransitionSeconds)) ? Number(snapshot.totalTransitionSeconds) : undefined,
    totalBrushingSeconds: Number.isFinite(Number(snapshot.totalBrushingSeconds)) ? Number(snapshot.totalBrushingSeconds) : brushDurationSeconds,
    totalTeeth: Number.isFinite(Number(snapshot.totalTeeth)) ? Number(snapshot.totalTeeth) : Number(values.top) + Number(values.bottom),
    ageEstimate: normalizeAgeEstimate(snapshot.ageEstimate)
  };
}

function normalizeLastSession(parsed) {
  if (!parsed || typeof parsed !== "object") {
    return null;
  }

  const song = parsed.song;
  if (!song || typeof song.title !== "string" || typeof song.artist !== "string") {
    return null;
  }

  const values = parsed.values || {};
  const filters = parsed.filters || {};
  const youtube = parsed.youtube || {};
  const normalizedValues = {
    top: clampInteger(values.top, 0, 16, 16),
    bottom: clampInteger(values.bottom, 0, 16, 16)
  };
  const normalizedBrushDurationSeconds = clampInteger(parsed.brushDurationSeconds, 90, 180, 120);

  return {
    song: {
      title: song.title,
      artist: song.artist,
      bpm: Number.isFinite(Number(song.bpm)) ? Number(song.bpm) : undefined
    },
    youtube: {
      videoId: typeof youtube.videoId === "string" ? youtube.videoId : undefined,
      embedUrl: typeof youtube.embedUrl === "string" ? youtube.embedUrl : undefined
    },
    bpmSnapshot: normalizeBpmSnapshot(parsed.bpmSnapshot, normalizedValues, normalizedBrushDurationSeconds),
    values: normalizedValues,
    filters: {
      tolerance: clampInteger(filters.tolerance, 1, 20, 4),
      danceability: clampInteger(filters.danceability, 0, 100, 50),
      acousticness: clampInteger(filters.acousticness, 0, 100, 50)
    },
    keyword: typeof parsed.keyword === "string" ? parsed.keyword : "",
    brushingHand: parsed.brushingHand === "left" ? "left" : "right",
    brushType: parsed.brushType === "electric" ? "electric" : "manual",
    rotatingStartEnabled: Boolean(parsed.rotatingStartEnabled),
    rotatingStartIndex: clampInteger(parsed.rotatingStartIndex, 0, 7, 0),
    brushDurationSeconds: normalizedBrushDurationSeconds,
    savedAt: Number.isFinite(Number(parsed.savedAt)) ? Number(parsed.savedAt) : undefined
  };
}

function normalizeSong(song) {
  if (!song || typeof song !== "object") {
    return null;
  }

  if (typeof song.title !== "string" || typeof song.artist !== "string") {
    return null;
  }

  return {
    title: song.title,
    artist: song.artist,
    bpm: Number.isFinite(Number(song.bpm)) ? Number(song.bpm) : undefined,
    savedAt: Number.isFinite(Number(song.savedAt)) ? Number(song.savedAt) : Date.now()
  };
}

function songKey(song) {
  return `${(song?.title || "").trim().toLowerCase()}::${(song?.artist || "").trim().toLowerCase()}`;
}

function normalizeFavoriteSongs(parsed) {
  if (!Array.isArray(parsed)) {
    return [];
  }

  const unique = new Map();

  for (const item of parsed) {
    const normalized = normalizeSong(item);
    if (!normalized) {
      continue;
    }

    unique.set(songKey(normalized), normalized);
  }

  return [...unique.values()]
    .sort((left, right) => (Number(right.savedAt) || 0) - (Number(left.savedAt) || 0))
    .slice(0, MAX_FAVORITE_SONGS);
}

function normalizePreferences(parsed) {
  if (!parsed || typeof parsed !== "object") {
    return null;
  }

  const values = parsed.values || {};
  const filters = parsed.filters || {};

  return {
    values: {
      top: clampInteger(values.top, 0, 16, 16),
      bottom: clampInteger(values.bottom, 0, 16, 16)
    },
    filters: {
      tolerance: clampInteger(filters.tolerance, 1, 20, 4),
      danceability: clampInteger(filters.danceability, 0, 100, 50),
      acousticness: clampInteger(filters.acousticness, 0, 100, 50)
    },
    keyword: typeof parsed.keyword === "string" ? parsed.keyword : "",
    brushingHand: parsed.brushingHand === "left" ? "left" : "right",
    brushType: parsed.brushType === "electric" ? "electric" : "manual",
    rotatingStartEnabled: Boolean(parsed.rotatingStartEnabled),
    rotatingStartIndex: clampInteger(parsed.rotatingStartIndex, 0, 7, 0),
    overlayTheme: typeof parsed.overlayTheme === "string" ? parsed.overlayTheme : "auto",
    brushDurationSeconds: clampInteger(parsed.brushDurationSeconds, 90, 180, 120),
    savedAt: Number.isFinite(Number(parsed.savedAt)) ? Number(parsed.savedAt) : undefined
  };
}

export function getStorageConsentStatus() {
  if (!canUseStorage()) {
    return CONSENT_STATUS.denied;
  }

  const stored = window.localStorage.getItem(STORAGE_CONSENT_KEY);
  if (stored === CONSENT_STATUS.granted || stored === CONSENT_STATUS.denied) {
    return stored;
  }

  return CONSENT_STATUS.unknown;
}

export function setStorageConsent(granted) {
  if (!canUseStorage()) {
    return CONSENT_STATUS.denied;
  }

  const nextStatus = granted ? CONSENT_STATUS.granted : CONSENT_STATUS.denied;
  window.localStorage.setItem(STORAGE_CONSENT_KEY, nextStatus);
  void syncLegacyStorageConsent(nextStatus);
  return nextStatus;
}

export function isStorageBannerDismissed() {
  if (!canUseStorage()) {
    return true;
  }

  return window.localStorage.getItem(STORAGE_BANNER_DISMISSED_KEY) === "true";
}

export function setStorageBannerDismissed(dismissed) {
  if (!canUseStorage()) {
    return;
  }

  if (dismissed) {
    window.localStorage.setItem(STORAGE_BANNER_DISMISSED_KEY, "true");
    void syncLegacyStorageBannerDismissed(true);
    return;
  }

  window.localStorage.removeItem(STORAGE_BANNER_DISMISSED_KEY);
  void syncLegacyStorageBannerDismissed(false);
}

export function loadLastSession() {
  try {
    const raw = readStoredValue(LAST_SESSION_KEY);
    if (!raw) {
      return null;
    }

    return normalizeLastSession(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function saveLastSession(session) {
  const normalized = normalizeLastSession(session);
  if (!normalized) {
    return false;
  }

  try {
    writeStoredValue(LAST_SESSION_KEY, JSON.stringify(normalized));
    void syncLegacyLastSession(normalized);
    return true;
  } catch {
    return false;
  }
}

export function clearLastSession() {
  removeStoredValue(LAST_SESSION_KEY);
  void clearLegacyLastSessionMirror();
}

export function loadStoredPreferences() {
  try {
    const raw = readStoredValue(PREFERENCES_KEY);
    if (!raw) {
      return null;
    }

    return normalizePreferences(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function saveStoredPreferences(preferences) {
  const normalized = normalizePreferences(preferences);
  if (!normalized) {
    return false;
  }

  try {
    writeStoredValue(PREFERENCES_KEY, JSON.stringify(normalized));
    void syncLegacyPreferences(normalized);
    return true;
  } catch {
    return false;
  }
}

export function clearStoredPreferences() {
  removeStoredValue(PREFERENCES_KEY);
  void clearLegacyPreferencesMirror();
}

export function loadFavoriteSongs() {
  try {
    const raw = readStoredValue(FAVORITE_SONGS_KEY);
    if (!raw) {
      return [];
    }

    return normalizeFavoriteSongs(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function saveFavoriteSongs(songs) {
  const normalized = normalizeFavoriteSongs(songs);

  try {
    writeStoredValue(FAVORITE_SONGS_KEY, JSON.stringify(normalized));
    void syncLegacyFavoriteSongs(normalized);
    return true;
  } catch {
    return false;
  }
}

export function addFavoriteSong(song) {
  const normalized = normalizeSong(song);
  if (!normalized) {
    return false;
  }

  const existing = loadFavoriteSongs();
  const existingWithoutSong = existing.filter((item) => songKey(item) !== songKey(normalized));
  return saveFavoriteSongs([{ ...normalized, savedAt: Date.now() }, ...existingWithoutSong]);
}

export function removeFavoriteSong(song) {
  const normalized = normalizeSong(song);
  if (!normalized) {
    return false;
  }

  const existing = loadFavoriteSongs();
  const filtered = existing.filter((item) => songKey(item) !== songKey(normalized));
  return saveFavoriteSongs(filtered);
}

export function clearFavoriteSongs() {
  removeStoredValue(FAVORITE_SONGS_KEY);
  void clearLegacyFavoriteSongsMirror();
}

export function loadLastBrushedSong() {
  return loadLastSession()?.song || null;
}

export function saveLastBrushedSong(song) {
  if (!song?.title || !song?.artist) {
    return false;
  }

  return saveLastSession({
    song,
    values: { top: 16, bottom: 16 },
    filters: { tolerance: 4, danceability: 50, acousticness: 50 },
    keyword: "",
    brushingHand: "right",
    brushType: "manual",
    rotatingStartEnabled: false,
    rotatingStartIndex: 0,
    brushDurationSeconds: 120,
    savedAt: Date.now()
  });
}

export function clearLastBrushedSong() {
  clearLastSession();
}

export function getLegacyStorageSnapshot() {
  const rawValues = Object.fromEntries(LEGACY_STORAGE_KEYS.map((key) => [key, readStoredValue(key)]));
  const preferences = loadStoredPreferences();
  const lastSession = loadLastSession();
  const favoriteSongs = loadFavoriteSongs();
  const hasImportableLegacyData = Boolean(preferences || lastSession || favoriteSongs.length > 0);

  return {
    hasLegacyData: Object.values(rawValues).some((value) => value !== null && value !== undefined && value !== ""),
    hasImportableLegacyData,
    rawValues,
    consentStatus: getStorageConsentStatus(),
    storageBannerDismissed: isStorageBannerDismissed(),
    preferences,
    lastSession,
    favoriteSongs
  };
}

export function clearLegacyCookieMirrors() {
  if (!canUseStorage()) {
    return [];
  }

  const clearedKeys = [];

  LEGACY_STORAGE_KEYS.forEach((key) => {
    if (window.localStorage.getItem(key) !== null) {
      removeCookie(key);
      clearedKeys.push(key);
    }
  });

  return clearedKeys;
}
