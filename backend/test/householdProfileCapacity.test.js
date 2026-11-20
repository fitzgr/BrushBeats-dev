"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { evaluateProfileSyncCapacity } = require("../src/services/householdProfileCapacity");

function check(existingProfiles, incomingProfiles, planCode = "family") {
  return evaluateProfileSyncCapacity({ planCode, existingProfiles, incomingProfiles });
}
const stored = (id, archived = false, deleted = false) =>
  ({ user_id: id, is_archived: archived, is_deleted: deleted });
const incoming = (id, archived = false, deleted = false) =>
  ({ userId: id, isArchived: archived, isDeleted: deleted });

test("six active people fit a Family household, seventh is rejected", () => {
  assert.equal(check([1, 2, 3, 4, 5].map(i => stored("u" + i)), [incoming("u6")]).allowed, true);
  const denied = check([1, 2, 3, 4, 5, 6].map(i => stored("u" + i)), [incoming("u7")]);
  assert.equal(denied.reason, "profile_limit");
  assert.equal(denied.activeAfter, 7);
  assert.equal(denied.limit, 6);
});

test("partial sync does not erase other devices' unsent profiles", () => {
  const result = check([stored("a"), stored("b"), stored("c")], [incoming("a", true)]);
  assert.equal(result.activeBefore, 3);
  assert.equal(result.activeAfter, 2);
  assert.equal(result.allowed, true);
});

test("archived or deleted profiles free a seat; restoration needs capacity", () => {
  const active = [1, 2, 3, 4, 5, 6].map(i => stored("u" + i));
  assert.equal(check(active, [incoming("u6", true), incoming("u7")]).allowed, true);
  const full = active.concat(stored("u7", true));
  assert.equal(check(full, [incoming("u7")]).reason, "profile_limit");
  assert.equal(check([stored("deleted", false, true)], [incoming("deleted")]).allowed, true);
});

test("Family Plus supports twelve profiles, but not thirteen", () => {
  const profiles = Array.from({ length: 12 }, (_, i) => stored("id" + i));
  assert.equal(check(profiles, [], "family_plus").allowed, true);
  assert.equal(check(profiles, [incoming("new")], "family_plus").reason, "profile_limit");
});

test("legacy over-cap families can reduce or edit profiles but not add more", () => {
  const old = Array.from({ length: 8 }, (_, i) => stored("id" + i));
  assert.equal(check(old, [incoming("id1")]).allowed, true);
  assert.equal(check(old, [incoming("id1", true)]).allowed, true);
  assert.equal(check(old, [incoming("extra")]).reason, "profile_limit");
});

test("invalid plan and duplicate profile IDs fail closed", () => {
  assert.equal(check([], [incoming("one")], "client_invented").reason, "unknown_plan");
  assert.equal(check([], [incoming("one"), incoming("one")]).reason, "duplicate_profile");
  assert.throws(() => check(null, []), TypeError);
});
