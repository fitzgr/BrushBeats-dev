import {
  createPrefixedId,
  getDB,
  nowIso,
  runRequest,
  STORE_NAMES,
  waitForTransaction
} from "./indexedDbService";
import { normalizeGoalSettings, normalizeRewardSettings } from "./rewardProgressionService";

function normalizeNumber(value, fallback = 0) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : fallback;
}

function buildSyncFields() {
  const timestamp = nowIso();

  return {
    createdAt: timestamp,
    updatedAt: timestamp,
    syncVersion: 1,
    isDeleted: false,
    deletedAt: null
  };
}

async function runStoreOperation(storeNames, mode, operation) {
  const db = await getDB();
  const transaction = db.transaction(storeNames, mode);

  try {
    const result = await operation(transaction);
    await waitForTransaction(transaction);
    return result;
  } catch (error) {
    if (transaction.readyState !== "done") {
      transaction.abort();
    }

    throw error;
  }
}

async function getAllByIndex(storeName, indexName, value) {
  return runStoreOperation(storeName, "readonly", async (transaction) => {
    const store = transaction.objectStore(storeName);
    return runRequest(store.index(indexName).getAll(IDBKeyRange.only(value)));
  });
}

function sortDescendingByDate(items, key) {
  return [...items].sort((left, right) => String(right?.[key] || "").localeCompare(String(left?.[key] || "")));
}

export async function addItem(storeName, item) {
  return runStoreOperation(storeName, "readwrite", async (transaction) => {
    const store = transaction.objectStore(storeName);
    return runRequest(store.add(item));
  });
}

export async function putItem(storeName, item) {
  return runStoreOperation(storeName, "readwrite", async (transaction) => {
    const store = transaction.objectStore(storeName);
    return runRequest(store.put(item));
  });
}

export async function getItem(storeName, key) {
  return runStoreOperation(storeName, "readonly", async (transaction) => {
    const store = transaction.objectStore(storeName);
    return runRequest(store.get(key));
  });
}

export async function getAllItems(storeName) {
  return runStoreOperation(storeName, "readonly", async (transaction) => {
    const store = transaction.objectStore(storeName);
    return runRequest(store.getAll());
  });
}

export async function deleteItem(storeName, key) {
  return runStoreOperation(storeName, "readwrite", async (transaction) => {
    const store = transaction.objectStore(storeName);
    await runRequest(store.delete(key));
    return true;
  });
}

export async function createHousehold(input = {}) {
  const timestamp = nowIso();
  const household = {
    householdId: input.householdId || createPrefixedId("household"),
    householdName: input.householdName || "My Brush Beats Household",
    createdAt: input.createdAt || timestamp,
    updatedAt: input.updatedAt || timestamp,
    lastSyncedAt: input.lastSyncedAt || null,
    subscriptionTier: input.subscriptionTier || "free",
    activeUserId: input.activeUserId || null,
    migrationSource: input.migrationSource || "manual",
    syncStatus: input.syncStatus || "local-only",
    rewardSettings: normalizeRewardSettings(input.rewardSettings),
    goalSettings: normalizeGoalSettings(input.goalSettings)
  };

  await putItem(STORE_NAMES.household, household);
  return household;
}

export async function getHousehold(householdId) {
  if (householdId) {
    return getItem(STORE_NAMES.household, householdId);
  }

  const households = await getAllItems(STORE_NAMES.household);
  return households[0] || null;
}

export async function updateHousehold(householdId, updates = {}) {
  const existingHousehold = await getHousehold(householdId);
  if (!existingHousehold) {
    throw new Error(`Household not found: ${householdId}`);
  }

  const updatedHousehold = {
    ...existingHousehold,
    ...updates,
    householdId: existingHousehold.householdId,
    updatedAt: nowIso()
  };

  await putItem(STORE_NAMES.household, updatedHousehold);
  return updatedHousehold;
}

