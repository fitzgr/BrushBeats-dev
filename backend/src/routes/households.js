const express = require("express");
const { randomUUID } = require("node:crypto");
const { requireNeonAuth } = require("../middleware/neonAuth");
const { evaluateHouseholdEntitlement } = require("../services/subscriptionPolicy");
const { findHouseholdAccess, membersEnabled, canReadHousehold, canWriteHousehold } = require("../services/householdAccess");
const { getPool } = require("../config/database");
const { isSafeIdentifier, safeJsonByteSize, sanitizeText, toBoundedNumber } = require("../utils/inputValidation");

const router = express.Router();

router.use(requireNeonAuth);

async function getOwned(client, id, subject) {
  const result = await client.query(
    `SELECT h.household_id, h.household_name, s.trial_started_at, s.trial_ends_at,
            s.status, s.paid_through
       FROM households h
       JOIN accounts a ON a.account_id = h.owner_account_id
       LEFT JOIN household_subscriptions s ON s.household_id = h.household_id
      WHERE h.household_id = $1 AND a.auth_subject = $2`,
    [id, subject]
  );
  return result.rows[0] || null;
}

function denyNotOwned(res) {
  return res.status(404).json({ code: "household_not_found", error: "Household not found" });
}

async function ensureCloudSyncEnabled(req, res, householdId, forWrite = false) {
  const access = await findHouseholdAccess(getPool(), householdId, req.authAccount.subject);
  if (!access) {
    denyNotOwned(res);
    return false;
  }
  const entitlement = evaluateHouseholdEntitlement(access);
  if (forWrite) {
    if (access.role !== "owner") {
      res.status(403).json({ code: "owner_required", error: "Only the household owner can sync family changes" });
      return false;
    }
    if (!canWriteHousehold(access.role, access, evaluateHouseholdEntitlement)) {
      res.status(402).json({ code: "subscription_required", error: "Trial or subscription expired" });
      return false;
    }
  } else if (!canReadHousehold(access.role, access, evaluateHouseholdEntitlement)) {
    res.status(402).json({ code: "subscription_required", error: "A household subscription is required for cloud restore" });
    return false;
  }
  return true;
}

// Link a new local UUID household to the parent's verified Neon Auth identity.
// Existing households cannot be re-claimed by another account.
router.post("/:householdId/claim", async (req, res, next) => {
  const householdId = String(req.params.householdId || "");
  if (!/^household_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(householdId)) {
    return res.status(400).json({ error: "A randomly generated household ID is required" });
  }
  const name = sanitizeText(req.body?.householdName || "Brush Beats Household", { maxLength: 80, fallback: "Brush Beats Household" });
  const client = await getPool().connect();
  try {
    await client.query("begin");
    const account = await client.query(
      `INSERT INTO accounts (account_id, auth_subject, email, display_name)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (auth_subject) WHERE auth_subject IS NOT NULL
       DO UPDATE SET display_name = excluded.display_name
       RETURNING account_id`,
      ["account_" + randomUUID(), req.authAccount.subject, req.authAccount.email, req.authAccount.displayName]
    );
    // Serialize household claims by the same verified account. Concurrent
    // device requests must not grant separate sixty-day free trials.
    await client.query(
      "SELECT account_id FROM accounts WHERE account_id = $1 FOR UPDATE",
      [account.rows[0].account_id]
    );
    await client.query(
      `INSERT INTO households (household_id, household_name, owner_account_id)
       VALUES ($1, $2, $3) ON CONFLICT (household_id) DO NOTHING`,
      [householdId, name, account.rows[0].account_id]
    );
    const owned = await getOwned(client, householdId, req.authAccount.subject);
    if (!owned) {
      await client.query("rollback");
      return denyNotOwned(res);
    }
    // A verified owner receives at most one automatic 60-day trial, even if
    // they create another household ID or clear local browser storage.
    // Previously claimed households retain their existing entitlement.
    const previouslyClaimed = await client.query(
      `SELECT 1 FROM household_subscriptions s
       JOIN households h ON h.household_id = s.household_id
       WHERE h.owner_account_id = $1 AND h.household_id <> $2 LIMIT 1`,
      [account.rows[0].account_id, householdId]
    );
    if (previouslyClaimed.rowCount) {
      await client.query(
        `INSERT INTO household_subscriptions
          (household_id, status, trial_started_at, trial_ends_at)
         VALUES ($1, 'expired', now() - interval '60 days', now() - interval '1 second')
         ON CONFLICT (household_id) DO NOTHING`,
        [householdId]
      );
    } else {
      await client.query(
        `INSERT INTO household_subscriptions (household_id) VALUES ($1)
         ON CONFLICT (household_id) DO NOTHING`,
        [householdId]
      );
    }
    const updated = await getOwned(client, householdId, req.authAccount.subject);
    await client.query("commit");
    return res.json({ householdId, entitlement: evaluateHouseholdEntitlement(updated) });
  } catch (error) {
    await client.query("rollback");
    return next(error);
  } finally {
    client.release();
  }
});

