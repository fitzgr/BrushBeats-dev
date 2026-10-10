import { estimateAgeFromTeethFull } from "../lib/teethAge";
import { nowIso } from "./indexedDbService";
import {
  getAppSetting,
  getHousehold,
  getUserById,
  getUsersByHousehold,
  logToothChange,
  setAppSetting,
  updateUser
} from "./storeHelpers";

let mirrorQueue = Promise.resolve();

function queueMirror(operationName, operation) {
  mirrorQueue = mirrorQueue
    .catch(() => undefined)
    .then(async () => {
      try {
        await operation();
      } catch (error) {
        console.warn(`[BrushBeats DB] Failed to mirror ${operationName}.`, error);
      }
    });

  return mirrorQueue;
}

function normalizeTeethValues(values) {
  if (!values || typeof values !== "object") {
    return null;
  }

  const topTeethCount = Number(values.top);
  const bottomTeethCount = Number(values.bottom);

  if (!Number.isFinite(topTeethCount) || !Number.isFinite(bottomTeethCount)) {
    return null;
  }

  const totalTeethCount = topTeethCount + bottomTeethCount;
  const ageEstimate = estimateAgeFromTeethFull(totalTeethCount);

  return {
    topTeethCount,
    bottomTeethCount,
    totalTeethCount,
    toothStage: ageEstimate?.phase || "unknown",
    ageGroup: ageEstimate?.phase || "unknown"
  };
}

async function resolveActiveContext() {
  const household = await getHousehold();

  if (!household) {
    return { household: null, user: null };
  }

  let user = null;

  if (household.activeUserId) {
    user = await getUserById(household.activeUserId);
  }

  if (!user) {
    const householdUsers = await getUsersByHousehold(household.householdId);
    user = householdUsers.find((item) => item.isActive) || householdUsers[0] || null;
  }

  return { household, user };
}

async function syncUserToothState(values, reason) {
  const normalizedValues = normalizeTeethValues(values);
  if (!normalizedValues) {
    return;
  }

  const { household, user } = await resolveActiveContext();
  if (!household || !user) {
    return;
  }

  const hasChanged =
    Number(user.topTeethCount) !== normalizedValues.topTeethCount ||
    Number(user.bottomTeethCount) !== normalizedValues.bottomTeethCount ||
    Number(user.totalTeethCount) !== normalizedValues.totalTeethCount ||
    user.toothStage !== normalizedValues.toothStage ||
    user.ageGroup !== normalizedValues.ageGroup;

  if (!hasChanged) {
    return;
  }

  const previousTopTeethCount = Number.isFinite(Number(user.topTeethCount)) ? Number(user.topTeethCount) : null;
  const previousBottomTeethCount = Number.isFinite(Number(user.bottomTeethCount)) ? Number(user.bottomTeethCount) : null;

  await updateUser(user.userId, normalizedValues);
  await logToothChange({
    householdId: household.householdId,
    userId: user.userId,
    eventType: "manual-adjustment",
    previousTopTeethCount,
    previousBottomTeethCount,
    newTopTeethCount: normalizedValues.topTeethCount,
    newBottomTeethCount: normalizedValues.bottomTeethCount,
    previousToothStage: user.toothStage || null,
    newToothStage: normalizedValues.toothStage,
    reason,
    recordedAt: nowIso()
  });
}

async function syncUserDefaults(payload) {
  const { household, user } = await resolveActiveContext();
  if (!household || !user || !payload) {
    return;
  }

  await setAppSetting("user.defaults", {
    householdId: household.householdId,
    userId: user.userId,
    brushingHand: payload.brushingHand,
    brushType: payload.brushType,
    rotatingStartEnabled: Boolean(payload.rotatingStartEnabled),
    rotatingStartIndex: Number.isFinite(Number(payload.rotatingStartIndex)) ? Number(payload.rotatingStartIndex) : 0,
    overlayTheme: payload.overlayTheme,
    brushDurationSeconds: payload.brushDurationSeconds,
    keyword: payload.keyword,
    filters: payload.filters || null,
    values: payload.values || null,
    hygienistFocusModes: payload.hygienistFocusModes || null,
    savedAt: payload.savedAt || null
  });
}

export function syncLegacyStorageConsent(status) {
  return queueMirror("legacy.storageConsent", async () => {
    await setAppSetting("legacy.storageConsent", status);
  });
}

export function syncLegacyStorageBannerDismissed(dismissed) {
  return queueMirror("legacy.storageBannerDismissed", async () => {
    await setAppSetting("legacy.storageBannerDismissed", dismissed);
  });
}

export function syncLegacyPreferences(preferences) {
  return queueMirror("legacy.preferences", async () => {
    await setAppSetting("legacy.preferences", preferences);
    await syncUserDefaults(preferences);
    await syncUserToothState(preferences?.values, "legacy-preferences-save");
  });
}

export function clearLegacyPreferencesMirror() {
  return queueMirror("legacy.preferences.clear", async () => {
    await setAppSetting("legacy.preferences", null);
    const existingDefaults = await getAppSetting("user.defaults");

    if (existingDefaults?.value) {
      await setAppSetting("user.defaults", {
        ...existingDefaults.value,
        values: null,
        filters: null,
        keyword: "",
        savedAt: nowIso()
      });
    }
  });
}

export function syncLegacyFavoriteSongs(songs) {
  return queueMirror("legacy.favoriteSongs", async () => {
    await setAppSetting("legacy.favoriteSongs", songs || []);
  });
}

export function clearLegacyFavoriteSongsMirror() {
  return queueMirror("legacy.favoriteSongs.clear", async () => {
    await setAppSetting("legacy.favoriteSongs", []);
  });
}

export function syncLegacyLastSession(session) {
  return queueMirror("legacy.lastSession", async () => {
    await setAppSetting("legacy.lastSession", session);
    await syncUserDefaults(session);
    await syncUserToothState(session?.values, "legacy-last-session-save");
  });
}

export function clearLegacyLastSessionMirror() {
  return queueMirror("legacy.lastSession.clear", async () => {
    await setAppSetting("legacy.lastSession", null);
  });
}