export async function createUser(input = {}) {
  const baseFields = buildSyncFields();
  const userId = input.userId || createPrefixedId("user");
  const householdId = input.householdId;
  const user = {
    name: input.name || "New User",
    avatar: input.avatar || null,
    birthYear: input.birthYear || null,
    ageGroup: input.ageGroup || "unknown",
    toothStage: input.toothStage || "unknown",
    topTeethCount: normalizeNumber(input.topTeethCount, 0),
    bottomTeethCount: normalizeNumber(input.bottomTeethCount, 0),
    totalTeethCount:
      normalizeNumber(input.totalTeethCount, normalizeNumber(input.topTeethCount, 0) + normalizeNumber(input.bottomTeethCount, 0)),
    isActive: Boolean(input.isActive),
    ...baseFields,
    ...input,
    userId,
    householdId,
    createdAt: input.createdAt || baseFields.createdAt,
    updatedAt: input.updatedAt || baseFields.updatedAt,
    syncVersion: input.syncVersion || baseFields.syncVersion,
    isDeleted: input.isDeleted ?? baseFields.isDeleted,
    deletedAt: input.deletedAt ?? baseFields.deletedAt
  };

  await putItem(STORE_NAMES.users, user);
  return user;
}

export async function updateUser(userId, updates = {}) {
  const existingUser = await getUserById(userId);
  if (!existingUser) {
    throw new Error(`User not found: ${userId}`);
  }

  const updatedUser = {
    ...existingUser,
    ...updates,
    userId: existingUser.userId,
    householdId: updates.householdId || existingUser.householdId,
    updatedAt: nowIso(),
    syncVersion: normalizeNumber(existingUser.syncVersion, 1) + 1
  };

  if (!updates.totalTeethCount) {
    updatedUser.totalTeethCount = normalizeNumber(updatedUser.topTeethCount, 0) + normalizeNumber(updatedUser.bottomTeethCount, 0);
  }

  await putItem(STORE_NAMES.users, updatedUser);
  return updatedUser;
}

export async function getUserById(userId) {
  return getItem(STORE_NAMES.users, userId);
}

export async function getUsersByHousehold(householdId) {
  const users = await getAllByIndex(STORE_NAMES.users, "householdId", householdId);
  return sortDescendingByDate(users, "updatedAt");
}

export async function setActiveUser(userId, householdId) {
  return runStoreOperation([STORE_NAMES.users, STORE_NAMES.household], "readwrite", async (transaction) => {
    const userStore = transaction.objectStore(STORE_NAMES.users);
    const householdStore = transaction.objectStore(STORE_NAMES.household);
    const household = await runRequest(householdStore.get(householdId));
    const householdUsers = await runRequest(userStore.index("householdId").getAll(IDBKeyRange.only(householdId)));
    const nextUpdatedAt = nowIso();

    householdUsers.forEach((user) => {
      userStore.put({
        ...user,
        isActive: user.userId === userId,
        updatedAt: nextUpdatedAt,
        syncVersion: normalizeNumber(user.syncVersion, 1) + 1
      });
    });

    if (household) {
      householdStore.put({
        ...household,
        activeUserId: userId,
        updatedAt: nextUpdatedAt
      });
    }

    return { householdId, userId };
  });
}

export async function logToothChange(input = {}) {
  const baseFields = buildSyncFields();
  const toothHistoryRecord = {
    toothHistoryId: input.toothHistoryId || createPrefixedId("toothhist"),
    userId: input.userId,
    householdId: input.householdId,
    eventType: input.eventType || "manual-adjustment",
    previousTopTeethCount: input.previousTopTeethCount ?? null,
    previousBottomTeethCount: input.previousBottomTeethCount ?? null,
    newTopTeethCount: input.newTopTeethCount ?? null,
    newBottomTeethCount: input.newBottomTeethCount ?? null,
    previousToothStage: input.previousToothStage || null,
    newToothStage: input.newToothStage || null,
    reason: input.reason || "manual-update",
    recordedAt: input.recordedAt || nowIso(),
    createdAt: input.createdAt || baseFields.createdAt,
    syncVersion: input.syncVersion || baseFields.syncVersion,
    isDeleted: input.isDeleted ?? baseFields.isDeleted,
    deletedAt: input.deletedAt ?? baseFields.deletedAt
  };

  await putItem(STORE_NAMES.toothHistory, toothHistoryRecord);
  return toothHistoryRecord;
}

export async function getToothHistoryByUser(userId) {
  const records = await getAllByIndex(STORE_NAMES.toothHistory, "userId", userId);
  return sortDescendingByDate(records, "recordedAt");
}

