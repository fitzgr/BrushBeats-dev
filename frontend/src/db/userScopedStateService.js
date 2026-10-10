import { getAppSetting, setAppSetting } from "./storeHelpers";
import { preferUserScopedPreferences } from "../lib/preferenceFreshness";

function buildScopedKey(userId, suffix) {
  return `userState.${userId}.${suffix}`;
}

export async function getUserScopedState(userId, fallbackState = {}) {
  if (!userId) {
    return {
      defaults: fallbackState.defaults || null,
      lastSession: fallbackState.lastSession || null,
      favoriteSongs: fallbackState.favoriteSongs || []
    };
  }

  const [defaults, lastSession, favoriteSongs] = await Promise.all([
    getAppSetting(buildScopedKey(userId, "defaults")),
    getAppSetting(buildScopedKey(userId, "lastSession")),
    getAppSetting(buildScopedKey(userId, "favoriteSongs"))
  ]);

  return {
    defaults: preferUserScopedPreferences(userId, defaults?.value, fallbackState.defaults),
    lastSession: lastSession?.value || fallbackState.lastSession || null,
    favoriteSongs: Array.isArray(favoriteSongs?.value)
      ? favoriteSongs.value
      : Array.isArray(fallbackState.favoriteSongs)
        ? fallbackState.favoriteSongs
        : []
  };
}

export async function saveUserScopedDefaults(userId, value) {
  if (!userId) {
    return null;
  }

  return setAppSetting(buildScopedKey(userId, "defaults"), value);
}

export async function saveUserScopedLastSession(userId, value) {
  if (!userId) {
    return null;
  }

  return setAppSetting(buildScopedKey(userId, "lastSession"), value);
}

export async function saveUserScopedFavoriteSongs(userId, value) {
  if (!userId) {
    return null;
  }

  return setAppSetting(buildScopedKey(userId, "favoriteSongs"), value || []);
}