router.get("/mine", async (req, res, next) => {
  try {
    const pool = getPool();
    const result = await pool.query(
      `SELECT h.household_id, h.household_name, s.status, s.trial_ends_at, s.paid_through
       FROM households h JOIN accounts a ON a.account_id = h.owner_account_id
       LEFT JOIN household_subscriptions s ON s.household_id = h.household_id
       WHERE a.auth_subject = $1 ORDER BY h.created_at ASC`,
      [req.authAccount.subject]
    );
    const ownerRows = result.rows.map((row) => ({ ...row, role: "owner" }));
    let memberRows = [];
    if (membersEnabled()) {
      const members = await pool.query(
        `SELECT h.household_id, h.household_name, s.status, s.trial_ends_at, s.paid_through
         FROM households h
         JOIN household_account_memberships m ON m.household_id = h.household_id
              AND m.status = 'active'
         JOIN accounts a ON a.account_id = m.account_id
         LEFT JOIN household_subscriptions s ON s.household_id = h.household_id
         WHERE a.auth_subject = $1 ORDER BY m.joined_at ASC`,
        [req.authAccount.subject]
      );
      // Do not offer an expired household to an invited adult for cloud restore.
      memberRows = members.rows.filter((row) => evaluateHouseholdEntitlement(row).allowed)
        .map((row) => ({ ...row, role: "member" }));
    }
    const seen = new Set();
    const households = [...ownerRows, ...memberRows]
      .filter((row) => {
        if (seen.has(row.household_id)) return false;
        seen.add(row.household_id);
        return true;
      })
      .map((row) => ({
        householdId: row.household_id,
        householdName: row.household_name,
        role: row.role,
        entitlement: evaluateHouseholdEntitlement(row)
      }));
    return res.json({ households });
  } catch (error) { return next(error); }
});

router.get("/:householdId/entitlement", async (req, res, next) => {
  if (!isSafeIdentifier(req.params.householdId, { maxLength: 64 })) {
    return res.status(400).json({ error: "Invalid household ID" });
  }
  try {
    const access = await findHouseholdAccess(getPool(), req.params.householdId, req.authAccount.subject);
    if (!access) return denyNotOwned(res);
    if (!canReadHousehold(access.role, access, evaluateHouseholdEntitlement)) {
      return res.status(402).json({ code: "subscription_required", error: "Household cloud access expired" });
    }
    return res.json({
      householdId: req.params.householdId,
      role: access.role,
      entitlement: evaluateHouseholdEntitlement(access)
    });
  } catch (error) { return next(error); }
});

function normalizeInteger(value, fallback = 0) {
  return toBoundedNumber(value, { min: 0, max: 10_000, fallback, integer: true });
}

function normalizeBoolean(value) {
  return Boolean(value);
}

function normalizeObject(value, fallback = {}) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : fallback;
}

function normalizeHouseholdSnapshot(householdId, household = {}) {
  return {
    householdId,
    householdName: sanitizeText(household.householdName || household.name || "BrushBeats Household", { maxLength: 80, fallback: "BrushBeats Household" }) || "BrushBeats Household",
    subscriptionTier: "free", // Never trust tier values supplied by the browser.
    activeUserId: household.activeUserId ? String(household.activeUserId) : null,
    migrationSource: sanitizeText(household.migrationSource || "manual", { maxLength: 32, fallback: "manual", toLowerCase: true }),
    syncStatus: "connected",
    rewardSettings: normalizeObject(household.rewardSettings),
    goalSettings: normalizeObject(household.goalSettings),
    createdAt: household.createdAt || new Date().toISOString(),
    updatedAt: household.updatedAt || new Date().toISOString()
  };
}

