"use strict";

// Staged adult household invitations. This feature is OFF by default and does
// not grant cloud sync, billing or device access to invited accounts.
const express = require("express");
const { randomBytes, randomUUID, createHash } = require("node:crypto");
const { requireNeonAuth } = require("../middleware/neonAuth");
const { getPool } = require("../config/database");
const { isSafeIdentifier, sanitizeText } = require("../utils/inputValidation");
const { evaluateHouseholdEntitlement } = require("../services/subscriptionPolicy");
const { getHouseholdPlan } = require("../services/householdPlanPolicy");

const router = express.Router();
const INVITE_TTL_HOURS = 72;
const MAX_INVITES_PER_DAY = 10;

router.use(requireNeonAuth);

function isEnabled() {
  return process.env.ENABLE_HOUSEHOLD_INVITATIONS === "true";
}

function hashInviteToken(token) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function isValidInviteToken(token) {
  return typeof token === "string" && /^[a-f0-9]{64}$/.test(token);
}

function normalizeInviteEmail(value) {
  if (typeof value !== "string" || value.length > 254) return null;
  const email = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254 ? email : null;
}

function disabled(res) {
  return res.status(503).json({
    code: "household_invitations_disabled",
    error: "Family invitations are not yet enabled."
  });
}

function notFound(res) {
  return res.status(404).json({ code: "not_found", error: "Invitation or household not found" });
}

async function ownerHousehold(client, householdId, subject, lock = false) {
  const result = await client.query(
    "SELECT h.household_id, h.owner_account_id, s.status, s.trial_ends_at, s.paid_through, s.plan_code "
      + "FROM households h JOIN accounts a ON a.account_id = h.owner_account_id "
      + "LEFT JOIN household_subscriptions s ON s.household_id = h.household_id "
      + "WHERE h.household_id = $1 AND a.auth_subject = $2 "
      + (lock ? "FOR UPDATE OF h" : ""),
    [householdId, subject]
  );
  return result.rows[0] || null;
}

