import test from "node:test";
import assert from "node:assert/strict";
import { buildSegments, buildBrushingSessionTimeline } from "./brushingTimeline.js";
import { getToothSurfaceVisualState } from "./brushingSurfaceState.js";

const focusModes = new Map([["top:0", "both"], ["bottom:2", "front"]]);
const timeline = buildBrushingSessionTimeline({
  segments: buildSegments(8, 8),
  baseDurationSeconds: 120,
  secondsPerTooth: 2,
  focusModes,
  extendEnabled: true
});
const firstStart = timeline.find((entry) => entry.transitionCue === "extendStart");
const focusEntries = timeline.filter((entry) => entry.type === "tooth" && entry.pass === "extend");
const state = (elapsedSeconds, jaw, mapIndex, surface, extendPassStarted = elapsedSeconds >= firstStart.startsAt) =>
  getToothSurfaceVisualState({ timeline, elapsedSeconds, jaw, mapIndex, surface, focusSurfaceModes: focusModes, extendPassStarted });

test("Extra Care surfaces reset to gray immediately at Extend start cue", () => {
  assert.ok(Math.abs(firstStart.startsAt - 120) < 1e-7);
  assert.deepEqual(state(firstStart.startsAt - 0.001, "top", 0, "front"), { brushed: true, extendPending: false });
  assert.deepEqual(state(firstStart.startsAt, "top", 0, "front"), { brushed: false, extendPending: true });
  assert.deepEqual(state(firstStart.startsAt, "top", 0, "back"), { brushed: false, extendPending: true });
  assert.deepEqual(state(firstStart.startsAt, "bottom", 2, "front"), { brushed: false, extendPending: true });
  // An unselected face of a partially focused tooth stays clean.
  assert.deepEqual(state(firstStart.startsAt, "bottom", 2, "back"), { brushed: true, extendPending: false });
  assert.deepEqual(state(firstStart.startsAt, "top", 1, "front"), { brushed: true, extendPending: false });
});

test("Focused surfaces become clean only after their own Extend entry ends", () => {
  const first = focusEntries[0];
  const other = focusEntries[1];
  assert.deepEqual(state(first.startsAt + 0.01, first.jaw, first.mapIndex, first.surface),
    { brushed: false, extendPending: true });
  assert.deepEqual(state(first.endsAt, first.jaw, first.mapIndex, first.surface),
    { brushed: true, extendPending: false });
  assert.deepEqual(state(first.endsAt, other.jaw, other.mapIndex, other.surface),
    { brushed: false, extendPending: true });
  for (const entry of focusEntries) {
    assert.deepEqual(state(timeline.at(-1).endsAt, entry.jaw, entry.mapIndex, entry.surface),
      { brushed: true, extendPending: false });
  }
});

test("A standard session does not reset the focused surface visuals", () => {
  const standard = buildBrushingSessionTimeline({
    segments: buildSegments(8, 8), baseDurationSeconds: 120,
    focusModes, extendEnabled: false
  });
  assert.deepEqual(getToothSurfaceVisualState({
    timeline: standard, elapsedSeconds: 120, jaw: "top", mapIndex: 0,
    surface: "front", focusSurfaceModes: focusModes, extendPassStarted: true
  }), { brushed: true, extendPending: false });
});
