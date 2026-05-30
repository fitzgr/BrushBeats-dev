import { getDB, STORE_NAMES, waitForTransaction } from "./indexedDbService";
import { tryHydrateHouseholdFromCloud } from "./householdSyncService";
import { getHousehold, getAppSetting, setAppSetting, getUserById, getUsersByHousehold } from "./storeHelpers";

/**
 * Writes a founder/early-adopter record the very first time a user opens the app.
 * The record is never overwritten, so it captures the true first-install moment.
 * Fields are intentionally future-proof so a backend sync can honour them later.
 */
async function ensureFounderToken() {
  const existing = await getAppSetting("system.founderToken");
  if (existing?.value) {
    return existing.value;
  }

  const token = {
    tokenId: crypto.randomUUID(),
    tier: "founder",
    installedAt: new Date().toISOString(),
    appVersion: typeof globalThis.__APP_VERSION__ !== "undefined" ? globalThis.__APP_VERSION__ : "unknown"
  };

  await setAppSetting("system.founderToken", token);
  return token;
}

async function resolveActiveUser(household) {
  if (!household?.householdId) {
    return null;
  }

  if (household.activeUserId) {
    const activeUser = await getUserById(household.activeUserId);
    if (activeUser) {
      return activeUser;
    }
  }

  const householdUsers = await getUsersByHousehold(household.householdId);
  return householdUsers.find((item) => item.isActive) || householdUsers[0] || null;
}

export async function loadPersistedAppState(fallbackState = {}) {
  let household = await getHousehold();

  if (household?.householdId) {
    const hydrationResult = await tryHydrateHouseholdFromCloud(household.householdId);
    if (hydrationResult?.ok && hydrationResult.household?.householdId) {
      household = hydrationResult.household;
    }
  }

  const activeUser = await resolveActiveUser(household);
  const [
    storageConsent,
    storageBannerDismissed,
    legacyPreferences,
    legacyLastSession,
    legacyFavoriteSongs,
    migrationState,
    onboardingState,
    onboardingUiState,
    onboardingDraft,
    userDefaults
  ] = await Promise.all([
    getAppSetting("legacy.storageConsent"),
    getAppSetting("legacy.storageBannerDismissed"),
    getAppSetting("legacy.preferences"),
    getAppSetting("legacy.lastSession"),
    getAppSetting("legacy.favoriteSongs"),
    getAppSetting("system.phase2LegacyMigration"),
    getAppSetting("system.householdOnboarding"),
    getAppSetting("system.householdOnboardingUi"),
    getAppSetting("system.householdOnboardingDraft"),
    getAppSetting("user.defaults")
  ]);

  // Silently create a founder token on first run; never overwrites an existing one.
  const founderToken = await ensureFounderToken();

  return {
    storageConsent: storageConsent?.value || fallbackState.storageConsent || "unknown",
    storageBannerDismissed: storageBannerDismissed?.value ?? fallbackState.storageBannerDismissed ?? false,
    preferences: legacyPreferences?.value || fallbackState.preferences || null,
    lastSession: legacyLastSession?.value || fallbackState.lastSession || null,
    favoriteSongs: Array.isArray(legacyFavoriteSongs?.value)
      ? legacyFavoriteSongs.value
      : Array.isArray(fallbackState.favoriteSongs)
        ? fallbackState.favoriteSongs
        : [],
    household,
    activeUser,
    migrationState: migrationState?.value || null,
    onboardingState: onboardingState?.value || null,
    onboardingUiState: onboardingUiState?.value || null,
    onboardingDraft: onboardingDraft?.value || null,
    userDefaults: userDefaults?.value || null,
    founderToken: founderToken || null
  };
}

export async function clearPersistedPhase2Data() {
  const db = await getDB();
  const storeNames = Object.values(STORE_NAMES);
  const transaction = db.transaction(storeNames, "readwrite");

  storeNames.forEach((storeName) => {
    transaction.objectStore(storeName).clear();
  });

  await waitForTransaction(transaction);
  return true;
}