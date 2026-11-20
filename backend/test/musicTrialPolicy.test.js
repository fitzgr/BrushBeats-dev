"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { weekStartUtc, nextWeekStartUtc, evaluateMusicAccess } = require("../src/services/musicTrialPolicy");

const expired = {
  status: "expired",
  trial_ends_at: "2026-11-01T00:00:00Z"
};

test("UTC calendar week starts Monday, including Sunday and year boundaries", () => {
  assert.equal(weekStartUtc("2026-11-19T15:00:00Z"), "2026-11-16");
  assert.equal(weekStartUtc("2026-11-22T23:59:59Z"), "2026-11-16");
  assert.equal(weekStartUtc("2026-11-23T00:00:00Z"), "2026-11-23");
  assert.equal(weekStartUtc("2027-01-01T00:00:00Z"), "2026-12-28");
  assert.equal(nextWeekStartUtc("2026-11-19T15:00:00Z"), "2026-11-23T00:00:00.000Z");
});

test("trial users retain full access and unlimited music", () => {
  const subscription = { status: "trial", trial_ends_at: "2027-01-01T00:00:00Z" };
  const result = evaluateMusicAccess(subscription, false, new Date("2026-11-19T15:00:00Z"));
  assert.equal(result.access, "unlimited");
  assert.equal(result.canStartMusic, true);
  assert.equal(result.canUseBasicTimer, true);
});

test("current subscribers retain full access", () => {
  const subscription = { status: "active", paid_through: "2027-12-01T00:00:00Z" };
  assert.equal(evaluateMusicAccess(subscription, true, new Date("2026-11-19T15:00:00Z")).access, "unlimited");
});

test("expired household has one teaser each UTC week and basic brushing always", () => {
  const now = new Date("2026-11-19T15:00:00Z");
  const available = evaluateMusicAccess(expired, false, now);
  const used = evaluateMusicAccess(expired, true, now);
  assert.equal(available.access, "weekly_teaser");
  assert.equal(available.weeklyTeaserRemaining, 1);
  assert.equal(available.showUpgradeAfterTeaser, true);
  assert.equal(used.access, "basic_only");
  assert.equal(used.canStartMusic, false);
  assert.equal(used.weeklyTeaserRemaining, 0);
  assert.equal(used.canUseBasicTimer, true);
  assert.equal(used.nextTeaserAt, "2026-11-23T00:00:00.000Z");
});

test("unverified or unknown subscription never gets premium access", () => {
  assert.equal(evaluateMusicAccess(null, false, new Date("2026-11-19T15:00:00Z")).access, "weekly_teaser");
  assert.throws(() => evaluateMusicAccess(expired, 1), TypeError);
  assert.throws(() => weekStartUtc("not-a-date"), TypeError);
});
