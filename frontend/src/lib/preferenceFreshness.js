/**
 * Select the freshest complete preferences snapshot. Older IndexedDB mirrors
 * must not overwrite a newer synchronous localStorage save on page reload.
 */
export function preferLatestPreferences(stored, fallback) {
  if (!stored) return fallback || null;
  if (!fallback) return stored;

  const storedAt = Number(stored.savedAt);
  const fallbackAt = Number(fallback.savedAt);
  const leftAt = Number.isFinite(storedAt) && storedAt > 0 ? storedAt : -Infinity;
  const rightAt = Number.isFinite(fallbackAt) && fallbackAt > 0 ? fallbackAt : -Infinity;

  return rightAt > leftAt ? fallback : stored;
}

/**
 * Merge older defaults only for fields genuinely absent in the latest copy.
 * An explicitly empty hygienist selection is meaningful and must win.
 */
export function mergePreferenceDefaults(userDefaults, legacyPreferences) {
  if (!userDefaults && !legacyPreferences) return null;
  if (!userDefaults) return legacyPreferences;
  if (!legacyPreferences) return userDefaults;

  const latest = preferLatestPreferences(userDefaults, legacyPreferences);
  const previous = latest === userDefaults ? legacyPreferences : userDefaults;
  return { ...previous, ...latest };
}

/** Local fallback preferences may override scoped records only for the same user. */
export function preferUserScopedPreferences(userId, scoped, fallback) {
  if (!scoped) {
    return fallback?.userId && fallback.userId !== userId ? null : fallback || null;
  }
  if (!fallback || fallback.userId !== userId) return scoped;
  return preferLatestPreferences(scoped, fallback);
}