// Only the verified paying owner can create an adult-account invitation.
// Child brushing profiles will use a separate owner-managed device flow.
router.post("/:householdId/invitations", async (req, res, next) => {
  const householdId = String(req.params.householdId || "");
  const email = normalizeInviteEmail(req.body?.recipientEmail);
  if (!isSafeIdentifier(householdId) || !email) {
    return res.status(400).json({ code: "invalid_invitation", error: "Valid household ID and recipient email required" });
  }
  if (!isEnabled()) return disabled(res);
  const label = sanitizeText(req.body?.recipientLabel || "", { maxLength: 80 }) || null;

  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const owner = await ownerHousehold(client, householdId, req.authAccount.subject, true);
    if (!owner) {
      await client.query("ROLLBACK");
      return notFound(res);
    }
    if (!evaluateHouseholdEntitlement(owner).allowed) {
      await client.query("ROLLBACK");
      return res.status(402).json({ code: "subscription_required", error: "An active trial or subscription is required" });
    }
    const plan = getHouseholdPlan(owner.plan_code);
    if (!plan) {
      await client.query("ROLLBACK");
      return res.status(409).json({ code: "invalid_household_plan", error: "Household plan is unavailable" });
    }
    const ownerEmail = await client.query("SELECT email FROM accounts WHERE account_id = $1", [owner.owner_account_id]);
    if (normalizeInviteEmail(ownerEmail.rows[0]?.email) === email) {
      await client.query("ROLLBACK");
      return res.status(400).json({ code: "owner_already_member", error: "Owner cannot invite themselves" });
    }

    // Locking the household ensures concurrent invite/accept transactions see
    // one coherent capacity count, including pending invitation slots.
    const counts = await client.query(
      "SELECT "
        + "(SELECT COUNT(*)::int FROM household_account_memberships "
        + " WHERE household_id = $1 AND status = 'active') AS members, "
        + "(SELECT COUNT(*)::int FROM household_invitations "
        + " WHERE household_id = $1 AND status = 'pending' AND expires_at > now()) AS pending, "
        + "(SELECT COUNT(*)::int FROM household_invitations "
        + " WHERE household_id = $1 AND created_at > now() - interval '24 hours') AS daily",
      [householdId]
    );
    const { members, pending, daily } = counts.rows[0];
    if (daily >= MAX_INVITES_PER_DAY) {
      await client.query("ROLLBACK");
      return res.status(429).json({ code: "invite_rate_limit", error: "Try inviting again tomorrow" });
    }
    if (1 + members + pending >= plan.maxProfiles) {
      await client.query("ROLLBACK");
      return res.status(409).json({ code: "invite_capacity", error: "Household invitation capacity reached" });
    }
    const duplicate = await client.query(
      "SELECT 1 FROM household_invitations WHERE household_id = $1 "
        + "AND lower(invited_email) = $2 AND status = 'pending' AND expires_at > now() LIMIT 1",
      [householdId, email]
    );
    if (duplicate.rowCount) {
      await client.query("ROLLBACK");
      return res.status(409).json({ code: "invite_pending", error: "An invitation is already pending for this account" });
    }

    const secret = randomBytes(32).toString("hex");
    const result = await client.query(
      "INSERT INTO household_invitations "
        + "(household_id, created_by_account_id, invited_email, recipient_label, token_hash, expires_at) "
        + "VALUES ($1, $2, $3, $4, $5, now() + interval '72 hours') "
        + "RETURNING invitation_id, expires_at",
      [householdId, owner.owner_account_id, email, label, hashInviteToken(secret)]
    );
    await client.query("COMMIT");
    // Return the one-use secret once to the owner; never store or log it.
    // No automatic email or link dispatch takes place in this dev milestone.
    return res.status(201).json({
      invitationId: result.rows[0].invitation_id,
      token: secret,
      expiresAt: result.rows[0].expires_at,
      delivery: "manual_only"
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    return next(error);
  } finally {
    client.release();
  }
});

router.get("/:householdId/invitations", async (req, res, next) => {
  const householdId = String(req.params.householdId || "");
  if (!isSafeIdentifier(householdId)) return res.status(400).json({ error: "Invalid household ID" });
  if (!isEnabled()) return disabled(res);
  try {
    const pool = getPool();
    const owned = await ownerHousehold(pool, householdId, req.authAccount.subject);
    if (!owned) return notFound(res);
    const result = await pool.query(
      "SELECT invitation_id, invited_email, recipient_label, status, created_at, expires_at, accepted_at "
        + "FROM household_invitations WHERE household_id = $1 ORDER BY created_at DESC LIMIT 50",
      [householdId]
    );
    return res.json({ invitations: result.rows });
  } catch (error) { return next(error); }
});

router.delete("/:householdId/invitations/:invitationId", async (req, res, next) => {
  const householdId = String(req.params.householdId || "");
  const invitationId = String(req.params.invitationId || "");
  if (!isSafeIdentifier(householdId) || !/^[a-f0-9-]{36}$/i.test(invitationId)) {
    return res.status(400).json({ error: "Invalid invitation identifier" });
  }
  if (!isEnabled()) return disabled(res);
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const owner = await ownerHousehold(client, householdId, req.authAccount.subject, true);
    if (!owner) {
      await client.query("ROLLBACK");
      return notFound(res);
    }
    const result = await client.query(
      "UPDATE household_invitations SET status = 'revoked', revoked_at = now() "
        + "WHERE household_id = $1 AND invitation_id = $2::uuid AND status = 'pending' "
        + "RETURNING invitation_id",
      [householdId, invitationId]
    );
    await client.query("COMMIT");
    if (!result.rowCount) return notFound(res);
    return res.json({ revoked: true });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    return next(error);
  } finally { client.release(); }
});

