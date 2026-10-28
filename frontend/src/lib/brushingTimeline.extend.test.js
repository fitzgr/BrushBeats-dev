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
    const transitionSeconds = extended.filter((entry) => entry.type === "transition" && entry.pass !== "extend").reduce((sum, entry) => sum + (entry.endsAt - entry.startsAt), 0);
    const secondsPerSurface = (baseDurationSeconds - transitionSeconds) / toothCount;

    assert.equal(plainEntries.length, toothCount);
    assert.equal(baseEntries.length, toothCount);
    assert.equal(focusEntries.length, 3);
    baseEntries.forEach((entry) => nearly(entry.durationSeconds, secondsPerSurface));
    focusEntries.forEach((entry) => nearly(entry.durationSeconds, secondsPerSurface));
    nearly(extended.find((entry) => entry.transitionCue === "extendStart").startsAt, baseDurationSeconds);
    assert.ok(extended.at(-1).endsAt >= baseDurationSeconds + 3 + 3 * secondsPerSurface);
    assert.deepEqual(
      focusEntries.map((entry) => [entry.jaw, entry.mapIndex, entry.surface]).sort(),
      [["top", 0, "front"], ["top", 0, "back"], ["bottom", 2, "back"]].sort()
    );
    assert.equal(getActiveToothEntry(extended, baseDurationSeconds + 3.001)?.pass, "extend");
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

test("Extend adds a three-second starting guide and only necessary move pauses", () => {
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
  nearly(movements[0].endsAt, 123);
  nearly(focusEntries[0].startsAt, 123);
  assert.equal(movements.length, 3); // start + separated teeth + cross-jaw
  assert.equal(movements.some((entry) => entry.transitionCue === "extendJaw"), true);
  assert.equal(movements.find((entry) => entry.transitionCue === "extendJaw").endsAt -
    movements.find((entry) => entry.transitionCue === "extendJaw").startsAt, 3);
  const topAdjacent = focusEntries.filter((entry) => entry.jaw === "top" && [0, 1].includes(entry.mapIndex));
  assert.equal(topAdjacent.length, 2);
  nearly(topAdjacent[1].startsAt, topAdjacent[0].endsAt); // No pause between adjacent top teeth.
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
  // Starting on top finishes on bottom, and vice versa.
  assert.equal(first(normal).toJaw, "bottom");
  assert.equal(first(normal).toSurface, "back");
  assert.equal(first(rotated).toJaw, "top");
  assert.equal(first(rotated).toSurface, "front");
});

// Extra Care adjustments never change the user's chosen full-mouth pass or surface allocations.
test("Extend uses a 3s start, 1.5s face flips, 3s jaw changes, and no pause for adjacent teeth", () => {
  const timeline = buildBrushingSessionTimeline({
    segments: buildSegments(7, 7),
    baseDurationSeconds: 120,
    secondsPerTooth: 2,
    focusModes: new Map([
      ["top:0", "both"],
      ["top:1", "front"],
      ["bottom:2", "back"]
    ]),
    extendEnabled: true
  });
  const focus = timeline.filter((entry) => entry.type === "tooth" && entry.pass === "extend");
  const moves = timeline.filter((entry) => entry.type === "transition" && entry.pass === "extend");
  const start = moves.find((entry) => entry.transitionCue === "extendStart");
  const face = moves.find((entry) => entry.transitionCue === "extendSurface");
  const jaw = moves.find((entry) => entry.transitionCue === "extendJaw");
  const seconds = (entry) => entry.endsAt - entry.startsAt;
  assert.ok(start && face && jaw);
  nearly(start.startsAt, 120);
  nearly(seconds(start), 3);
  nearly(seconds(face), 1.5);
  nearly(seconds(jaw), 3);
  assert.equal(moves.length, 3); // Adjacent top teeth get no added pause.
  assert.equal(focus.length, 4);
  nearly(focus[0].durationSeconds, focus[1].durationSeconds);
});

test("Extend starts on the finishing jaw and visits its nearest focus tooth first", () => {
  const timeline = buildBrushingSessionTimeline({
    segments: buildSegments(8, 8, "front-top-left"),
    baseDurationSeconds: 120,
    focusModes: new Map([
      ["top:0", "back"],
      ["bottom:6", "back"],
      ["bottom:1", "front"]
    ]),
    extendEnabled: true
  });
  const base = timeline.filter((entry) => entry.type === "tooth" && entry.pass !== "extend");
  const focus = timeline.filter((entry) => entry.type === "tooth" && entry.pass === "extend");
  const moves = timeline.filter((entry) => entry.type === "transition" && entry.pass === "extend");
  assert.deepEqual([base.at(-1).jaw, base.at(-1).mapIndex], ["bottom", 0]);
  assert.deepEqual(focus.map((entry) => [entry.jaw, entry.mapIndex, entry.surface]), [
    ["bottom", 1, "front"],
    ["bottom", 6, "back"],
    ["top", 0, "back"]
  ]);
  assert.equal(moves[0].transitionCue, "extendStart");
  nearly(moves[0].endsAt - moves[0].startsAt, 2);
  assert.equal(moves.filter((entry) => entry.transitionCue === "extendJaw").length, 1);
});

test("Extend respects rotated finishing jaw and shortens a same-tooth start to 2s", () => {
  const timeline = buildBrushingSessionTimeline({
    segments: buildSegments(8, 8, "front-bottom-right"),
    baseDurationSeconds: 120,
    focusModes: new Map([
      ["bottom:7", "back"],
      ["top:7", "back"],
      ["top:0", "front"]
    ]),
    extendEnabled: true
  });
  const base = timeline.filter((entry) => entry.type === "tooth" && entry.pass !== "extend");
  const focus = timeline.filter((entry) => entry.type === "tooth" && entry.pass === "extend");
  const start = timeline.find((entry) => entry.transitionCue === "extendStart");
  assert.deepEqual([base.at(-1).jaw, base.at(-1).mapIndex], ["top", 7]);
  assert.deepEqual([focus[0].jaw, focus[0].mapIndex, focus[0].surface], ["top", 7, "back"]);
  assert.deepEqual(focus.map((entry) => entry.jaw), ["top", "top", "bottom"]);
  nearly(start.endsAt - start.startsAt, 2);
});

test("Extend crosses jaws immediately when the finishing jaw has no selected surfaces", () => {
  const timeline = buildBrushingSessionTimeline({
    segments: buildSegments(8, 8, "front-top-left"),
    baseDurationSeconds: 120,
    focusModes: new Map([["top:0", "front"]]),
    extendEnabled: true
  });
  const first = timeline.find((entry) => entry.transitionCue === "extendStart");
  assert.equal(first.toJaw, "top");
  nearly(first.endsAt - first.startsAt, 3);
});