function normalizeMemberSnapshot(householdId, member = {}) {
  const preferences = normalizeObject(member.preferences);

  return {
    userId: sanitizeText(member.userId, { maxLength: 64 }),
    householdId,
    name: sanitizeText(member.name || "Household Member", { maxLength: 80, fallback: "Household Member" }) || "Household Member",
    avatar: member.avatar || null,
    birthYear: Number.isFinite(Number(member.birthYear)) ? Number(member.birthYear) : null,
    ageGroup: sanitizeText(member.ageGroup || member.toothStage || "unknown", { maxLength: 24, fallback: "unknown", toLowerCase: true }),
    toothStage: sanitizeText(member.toothStage || "unknown", { maxLength: 24, fallback: "unknown", toLowerCase: true }),
    topTeethCount: toBoundedNumber(member.topTeethCount, { min: 0, max: 16, fallback: 0, integer: true }),
    bottomTeethCount: toBoundedNumber(member.bottomTeethCount, { min: 0, max: 16, fallback: 0, integer: true }),
    totalTeethCount: toBoundedNumber(member.totalTeethCount, {
      min: 0,
      max: 32,
      fallback: toBoundedNumber(member.topTeethCount, { min: 0, max: 16, fallback: 0, integer: true })
        + toBoundedNumber(member.bottomTeethCount, { min: 0, max: 16, fallback: 0, integer: true }),
      integer: true
    }),
    isActive: normalizeBoolean(member.isActive),
    isArchived: normalizeBoolean(member.isArchived),
    memberPreferences: preferences,
    createdAt: member.createdAt || new Date().toISOString(),
    updatedAt: member.updatedAt || new Date().toISOString(),
    syncVersion: normalizeInteger(member.syncVersion, 1),
    isDeleted: normalizeBoolean(member.isDeleted),
    deletedAt: member.deletedAt || null
  };
}

function mapHouseholdRow(row) {
  if (!row) {
    return null;
  }

  return {
    householdId: row.household_id,
    householdName: row.household_name,
    subscriptionTier: row.subscription_tier,
    activeUserId: row.active_user_id,
    migrationSource: row.migration_source,
    syncStatus: row.sync_status,
    rewardSettings: row.reward_settings || {},
    goalSettings: row.goal_settings || {},
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at
  };
}

function mapMemberRow(row) {
  if (!row) {
    return null;
  }

  return {
    userId: row.user_id,
    householdId: row.household_id,
    name: row.name,
    avatar: row.avatar,
    birthYear: row.birth_year,
    ageGroup: row.age_group,
    toothStage: row.tooth_stage,
    topTeethCount: row.top_teeth_count,
    bottomTeethCount: row.bottom_teeth_count,
    totalTeethCount: row.total_teeth_count,
    isActive: row.is_active,
    isArchived: row.is_archived,
    preferences: row.member_preferences || {},
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
    syncVersion: row.sync_version,
    isDeleted: row.is_deleted,
    deletedAt: row.deleted_at instanceof Date ? row.deleted_at.toISOString() : row.deleted_at
  };
}

async function loadSnapshot(client, householdId) {
  const householdResult = await client.query(
    `select * from households where household_id = $1`,
    [householdId]
  );

  if (householdResult.rowCount === 0) {
    return null;
  }

  const membersResult = await client.query(
    `
      select *
      from members
      where household_id = $1 and is_deleted = false
      order by updated_at desc, created_at desc
    `,
    [householdId]
  );

  return {
    household: mapHouseholdRow(householdResult.rows[0]),
    members: membersResult.rows.map(mapMemberRow)
  };
}

router.get("/:householdId", async (req, res, next) => {
  const householdId = sanitizeText(req.params.householdId, { maxLength: 64 });

  if (!householdId || !isSafeIdentifier(householdId, { maxLength: 64 })) {
    return res.status(400).json({ error: "householdId is invalid" });
  }

  if (!await ensureCloudSyncEnabled(req, res, householdId, req.method === "POST")) {
    return;
  }

  const client = await getPool().connect();

  try {
    const snapshot = await loadSnapshot(client, householdId);

    if (!snapshot) {
      return res.status(404).json({ error: `Household not found: ${householdId}` });
    }

    return res.json(snapshot);
  } catch (error) {
    return next(error);
  } finally {
    client.release();
  }
});

