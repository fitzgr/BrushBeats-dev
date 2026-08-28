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

test("weighted focus teeth redistribute tooth time while preserving total duration and transitions", () => {
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
      mapIndices: [2, 3]
    }
  ];
  const timeline = buildTimeline(segments, 1, 1, {
    toothDurationBudgetSeconds: 4,
    toothWeightResolver: ({ mapIndex }) => (mapIndex === 1 ? 1.5 : 1)
  });
  const teeth = timeline.filter((entry) => entry.type === "tooth");
  const transitions = timeline.filter((entry) => entry.type === "transition");
  const totalToothSeconds = teeth.reduce((sum, entry) => sum + (entry.endsAt - entry.startsAt), 0);
  const totalTransitionSeconds = transitions.reduce((sum, entry) => sum + (entry.endsAt - entry.startsAt), 0);

  assert.ok(Math.abs(totalToothSeconds - 4) < 1e-9);
  assert.equal(totalTransitionSeconds, 1);

  const focusTooth = teeth.find((entry) => entry.mapIndex === 1);
  const normalTooth = teeth.find((entry) => entry.mapIndex === 0);
  assert.ok(focusTooth);
  assert.ok(normalTooth);
  assert.ok(focusTooth.durationSeconds > normalTooth.durationSeconds);
  assert.ok(Math.abs((focusTooth.durationSeconds / normalTooth.durationSeconds) - 1.5) < 1e-9);
});

test("quadrant timing stays fixed while focus teeth get more of that quadrant's time", () => {
  const segments = [
    { key: "front-top-left", label: "Front Top Left", jaw: "top", surface: "front", mapIndices: [0] },
    { key: "back-top-left", label: "Back Top Left", jaw: "top", surface: "back", mapIndices: [1] },
    { key: "front-top-right", label: "Front Top Right", jaw: "top", surface: "front", mapIndices: [2] },
    { key: "back-top-right", label: "Back Top Right", jaw: "top", surface: "back", mapIndices: [3] }
  ];

  const timeline = buildTimeline(segments, 1, 1, {
    toothDurationBudgetSeconds: 8,
    toothWeightResolver: ({ segmentKey }) => (segmentKey === "front-top-left" ? 1.5 : 1)
  });

  const teeth = timeline.filter((entry) => entry.type === "tooth");
  const firstQuadrant = teeth.filter((entry) => entry.quadrantIndex === 0);
  const secondQuadrant = teeth.filter((entry) => entry.quadrantIndex === 1);

  const firstQuadrantSeconds = firstQuadrant.reduce((sum, entry) => sum + entry.durationSeconds, 0);
  const secondQuadrantSeconds = secondQuadrant.reduce((sum, entry) => sum + entry.durationSeconds, 0);

  assert.ok(Math.abs(firstQuadrantSeconds - 4) < 1e-9);
  assert.ok(Math.abs(secondQuadrantSeconds - 4) < 1e-9);

  const focusTooth = firstQuadrant.find((entry) => entry.segmentKey === "front-top-left");
  const normalTooth = firstQuadrant.find((entry) => entry.segmentKey === "back-top-left");

  assert.ok(focusTooth);
  assert.ok(normalTooth);
  assert.ok(Math.abs((focusTooth.durationSeconds / normalTooth.durationSeconds) - 1.5) < 1e-9);
});

test("tooth timeline entries include beat duration metadata when BPM is provided", () => {
  const segments = [
    { key: "front-top-left", label: "Front Top Left", jaw: "top", surface: "front", mapIndices: [0] }
  ];

  const timeline = buildTimeline(segments, 1, 1, {
    toothDurationBudgetSeconds: 2,
    beatsPerMinute: 120
  });

  const tooth = timeline.find((entry) => entry.type === "tooth");

  assert.ok(tooth);
  assert.ok(Math.abs(tooth.durationBeats - 4) < 1e-9);
});
