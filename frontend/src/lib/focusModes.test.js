import test from "node:test";
import assert from "node:assert/strict";
import { buildFocusSurfaceModeMapFromSelector } from "./focusModes.js";

test("unselected teeth have no default hygienist focus", () => {
  assert.equal(buildFocusSurfaceModeMapFromSelector().size, 0);
  assert.equal(buildFocusSurfaceModeMapFromSelector(null).size, 0);
  assert.equal(buildFocusSurfaceModeMapFromSelector({ "top-6": "none", "bottom-7": "none" }).size, 0);
});

test("only manually selected tooth surfaces receive 1.5x attention", () => {
  const focus = buildFocusSurfaceModeMapFromSelector({
    "top-6": "front",
    "top-7": "back",
    "bottom-7": "both",
    "bottom-6": "none"
  });
  assert.deepEqual([...focus.entries()], [
    ["top:6", "front"],
    ["top:7", "back"],
    ["bottom:7", "both"]
  ]);
});

test("invalid mode and key never trigger an implicit recommended tooth", () => {
  const focus = buildFocusSurfaceModeMapFromSelector({
    "top-6": "recommendation",
    "top-7": "none",
    "bottom:7": "both",
    "other-4": "both",
    "bottom-9": "invalid"
  });
  assert.deepEqual([...focus.entries()], [["bottom:7", "both"]]);
});