// Verified adult account must explicitly accept a one-use, email-bound token.
// Membership alone DOES NOT allow the member to read/sync household records.
router.post("/invitations/accept", async (req, res, next) => {
  const token = req.body?.token;
  if (!isValidInviteToken(token)) {
    return res.status(400).json({ code: "invalid_token", error: "Invalid invitation" });
  }
  if (!isEnabled()) return disabled(res);
  const email = normalizeInviteEmail(req.authAccount.email);
  if (!email) return res.status(403).json({ code: "verified_email_required", error: "A verified email is required" });
  const tokenHash = hashInviteToken(token);
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    // First lookup is only to discover which household row must be locked.
    const lookup = await client.query(
      "SELECT household_id FROM household_invitations WHERE token_hash = $1",
      [tokenHash]
    );
    if (!lookup.rowCount) {
      await client.query("ROLLBACK");
      return notFound(res);
    }
    const householdId = lookup.rows[0].household_id;
    const householdResult = await client.query(
      "SELECT h.household_id, h.owner_account_id, s.plan_code, s.status, s.trial_ends_at, s.paid_through "
        + "FROM households h LEFT JOIN household_subscriptions s ON s.household_id = h.household_id "
        + "WHERE h.household_id = $1 FOR UPDATE OF h",
      [householdId]
    );
    const household = householdResult.rows[0];
    if (!household || !evaluateHouseholdEntitlement(household).allowed) {
      await client.query("ROLLBACK");
      return notFound(res);
    }
    const invite = await client.query(
      "SELECT invitation_id, invited_email FROM household_invitations "
        + "WHERE token_hash = $1 AND status = 'pending' AND expires_at > now() FOR UPDATE",
      [tokenHash]
    );
    if (!invite.rowCount || normalizeInviteEmail(invite.rows[0].invited_email) !== email) {
      await client.query("ROLLBACK");
      return notFound(res);
    }
    const plan = getHouseholdPlan(household.plan_code);
    if (!plan) {
      await client.query("ROLLBACK");
      return res.status(409).json({ code: "invalid_household_plan", error: "Household plan unavailable" });
    }
    const accountResult = await client.query(
      "INSERT INTO accounts (account_id, auth_subject, email, display_name) VALUES ($1,$2,$3,$4) "
        + "ON CONFLICT (auth_subject) WHERE auth_subject IS NOT NULL "
        + "DO UPDATE SET display_name = excluded.display_name RETURNING account_id",
      ["account_" + randomUUID(), req.authAccount.subject, email, req.authAccount.displayName || null]
    );
    const accountId = accountResult.rows[0].account_id;
    if (accountId === household.owner_account_id) {
      await client.query("ROLLBACK");
      return res.status(400).json({ code: "owner_already_member", error: "Owner already belongs to this household" });
    }
    const memberResult = await client.query(
      "SELECT status FROM household_account_memberships WHERE household_id = $1 AND account_id = $2",
      [householdId, accountId]
    );
    if (memberResult.rows[0]?.status !== "active") {
      const active = await client.query(
        "SELECT COUNT(*)::int AS count FROM household_account_memberships WHERE household_id = $1 AND status = 'active'",
        [householdId]
      );
      if (1 + active.rows[0].count >= plan.maxProfiles) {
        await client.query("ROLLBACK");
        return res.status(409).json({ code: "invite_capacity", error: "Household is full" });
      }
    }
    await client.query(
      "INSERT INTO household_account_memberships "
        + "(household_id, account_id, status, invited_by_account_id, joined_at) "
        + "VALUES ($1,$2,'active',$3,now()) "
        + "ON CONFLICT (household_id, account_id) DO UPDATE SET "
        + "status = 'active', revoked_at = NULL, joined_at = now(), invited_by_account_id = excluded.invited_by_account_id",
      [householdId, accountId, household.owner_account_id]
    );
    await client.query(
      "UPDATE household_invitations SET status = 'accepted', accepted_by_account_id = $2, accepted_at = now() "
        + "WHERE invitation_id = $1",
      [invite.rows[0].invitation_id, accountId]
    );
    await client.query("COMMIT");
    return res.json({ accepted: true, householdId, access: "awaiting_member_access_rollout" });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    return next(error);
  } finally { client.release(); }
});

module.exports = { router, hashInviteToken, isValidInviteToken, normalizeInviteEmail, INVITE_TTL_HOURS };
