"use strict";

// Shared, verified household access checks. Invitation acceptance alone does
// not grant read access unless the separate member rollout flag is enabled.
function membersEnabled() {
  return process.env.ENABLE_HOUSEHOLD_MEMBER_ACCESS === "true";
}

function canReadHousehold(role, record, evaluateEntitlement) {
  if (role === "owner") return true; // Preserve owner's historical read access.
  return role === "member" && membersEnabled() && evaluateEntitlement(record).allowed;
}

function canWriteHousehold(role, record, evaluateEntitlement) {
  // Invited adults have read-only cloud access until explicit device and
  // per-profile write permissions are implemented and reviewed.
  return role === "owner" && evaluateEntitlement(record).allowed;
}

async function findHouseholdAccess(client, householdId, subject, { lock = false } = {}) {
  if (!subject || !householdId) return null;
  // Before enabling member access, use only the legacy owner tables. This
  // keeps trial/cloud accounts working even if the new migration is pending.
  if (!membersEnabled()) {
    // Profile limits need the trusted server-side plan code even if invited
    // member access remains disabled. Without this, enabling just the
    // profile-limit flag would reject every owner sync as an unknown plan.
    const planColumn = process.env.ENABLE_HOUSEHOLD_PROFILE_LIMITS === "true"
      ? "s.plan_code, " : "";
    const ownerResult = await client.query(
      "SELECT h.household_id, h.household_name, h.owner_account_id, "
        + "s.trial_started_at, s.trial_ends_at, s.status, s.paid_through, "
        + planColumn + "'owner' AS role FROM households h "
        + "JOIN accounts owner ON owner.account_id = h.owner_account_id "
        + "LEFT JOIN household_subscriptions s ON s.household_id = h.household_id "
        + "WHERE h.household_id = $1 AND owner.auth_subject = $2 "
        + (lock ? "FOR UPDATE OF h" : ""),
      [householdId, subject]
    );
    return ownerResult.rows[0] || null;
  }
  const result = await client.query(
    "SELECT h.household_id, h.household_name, h.owner_account_id, "
      + "s.trial_started_at, s.trial_ends_at, s.status, s.paid_through, s.plan_code, "
      + "CASE WHEN owner.auth_subject = $2 THEN 'owner' "
      + "WHEN $3::boolean AND membership.account_id IS NOT NULL THEN 'member' ELSE NULL END AS role "
      + "FROM households h "
      + "JOIN accounts owner ON owner.account_id = h.owner_account_id "
      + "LEFT JOIN accounts requestor ON requestor.auth_subject = $2 "
      + "LEFT JOIN household_account_memberships membership "
      + "ON membership.household_id = h.household_id "
      + "AND membership.account_id = requestor.account_id "
      + "AND membership.status = 'active' "
      + "LEFT JOIN household_subscriptions s ON s.household_id = h.household_id "
      + "WHERE h.household_id = $1 "
      + "AND (owner.auth_subject = $2 OR ($3::boolean AND membership.account_id IS NOT NULL)) "
      + (lock ? "FOR UPDATE OF h" : ""),
    [householdId, subject, membersEnabled()]
  );
  return result.rows[0] || null;
}

module.exports = { findHouseholdAccess, membersEnabled, canReadHousehold, canWriteHousehold };
