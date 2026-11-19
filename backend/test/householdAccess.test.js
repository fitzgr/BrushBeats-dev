"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  membersEnabled, findHouseholdAccess, canReadHousehold, canWriteHousehold
} = require("../src/services/householdAccess");
const { evaluateHouseholdEntitlement } = require("../src/services/subscriptionPolicy");
const { isMusicApiEnforced } = require("../src/middleware/musicApiAccess");

const active = { status: "trial", trial_ends_at: "2027-01-01T00:00:00Z" };
const expired = { status: "expired", trial_ends_at: "2026-01-01T00:00:00Z" };

function evaluate(record) {
  return evaluateHouseholdEntitlement(record, new Date("2026-11-19T15:00:00Z"));
}

test("verified membership access is disabled unless explicitly enabled", async () => {
  const before = process.env.ENABLE_HOUSEHOLD_MEMBER_ACCESS;
  try {
    delete process.env.ENABLE_HOUSEHOLD_MEMBER_ACCESS;
    assert.equal(membersEnabled(), false);
    let statement = "";
    const fakePool = {
      async query(sql, params) {
        statement = sql;
        assert.deepEqual(params, ["household_1", "subject_1"]);
        return { rows: [{ household_id: "household_1", role: "owner" }] };
      }
    };
    const row = await findHouseholdAccess(fakePool, "household_1", "subject_1");
    assert.equal(row.role, "owner");
    assert.doesNotMatch(statement, /household_account_memberships/);
    assert.match(statement, /owner\.auth_subject = \$2/);
    assert.equal(canReadHousehold("member", active, evaluate), false);
  } finally {
    if (before === undefined) delete process.env.ENABLE_HOUSEHOLD_MEMBER_ACCESS;
    else process.env.ENABLE_HOUSEHOLD_MEMBER_ACCESS = before;
  }
});

test("enabled member lookup requires matching subject and ACTIVE membership", async () => {
  const before = process.env.ENABLE_HOUSEHOLD_MEMBER_ACCESS;
  try {
    process.env.ENABLE_HOUSEHOLD_MEMBER_ACCESS = "true";
    let statement = "";
    const fakePool = {
      async query(sql, params) {
        statement = sql;
        assert.deepEqual(params, ["household_1", "subject_1", true]);
        return { rows: [{ household_id: "household_1", role: "member" }] };
      }
    };
    const row = await findHouseholdAccess(fakePool, "household_1", "subject_1", { lock: true });
    assert.equal(row.role, "member");
    assert.match(statement, /membership\.status = 'active'/);
    assert.match(statement, /requestor\.auth_subject = \$2/);
    assert.match(statement, /FOR UPDATE OF h/);
    assert.equal(canReadHousehold("member", active, evaluate), true);
    assert.equal(canReadHousehold("member", expired, evaluate), false);
    assert.equal(canWriteHousehold("member", active, evaluate), false);
    assert.equal(canWriteHousehold("owner", active, evaluate), true);
    assert.equal(canWriteHousehold("owner", expired, evaluate), false);
    assert.equal(canReadHousehold("owner", expired, evaluate), true);
  } finally {
    if (before === undefined) delete process.env.ENABLE_HOUSEHOLD_MEMBER_ACCESS;
    else process.env.ENABLE_HOUSEHOLD_MEMBER_ACCESS = before;
  }
});

test("new music endpoint enforcement remains disabled by default", () => {
  const before = process.env.ENABLE_MUSIC_API_ENFORCEMENT;
  try {
    delete process.env.ENABLE_MUSIC_API_ENFORCEMENT;
    assert.equal(isMusicApiEnforced(), false);
    process.env.ENABLE_MUSIC_API_ENFORCEMENT = "true";
    assert.equal(isMusicApiEnforced(), true);
  } finally {
    if (before === undefined) delete process.env.ENABLE_MUSIC_API_ENFORCEMENT;
    else process.env.ENABLE_MUSIC_API_ENFORCEMENT = before;
  }
});
