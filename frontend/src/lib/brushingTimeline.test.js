import test from "node:test";
import assert from "node:assert/strict";
import { buildSegments, buildTimeline, getActiveTimelineEntry, getActiveToothEntry } from "./brushingTimeline.js";

test("active tooth switches exactly on secondsPerTooth boundaries", () => {
  const segments = [
    {
      key: "front-top-left",
      label: "Front Top Left",
      jaw: "top",
      surface: "front",
      mapIndices: [0, 1]
    },
    {
      key: "front-top-right",
      label: "Front Top Right",
      jaw: "top",
      surface: "front",
      mapIndices: [2]
    }
  ];
  const timeline = buildTimeline(segments, 0.5, 0.8);

  assert.equal(getActiveToothEntry(timeline, 0.49)?.key, "front-top-left-0");
  assert.equal(getActiveToothEntry(timeline, 0.5)?.key, "front-top-left-1");
  assert.equal(getActiveToothEntry(timeline, 0.99)?.key, "front-top-left-1");
  assert.equal(getActiveToothEntry(timeline, 1.2), null);
  assert.equal(getActiveToothEntry(timeline, 2.01)?.key, "front-top-right-2");
});

test("transition cues preserve fixed switch and rotate durations", () => {
  const segments = [
    { key: "a", label: "Front Top Left", jaw: "top", surface: "front", mapIndices: [0] },
    { key: "b", label: "Front Top Right", jaw: "top", surface: "front", mapIndices: [1] },
    { key: "c", label: "Back Top Right", jaw: "top", surface: "back", mapIndices: [1] },
    { key: "d", label: "Back Top Left", jaw: "top", surface: "back", mapIndices: [0] },
    { key: "e", label: "Front Bottom Left", jaw: "bottom", surface: "front", mapIndices: [0] }
  ];

  const timeline = buildTimeline(segments, 1, 0.6);
  const transitions = timeline.filter((entry) => entry.type === "transition");

  assert.equal(transitions[0].transitionCue, "switchHand");
  assert.equal(transitions[0].endsAt - transitions[0].startsAt, 1);
  assert.equal(transitions[1].transitionCue, "rotate");
  assert.equal(transitions[1].endsAt - transitions[1].startsAt, 0.75);
  assert.equal(transitions[2].transitionCue, "transition");
  assert.ok(Math.abs((transitions[2].endsAt - transitions[2].startsAt) - 0.6) < 1e-9);
  assert.equal(transitions[3].transitionCue, "switchHand");
  assert.equal(transitions[3].endsAt - transitions[3].startsAt, 1);
});

test("buildSegments omits empty arches and keeps deterministic order", () => {
  const segments = buildSegments(2, 0);

  assert.deepEqual(
    segments.map((segment) => segment.key),
    ["front-top-left", "front-top-right", "back-top-right", "back-top-left"]
  );

  const timeline = buildTimeline(segments, 1, 1);
  const entryAtZero = getActiveTimelineEntry(timeline, 0);
  assert.equal(entryAtZero?.type, "tooth");
  assert.equal(entryAtZero?.key, "front-top-left-0");
});
