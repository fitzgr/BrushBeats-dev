import test from "node:test";
import assert from "node:assert/strict";
import {
  preferLatestPreferences,
  mergePreferenceDefaults,
  preferUserScopedPreferences
} from "./preferenceFreshness.js";

const focus = (mode) => ({ "top-7": mode, "bottom-7": "none" });

test("newer local overlay selections win over an old IndexedDB mirror on refresh", () => {
  const indexed = { savedAt: 100, hygienistFocusModes: focus("none") };
  const local = { savedAt: 200, hygienistFocusModes: focus("both") };
  assert.equal(preferLatestPreferences(indexed, local), local);
  assert.equal(preferLatestPreferences(local, indexed), local);
});

test("missing legacy save timestamp does not hide recent focus changes", () => {
  const older = { hygienistFocusModes: focus("none") };
  const recent = { savedAt: 200, hygienistFocusModes: focus("back") };
  assert.equal(preferLatestPreferences(older, recent), recent);
});

test("merged user defaults preserve saved focus when older user mirror omitted the field", () => {
  const local = { savedAt: 100, hygienistFocusModes: focus("front"), brushType: "electric" };
  const userMirror = { savedAt: 100, brushingHand: "right" };
  const merged = mergePreferenceDefaults(userMirror, local);
  assert.deepEqual(merged.hygienistFocusModes, focus("front"));
  assert.equal(merged.brushingHand, "right");
});

test("an explicit none selection is preserved over an older focus selection", () => {
  const old = { savedAt: 100, hygienistFocusModes: focus("both") };
  const newValue = { savedAt: 200, hygienistFocusModes: focus("none") };
  assert.deepEqual(mergePreferenceDefaults(old, newValue).hygienistFocusModes, focus("none"));
});

test("current user's newer local snapshot wins over an older per-user database record", () => {
  const indexed = { userId: "user-a", savedAt: 100, hygienistFocusModes: focus("none") };
  const local = { userId: "user-a", savedAt: 200, hygienistFocusModes: focus("both") };
  assert.equal(preferUserScopedPreferences("user-a", indexed, local), local);
});

test("one household user's overlay cannot override another user's indexed preferences", () => {
  const indexed = { userId: "user-b", savedAt: 100, hygienistFocusModes: focus("front") };
  const local = { userId: "user-a", savedAt: 200, hygienistFocusModes: focus("both") };
  assert.equal(preferUserScopedPreferences("user-b", indexed, local), indexed);
  assert.equal(preferUserScopedPreferences("user-b", null, local), null);
});
