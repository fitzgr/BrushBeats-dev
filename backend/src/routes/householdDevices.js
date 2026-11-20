"use strict";

const express = require("express");
const { randomBytes, createHash } = require("node:crypto");
const { requireNeonAuth } = require("../middleware/neonAuth");
const { getPool } = require("../config/database");
const { sanitizeText, isSafeIdentifier } = require("../utils/inputValidation");
const { getHouseholdPlan } = require("../services/householdPlanPolicy");
const { evaluateHouseholdEntitlement } = require("../services/subscriptionPolicy");

const router = express.Router();
const ENROLLMENT_TTL_MINUTES = 30;
const MAX_TICKETS_PER_DAY = 10;
const DEVICE_ID_RE = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;

function enabled() { return process.env.ENABLE_HOUSEHOLD_DEVICE_ENROLLMENT === "true"; }
function hashSecret(value) { return createHash("sha256").update(value, "utf8").digest("hex"); }
function validSecret(value) { return typeof value === "string" && /^[a-f0-9]{64}$/.test(value); }
function disabled(res) {
  return res.status(503).json({ code: "device_enrollment_disabled", error: "Device enrollment is not enabled." });
}
function unknown(res) {
  return res.status(404).json({ code: "not_found", error: "Household or enrollment not found" });
}
async function ownerHousehold(db, householdId, subject, lock = false) {
  const result = await db.query(
    "SELECT h.household_id, s.plan_code, s.status, s.trial_ends_at, s.paid_through "
      + "FROM households h JOIN accounts a ON a.account_id = h.owner_account_id "
      + "LEFT JOIN household_subscriptions s ON s.household_id = h.household_id "
      + "WHERE h.household_id = $1 AND a.auth_subject = $2 "
      + (lock ? "FOR UPDATE OF h" : ""),
    [householdId, subject]
  );
  return result.rows[0] || null;
}

// Redeeming a short-lived one-use ticket does NOT grant cloud household reads
// yet. The resulting credential is intended for a separately reviewed,
// device-scoped API. It is returned once and only the digest is persisted.
router.post("/devices/activate", async (req, res, next) => {
  const ticket = req.body?.ticket;
  if (!validSecret(ticket)) {
    return res.status(400).json({ code: "invalid_ticket", error: "Invalid enrollment ticket" });
  }
  if (!enabled()) return disabled(res);
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const lookup = await client.query(
      "SELECT household_id FROM household_devices WHERE credential_hash = $1 AND status = 'provisional'",
      [hashSecret(ticket)]
    );
    if (!lookup.rowCount) {
      await client.query("ROLLBACK");
      return unknown(res);
    }
    const householdId = lookup.rows[0].household_id;
    // Same lock order as issuing/revoking tickets: household, then device.
    await client.query("SELECT household_id FROM households WHERE household_id = $1 FOR UPDATE", [householdId]);
    const provisional = await client.query(
      "SELECT device_id FROM household_devices "
        + "WHERE household_id = $1 AND credential_hash = $2 AND status = 'provisional' "
        + "AND provisional_expires_at > now() FOR UPDATE",
      [householdId, hashSecret(ticket)]
    );
    if (!provisional.rowCount) {
      await client.query("ROLLBACK");
      return unknown(res);
    }
    const secret = randomBytes(32).toString("hex");
    await client.query(
      "UPDATE household_devices SET credential_hash = $2, status = 'active', "
        + "provisional_expires_at = NULL, last_seen_at = now() "
        + "WHERE device_id = $1",
      [provisional.rows[0].device_id, hashSecret(secret)]
    );
    await client.query("COMMIT");
    return res.json({
      deviceId: provisional.rows[0].device_id,
      householdId,
      credential: secret,
      access: "pending_device_scoped_rollout"
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    return next(error);
  } finally { client.release(); }
});

router.use(requireNeonAuth);

// Only the verified owner may issue child/shared-device enrollment tickets.
// Active devices and unexpired tickets both consume one plan slot.
router.post("/:householdId/devices/enrollment", async (req, res, next) => {
  const householdId = String(req.params.householdId || "");
  if (!isSafeIdentifier(householdId)) {
    return res.status(400).json({ code: "invalid_household_id", error: "Invalid household ID" });
  }
  if (!enabled()) return disabled(res);
  const label = sanitizeText(req.body?.deviceLabel || "Family device", { maxLength: 80, fallback: "Family device" });
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const owner = await ownerHousehold(client, householdId, req.authAccount.subject, true);
    if (!owner) { await client.query("ROLLBACK"); return unknown(res); }
    if (!evaluateHouseholdEntitlement(owner).allowed) {
      await client.query("ROLLBACK");
      return res.status(402).json({ code: "subscription_required", error: "A trial or subscription is required." });
    }
    const plan = getHouseholdPlan(owner.plan_code);
    if (!plan) {
      await client.query("ROLLBACK");
      return res.status(409).json({ code: "invalid_plan", error: "Household plan unavailable" });
    }
    const current = await client.query(
      "SELECT "
        + "COUNT(*) FILTER (WHERE status = 'active' OR "
        + "(status = 'provisional' AND provisional_expires_at > now()))::int AS registered, "
        + "COUNT(*) FILTER (WHERE created_at > now() - interval '24 hours')::int AS daily "
        + "FROM household_devices WHERE household_id = $1",
      [householdId]
    );
    if (current.rows[0].daily >= MAX_TICKETS_PER_DAY) {
      await client.query("ROLLBACK");
      return res.status(429).json({ code: "device_ticket_rate_limit", error: "Please try again tomorrow." });
    }
    if (current.rows[0].registered >= plan.maxRegisteredDevices) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        code: "device_limit",
        error: "Registered device limit reached. Revoke an old device or upgrade your plan.",
        limit: plan.maxRegisteredDevices
      });
    }
    const ticket = randomBytes(32).toString("hex");
    const created = await client.query(
      "INSERT INTO household_devices "
        + "(household_id, device_label, credential_hash, status, provisional_expires_at) "
        + "VALUES ($1, $2, $3, 'provisional', now() + interval '30 minutes') "
        + "RETURNING device_id, provisional_expires_at",
      [householdId, label, hashSecret(ticket)]
    );
    await client.query("COMMIT");
    return res.status(201).json({
      deviceId: created.rows[0].device_id,
      ticket,
      expiresAt: created.rows[0].provisional_expires_at,
      delivery: "manual_only"
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    return next(error);
  } finally { client.release(); }
});

