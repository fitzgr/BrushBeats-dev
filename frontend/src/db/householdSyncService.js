import { nowIso } from "./indexedDbService";
import { getHouseholdSnapshot, getHouseholdEntitlement, syncHouseholdSnapshot as syncHouseholdSnapshotRequest } from "../api/client";
import { isHouseholdAuthConfigured } from "../auth/neonAuthClient";
import { STORE_NAMES } from "./indexedDbService";
import { getHousehold, getUsersByHousehold, putItem, updateHousehold } from "./storeHelpers";
import { getUserScopedState, saveUserScopedDefaults } from "./userScopedStateService";

function normalizeSubscriptionTier(value) {
  return String(value || "free").trim().toLowerCase();
}

export function hasCloudSyncAccess(subscriptionTier) {
  return normalizeSubscriptionTier(subscriptionTier) !== "free";
}

function isCloudSyncServerDenied(error) {
  return error?.code === "cloud_sync_not_enabled";
}

function normalizeRemoteHousehold(remoteHousehold = {}, existingHousehold = {}) {
  return {
    ...existingHousehold,
    householdId: remoteHousehold.householdId || existingHousehold.householdId,
    householdName: remoteHousehold.householdName || existingHousehold.householdName || "BrushBeats Household",
    createdAt: remoteHousehold.createdAt || existingHousehold.createdAt || nowIso(),
    updatedAt: remoteHousehold.updatedAt || existingHousehold.updatedAt || nowIso(),
    lastSyncedAt: nowIso(),
    subscriptionTier: remoteHousehold.subscriptionTier || existingHousehold.subscriptionTier || "free",
    activeUserId: remoteHousehold.activeUserId || existingHousehold.activeUserId || null,
    migrationSource: remoteHousehold.migrationSource || existingHousehold.migrationSource || "manual",
    syncStatus: remoteHousehold.syncStatus || existingHousehold.syncStatus || "connected",
    rewardSettings: remoteHousehold.rewardSettings || existingHousehold.rewardSettings || {},
    goalSettings: remoteHousehold.goalSettings || existingHousehold.goalSettings || {}
  };
}

function normalizeRemoteMember(remoteMember = {}, householdId, existingMember = {}) {
  return {
    ...existingMember,
    userId: remoteMember.userId || existingMember.userId,
    householdId,
    name: remoteMember.name || existingMember.name || "Household Member",
    avatar: remoteMember.avatar ?? existingMember.avatar ?? null,
    birthYear: Number.isFinite(Number(remoteMember.birthYear)) ? Number(remoteMember.birthYear) : existingMember.birthYear ?? null,
    ageGroup: remoteMember.ageGroup || existingMember.ageGroup || remoteMember.toothStage || "unknown",
    toothStage: remoteMember.toothStage || existingMember.toothStage || "unknown",
    topTeethCount: Number.isFinite(Number(remoteMember.topTeethCount)) ? Number(remoteMember.topTeethCount) : Number(existingMember.topTeethCount || 0),
    bottomTeethCount: Number.isFinite(Number(remoteMember.bottomTeethCount)) ? Number(remoteMember.bottomTeethCount) : Number(existingMember.bottomTeethCount || 0),
    totalTeethCount: Number.isFinite(Number(remoteMember.totalTeethCount))
      ? Number(remoteMember.totalTeethCount)
      : Number(existingMember.totalTeethCount || 0),
    isActive: Boolean(remoteMember.isActive),
    isArchived: Boolean(remoteMember.isArchived),
    createdAt: remoteMember.createdAt || existingMember.createdAt || nowIso(),
    updatedAt: remoteMember.updatedAt || existingMember.updatedAt || nowIso(),
    syncVersion: Number.isFinite(Number(remoteMember.syncVersion)) ? Number(remoteMember.syncVersion) : Number(existingMember.syncVersion || 1),
    isDeleted: Boolean(remoteMember.isDeleted),
    deletedAt: remoteMember.deletedAt || existingMember.deletedAt || null
  };
}