router.post("/:householdId/sync", async (req, res, next) => {
  const householdId = sanitizeText(req.params.householdId, { maxLength: 64 });

  if (!householdId || !isSafeIdentifier(householdId, { maxLength: 64 })) {
    return res.status(400).json({ error: "householdId is invalid" });
  }

  if (safeJsonByteSize(req.body) > 1024 * 1024) {
    return res.status(413).json({ error: "sync payload is too large" });
  }

  if (!Array.isArray(req.body?.members) || req.body.members.length > 20) {
    return res.status(400).json({ error: "members must be an array with up to 20 entries" });
  }
  const household = normalizeHouseholdSnapshot(householdId, req.body?.household);
  const members = Array.isArray(req.body?.members)
    ? req.body.members
        .map((member) => normalizeMemberSnapshot(householdId, member))
        .filter((member) => member.userId && isSafeIdentifier(member.userId, { maxLength: 64 }))

    : [];

  if (req.body?.household?.householdId && req.body.household.householdId !== householdId) {
    return res.status(400).json({ error: "householdId path parameter does not match household payload" });
  }

  // Require ownership and a server-issued trial/subscription entitlement before accepting writes.
  if (!await ensureCloudSyncEnabled(req, res, householdId, true)) {
    return;
  }

  const client = await getPool().connect();

  try {
    await client.query("begin");

    await client.query(
      `
        insert into households (
          household_id,
          household_name,
          subscription_tier,
          active_user_id,
          migration_source,
          sync_status,
          reward_settings,
          goal_settings,
          created_at,
          updated_at
        )
        values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::timestamptz, $10::timestamptz)
        on conflict (household_id) do update set
          household_name = excluded.household_name,
          active_user_id = excluded.active_user_id,
          migration_source = excluded.migration_source,
          sync_status = excluded.sync_status,
          reward_settings = excluded.reward_settings,
          goal_settings = excluded.goal_settings,
          updated_at = excluded.updated_at
      `,
      [
        household.householdId,
        household.householdName,
        household.subscriptionTier,
        household.activeUserId,
        household.migrationSource,
        household.syncStatus,
        JSON.stringify(household.rewardSettings || {}),
        JSON.stringify(household.goalSettings || {}),
        household.createdAt,
        household.updatedAt
      ]
    );

    for (const member of members) {
      await client.query(
        `
          insert into members (
            user_id,
            household_id,
            name,
            avatar,
            birth_year,
            age_group,
            tooth_stage,
            top_teeth_count,
            bottom_teeth_count,
            total_teeth_count,
            is_active,
            is_archived,
            member_preferences,
            created_at,
            updated_at,
            sync_version,
            is_deleted,
            deleted_at
          )
          values (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
            $11, $12, $13::jsonb, $14::timestamptz, $15::timestamptz, $16, $17, $18::timestamptz
          )
          on conflict (user_id) do update set
            household_id = members.household_id,
            name = excluded.name,
            avatar = excluded.avatar,
            birth_year = excluded.birth_year,
            age_group = excluded.age_group,
            tooth_stage = excluded.tooth_stage,
            top_teeth_count = excluded.top_teeth_count,
            bottom_teeth_count = excluded.bottom_teeth_count,
            total_teeth_count = excluded.total_teeth_count,
            is_active = excluded.is_active,
            is_archived = excluded.is_archived,
            member_preferences = excluded.member_preferences,
            updated_at = excluded.updated_at,
            sync_version = excluded.sync_version,
            is_deleted = excluded.is_deleted,
            deleted_at = excluded.deleted_at
          where members.household_id = excluded.household_id
        `,
        [
          member.userId,
          member.householdId,
          member.name,
          member.avatar,
          member.birthYear,
          member.ageGroup,
          member.toothStage,
          member.topTeethCount,
          member.bottomTeethCount,
          member.totalTeethCount,
          member.isActive,
          member.isArchived,
          JSON.stringify(member.memberPreferences || {}),
          member.createdAt,
          member.updatedAt,
          member.syncVersion,
          member.isDeleted,
          member.deletedAt
        ]
      );
    }

    // Syncs are incremental: absence from an older device's snapshot does
    // not mean another device's members should be deleted. Explicit
    // isDeleted tombstones are handled by the member upsert above.

    const snapshot = await loadSnapshot(client, householdId);
    await client.query("commit");
    return res.json({ ok: true, ...snapshot });
  } catch (error) {
    await client.query("rollback");
    return next(error);
  } finally {
    client.release();
  }
});

module.exports = router;