import test from "node:test";
import assert from "node:assert/strict";
import { buildSegments, buildBrushingSessionTimeline, getActiveToothEntry } from "./brushingTimeline.js";

const nearly = (actual, expected, message) =>
  assert.ok(Math.abs(actual - expected) < 1e-7, message || `Expected ${actual} ≈ ${expected}`);

test("Extend preserves every user-chosen base duration, then repeats only selected surfaces", () => {
  const segments = buildSegments(14, 14);
  const focusModes = new Map([["top:0", "both"], ["bottom:2", "back"]]);
  const toothCount = 56; // 28 teeth * front and back
  for (const baseDurationSeconds of [90, 120, 150, 180]) {
    const plain = buildBrushingSessionTimeline({ segments, baseDurationSeconds, secondsPerTooth: 1.8, transitionBufferSeconds: 1, beatsPerMinute: 119, focusModes, extendEnabled: false });
    const extended = buildBrushingSessionTimeline({ segments, baseDurationSeconds, secondsPerTooth: 1.8, transitionBufferSeconds: 1, beatsPerMinute: 119, focusModes, extendEnabled: true });
    const plainEntries = plain.filter((entry) => entry.type === "tooth");
    const baseEntries = extended.filter((entry) => entry.type === "tooth" && entry.pass !== "extend");
    const focusEntries = extended.filter((entry) => entry.type === "tooth" && entry.pass === "extend");
    const transitionSeconds = extended.filter((entry) => entry.type === "transition").reduce((sum, entry) => sum + (entry.endsAt - entry.startsAt), 0);
    const secondsPerSurface = (baseDurationSeconds - transitionSeconds) / toothCount;

    assert.equal(plainEntries.length, toothCount);
    assert.equal(baseEntries.length, toothCount);
    assert.equal(focusEntries.length, 3);
    baseEntries.forEach((entry) => nearly(entry.durationSeconds, secondsPerSurface));
    focusEntries.forEach((entry) => nearly(entry.durationSeconds, secondsPerSurface));
    nearly(extended.find((entry) => entry.transitionCue === "extendStart").startsAt, baseDurationSeconds);
    assert.ok(extended.at(-1).endsAt >= baseDurationSeconds + 5 + 3 * secondsPerSurface);
    assert.deepEqual(
      focusEntries.map((entry) => [entry.jaw, entry.mapIndex, entry.surface]).sort(),
      [["top", 0, "front"], ["top", 0, "back"], ["bottom", 2, "back"]].sort()
    );
    assert.equal(getActiveToothEntry(extended, baseDurationSeconds + 5.001)?.pass, "extend");
  }
});

test("Extend allocates equal time per surface despite unequal top and bottom tooth counts", () => {
  const segments = buildSegments(9, 7);
  const timeline = buildBrushingSessionTimeline({
    segments, secondsPerTooth: 2, baseDurationSeconds: 90,
    focusModes: new Map([["bottom:0", "front"]]), extendEnabled: true
  });
  const base = timeline.filter((entry) => entry.type === "tooth" && entry.pass !== "extend");
  assert.equal(base.length, 32);
  for (const entry of base) nearly(entry.durationSeconds, base[0].durationSeconds);
  nearly(timeline.find((entry) => entry.transitionCue === "extendStart").startsAt, 90);
});

test("With Extend disabled the 1.5x focus weighting remains; without selections Extend adds no pass", () => {
  const segments = buildSegments(14, 14);
  const focusModes = new Map([["top:0", "front"]]);
  const standard = buildBrushingSessionTimeline({
    segments, secondsPerTooth: 2, baseDurationSeconds: 120,
    focusModes, extendEnabled: false
  });
  const focus = standard.find((entry) => entry.type === "tooth" && entry.jaw === "top" && entry.mapIndex === 0 && entry.surface === "front");
  const other = standard.find((entry) => entry.type === "tooth" && entry.jaw === "top" && entry.mapIndex === 1 && entry.surface === "front");
  nearly(focus.durationSeconds / other.durationSeconds, 1.5);
  nearly(standard.at(-1).endsAt, 120);

  const noFocus = buildBrushingSessionTimeline({
    segments, secondsPerTooth: 2, baseDurationSeconds: 120,
    focusModes: new Map(), extendEnabled: true
  });
  assert.equal(noFocus.filter((entry) => entry.pass === "extend").length, 0);
  nearly(noFocus.at(-1).endsAt, 120);
});

test("Extend adds a five-second starting guide and only necessary move pauses", () => {
  const segments = buildSegments(7, 7);
  const focusModes = new Map([
    ["top:0", "front"],
    ["top:1", "front"],
    ["top:5", "front"],
    ["bottom:2", "back"]
  ]);
  const timeline = buildBrushingSessionTimeline({
    segments, baseDurationSeconds: 120, secondsPerTooth: 2,
    focusModes, extendEnabled: true
  });
  const movements = timeline.filter((entry) => entry.type === "transition" && entry.pass === "extend");
  const focusEntries = timeline.filter((entry) => entry.type === "tooth" && entry.pass === "extend");
  assert.equal(focusEntries.length, 4);
  assert.equal(movements[0].transitionCue, "extendStart");
  nearly(movements[0].startsAt, 120);
  nearly(movements[0].endsAt, 125);
  nearly(focusEntries[0].startsAt, 125);
  assert.equal(movements.length, 3); // start + separated teeth + cross-jaw
  assert.equal(movements.some((entry) => entry.transitionCue === "extendJaw"), true);
  assert.equal(movements.find((entry) => entry.transitionCue === "extendJaw").endsAt -
    movements.find((entry) => entry.transitionCue === "extendJaw").startsAt, 4);
  assert.equal(movements.some((entry) => entry.toJaw === "top" && entry.toMapIndex === 1), false);
  assert.equal(timeline.at(-1).endsAt > 120 + focusEntries.reduce((sum, entry) => sum + entry.durationSeconds, 0), true);
});

test("Rotate starting tooth changes which focus tooth is first", () => {
  const modes = new Map([["top:0", "front"], ["bottom:0", "back"]]);
  const normal = buildBrushingSessionTimeline({
    segments: buildSegments(8, 8, "front-top-left"), baseDurationSeconds: 120,
    focusModes: modes, extendEnabled: true
  });
  const rotated = buildBrushingSessionTimeline({
    segments: buildSegments(8, 8, "back-bottom-left"), baseDurationSeconds: 120,
    focusModes: modes, extendEnabled: true
  });
  const first = (timeline) => timeline.find((entry) => entry.type === "transition" && entry.transitionCue === "extendStart");
  assert.equal(first(normal).toJaw, "top");
  assert.equal(first(normal).toSurface, "front");
  assert.equal(first(rotated).toJaw, "bottom");
  assert.equal(first(rotated).toSurface, "back");
});