async function importHouseholdSnapshot(snapshot) {
  if (!snapshot?.household?.householdId) {
    return null;
  }

  const householdId = snapshot.household.householdId;
  const [existingHousehold, localUsers] = await Promise.all([
    getHousehold(householdId),
    getUsersByHousehold(householdId)
  ]);
  const localUsersById = new Map(localUsers.map((user) => [user.userId, user]));
  const remoteMembers = Array.isArray(snapshot.members) ? snapshot.members : [];
  const remoteMemberIds = new Set(remoteMembers.map((member) => member.userId).filter(Boolean));

  const nextHousehold = normalizeRemoteHousehold(snapshot.household, existingHousehold || {});
  await putItem(STORE_NAMES.household, nextHousehold);

  for (const remoteMember of remoteMembers) {
    const nextMember = normalizeRemoteMember(remoteMember, householdId, localUsersById.get(remoteMember.userId) || {});
    await putItem(STORE_NAMES.users, nextMember);

    if (remoteMember.preferences && typeof remoteMember.preferences === "object") {
      await saveUserScopedDefaults(remoteMember.userId, remoteMember.preferences);
    }
  }

  for (const localUser of localUsers) {
    if (remoteMemberIds.has(localUser.userId)) {
      continue;
    }

    await putItem(STORE_NAMES.users, {
      ...localUser,
      isDeleted: true,
      deletedAt: localUser.deletedAt || nowIso(),
      updatedAt: nowIso()
    });
  }

  return nextHousehold;
}

function buildMemberPreferences(defaults) {
  if (!defaults || typeof defaults !== "object") {
    return {};
  }

  return {
    preferredLanguage: defaults.preferredLanguage || "en",
    brushingHand: defaults.brushingHand || "right",
    brushType: defaults.brushType || "manual",
    brushDurationSeconds: Number(defaults.brushDurationSeconds || 120),
    keyword: defaults.keyword || "",
    filters: defaults.filters || {
      tolerance: 4,
      danceability: 50,
      acousticness: 50
    },
    values: defaults.values || {
      top: Number(defaults.topTeethCount || 0),
      bottom: Number(defaults.bottomTeethCount || 0)
    },
    savedAt: defaults.savedAt || Date.now()
  };
}

async function buildSnapshot(householdId) {
  const household = await getHousehold(householdId);
  if (!household?.householdId) {
    return null;
  }

  const users = await getUsersByHousehold(householdId);
  const members = await Promise.all(
    users
      .filter((member) => !member.isDeleted)
      .map(async (member) => {
        const scopedState = await getUserScopedState(member.userId, {});

        return {
          ...member,
          preferences: buildMemberPreferences(scopedState.defaults)
        };
      })
  );

  return {
    household,
    members
  };
}

export async function syncHouseholdSnapshot(householdId) {
  const snapshot = await buildSnapshot(householdId);
  if (!snapshot) {
    return null;
  }

  if (!isHouseholdAuthConfigured()) {
    return { ok: false, skipped: true, reason: "cloud-auth-not-configured" };
  }

  // Server-issued subscription records are the sole source of entitlement.
  // The legacy local subscriptionTier must not disable an active free trial
  // or turn an expired household back into a paying account.
  const { entitlement } = await getHouseholdEntitlement(householdId);
  if (!entitlement?.allowed) {
    await updateHousehold(householdId, { syncStatus: "subscriber-required" });
    return { ok: false, skipped: true, reason: "subscriber-required" };
  }

  const response = await syncHouseholdSnapshotRequest(householdId, snapshot);
  const syncedAt = nowIso();
  await updateHousehold(householdId, {
    syncStatus: response?.household?.syncStatus || "connected",
    lastSyncedAt: syncedAt
  });
  return {
    ...response,
    lastSyncedAt: syncedAt
  };
}

export async function trySyncHouseholdSnapshot(householdId) {
  if (!householdId) {
    return { ok: false, error: new Error("householdId is required") };
  }

  try {
    const response = await syncHouseholdSnapshot(householdId);
    if (response?.skipped) {
      return { ok: false, skipped: true, reason: response.reason, response };
    }

    return { ok: true, response };
  } catch (error) {
    await updateHousehold(householdId, {
      syncStatus: isCloudSyncServerDenied(error) ? "server-gated" : "sync-error"
    });

    return {
      ok: false,
      error,
      reason: isCloudSyncServerDenied(error) ? "server-gated" : undefined
    };
  }
}

export async function hydrateHouseholdFromCloud(householdId) {
  if (!isHouseholdAuthConfigured()) {
    return { ok: false, skipped: true, reason: "cloud-auth-not-configured" };
  }

  // Households can be restored to a new device after the verified parent
  // signs in. They need not exist in that device's local IndexedDB first.
  const snapshot = await getHouseholdSnapshot(householdId);
  const household = await importHouseholdSnapshot(snapshot);
  return {
    ok: true,
    household,
    snapshot
  };
}

export async function tryHydrateHouseholdFromCloud(householdId) {
  if (!householdId) {
    return { ok: false, skipped: true, reason: "missing-household-id" };
  }

  try {
    return await hydrateHouseholdFromCloud(householdId);
  } catch (error) {
    if (isCloudSyncServerDenied(error)) {
      await updateHousehold(householdId, {
        syncStatus: "server-gated"
      });

      return {
        ok: false,
        skipped: true,
        reason: "server-gated",
        error
      };
    }

    return {
      ok: false,
      error
    };
  }
}