router.get("/:householdId/devices", async (req, res, next) => {
  const householdId = String(req.params.householdId || "");
  if (!isSafeIdentifier(householdId)) return res.status(400).json({ error: "Invalid household ID" });
  if (!enabled()) return disabled(res);
  try {
    const pool = getPool();
    const owner = await ownerHousehold(pool, householdId, req.authAccount.subject);
    if (!owner) return unknown(res);
    const result = await pool.query(
      "SELECT device_id, device_label, status, provisional_expires_at, created_at, last_seen_at, revoked_at "
        + "FROM household_devices WHERE household_id = $1 ORDER BY created_at DESC LIMIT 100",
      [householdId]
    );
    return res.json({ devices: result.rows });
  } catch (error) { return next(error); }
});

router.delete("/:householdId/devices/:deviceId", async (req, res, next) => {
  const householdId = String(req.params.householdId || "");
  const deviceId = String(req.params.deviceId || "");
  if (!isSafeIdentifier(householdId) || !DEVICE_ID_RE.test(deviceId)) {
    return res.status(400).json({ code: "invalid_device", error: "Invalid device identifier" });
  }
  if (!enabled()) return disabled(res);
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const owner = await ownerHousehold(client, householdId, req.authAccount.subject, true);
    if (!owner) { await client.query("ROLLBACK"); return unknown(res); }
    const result = await client.query(
      "UPDATE household_devices SET status = 'revoked', revoked_at = now() "
        + "WHERE household_id = $1 AND device_id = $2::uuid AND status <> 'revoked' "
        + "RETURNING device_id",
      [householdId, deviceId]
    );
    await client.query("COMMIT");
    if (!result.rowCount) return unknown(res);
    return res.json({ revoked: true });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    return next(error);
  } finally { client.release(); }
});

module.exports = { router, validSecret, hashSecret, enabled, ENROLLMENT_TTL_MINUTES };