export async function createBrushingSession(input = {}) {
  const baseFields = buildSyncFields();
  const brushingSession = {
    sessionId: input.sessionId || createPrefixedId("session"),
    userId: input.userId,
    householdId: input.householdId,
    sessionType: input.sessionType || "brushing",
    startedAt: input.startedAt || nowIso(),
    completedAt: input.completedAt || null,
    durationSeconds: normalizeNumber(input.durationSeconds, 0),
    targetDurationSeconds: normalizeNumber(input.targetDurationSeconds, 120),
    songId: input.songId || null,
    songTitle: input.songTitle || null,
    artistName: input.artistName || null,
    bpmUsed: normalizeNumber(input.bpmUsed, 0),
    topTeethCount: normalizeNumber(input.topTeethCount, 0),
    bottomTeethCount: normalizeNumber(input.bottomTeethCount, 0),
    totalTeethCount:
      normalizeNumber(input.totalTeethCount, normalizeNumber(input.topTeethCount, 0) + normalizeNumber(input.bottomTeethCount, 0)),
    performanceRating: input.performanceRating || null,
    completed: Boolean(input.completed),
    source: input.source || "app",
    notes: input.notes || "",
    createdAt: input.createdAt || baseFields.createdAt,
    updatedAt: input.updatedAt || baseFields.updatedAt,
    syncVersion: input.syncVersion || baseFields.syncVersion,
    isDeleted: input.isDeleted ?? baseFields.isDeleted,
    deletedAt: input.deletedAt ?? baseFields.deletedAt
  };

  await putItem(STORE_NAMES.brushingSessions, brushingSession);
  return brushingSession;
}

export async function getSessionsByUser(userId) {
  const sessions = await getAllByIndex(STORE_NAMES.brushingSessions, "userId", userId);
  return sortDescendingByDate(sessions, "startedAt");
}

export async function getRecentSessionsByUser(userId, limit = 5) {
  const sessions = await getSessionsByUser(userId);
  return sessions.slice(0, limit);
}

export async function createAchievement(input = {}) {
  const baseFields = buildSyncFields();
  const achievement = {
    achievementId: input.achievementId || createPrefixedId("achievement"),
    userId: input.userId,
    householdId: input.householdId,
    achievementType: input.achievementType || "milestone",
    title: input.title || "Achievement",
    description: input.description || "",
    tier: input.tier || "bronze",
    category: input.category || "consistency",
    awardedAt: input.awardedAt || nowIso(),
    relatedSessionId: input.relatedSessionId || null,
    sourceEventType: input.sourceEventType || null,
    sourceEventId: input.sourceEventId || null,
    sourceEventAt: input.sourceEventAt || null,
    sourceContext: input.sourceContext || null,
    progressValue: normalizeNumber(input.progressValue, 0),
    pointsAwarded: normalizeNumber(input.pointsAwarded, 0),
    isSeen: Boolean(input.isSeen),
    createdAt: input.createdAt || baseFields.createdAt,
    updatedAt: input.updatedAt || baseFields.updatedAt,
    syncVersion: input.syncVersion || baseFields.syncVersion,
    isDeleted: input.isDeleted ?? baseFields.isDeleted,
    deletedAt: input.deletedAt ?? baseFields.deletedAt
  };

  await putItem(STORE_NAMES.achievements, achievement);
  return achievement;
}

export async function getAchievementsByUser(userId) {
  const achievements = await getAllByIndex(STORE_NAMES.achievements, "userId", userId);
  return sortDescendingByDate(achievements, "awardedAt");
}

export async function setAppSetting(settingKey, value) {
  const nextSetting = {
    settingKey,
    value,
    updatedAt: nowIso()
  };

  await putItem(STORE_NAMES.appSettings, nextSetting);
  return nextSetting;
}

export async function getAppSetting(settingKey) {
  return getItem(STORE_NAMES.appSettings, settingKey);
}

export async function logMigration(input = {}) {
  const migrationEntry = {
    migrationId: input.migrationId || createPrefixedId("migration"),
    migrationType: input.migrationType || "manual",
    fromVersion: normalizeNumber(input.fromVersion, 0),
    toVersion: normalizeNumber(input.toVersion, 0),
    status: input.status || "started",
    details: input.details || "",
    ranAt: input.ranAt || nowIso()
  };

  await putItem(STORE_NAMES.migrationLog, migrationEntry);
  return migrationEntry;
}