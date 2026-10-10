import test from "node:test";
import assert from "node:assert/strict";
import { buildSegments, buildTimeline, getActiveTimelineEntry, getActiveToothEntry } from "./brushingTimeline.js";
import { getActiveToothPulseMs } from "./brushingPulse.js";

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

test("right-handed electric brushing switches one tooth right of center on both surfaces and jaws", () => {
  const segments = buildSegments(14, 14, null, { brushingHand: "right", brushType: "electric" });

  for (const jaw of ["top", "bottom"]) {
    const outsideLeft = segments.find((segment) => segment.key === `front-${jaw}-left`);
    const outsideRight = segments.find((segment) => segment.key === `front-${jaw}-right`);
    const insideLeft = segments.find((segment) => segment.key === `back-${jaw}-left`);
    const insideRight = segments.find((segment) => segment.key === `back-${jaw}-right`);

    assert.deepEqual(outsideLeft.mapIndices, [0, 1, 2, 3, 4, 5, 6, 7]);
    assert.deepEqual(outsideRight.mapIndices, [8, 9, 10, 11, 12, 13]);
    assert.deepEqual(insideRight.mapIndices, [13, 12, 11, 10, 9, 8]);
    assert.deepEqual(insideLeft.mapIndices, [7, 6, 5, 4, 3, 2, 1, 0]);
  }

  const timeline = buildTimeline(segments, 1, 1);
  const outsideSwitch = timeline.find((entry) => entry.key === "transition-front-top-left");
  const precedingTooth = timeline[timeline.indexOf(outsideSwitch) - 1];
  const followingTooth = timeline[timeline.indexOf(outsideSwitch) + 1];

  assert.equal(precedingTooth.mapIndex, 7);
  assert.equal(followingTooth.mapIndex, 8);
  assert.equal(outsideSwitch.transitionCue, "switchHand");

  for (const jaw of ["top", "bottom"]) {
    const insideSwitch = timeline.find((entry) => entry.key === `transition-back-${jaw}-right`);
    assert.ok(insideSwitch);
    assert.equal(timeline[timeline.indexOf(insideSwitch) - 1].mapIndex, 8);
    assert.equal(timeline[timeline.indexOf(insideSwitch) + 1].mapIndex, 7);
  }
});

test("left-handed electric brushing switches one tooth left of center on both surfaces and jaws", () => {
  const segments = buildSegments(14, 14, "front-top-right", { brushingHand: "left", brushType: "electric" });

  for (const jaw of ["top", "bottom"]) {
    const outsideLeft = segments.find((segment) => segment.key === `front-${jaw}-left`);
    const outsideRight = segments.find((segment) => segment.key === `front-${jaw}-right`);
    const insideLeft = segments.find((segment) => segment.key === `back-${jaw}-left`);
    const insideRight = segments.find((segment) => segment.key === `back-${jaw}-right`);

    assert.deepEqual(outsideRight.mapIndices, [13, 12, 11, 10, 9, 8, 7, 6]);
    assert.deepEqual(outsideLeft.mapIndices, [5, 4, 3, 2, 1, 0]);
    assert.deepEqual(insideLeft.mapIndices, [0, 1, 2, 3, 4, 5]);
    assert.deepEqual(insideRight.mapIndices, [6, 7, 8, 9, 10, 11, 12, 13]);
  }

  const timeline = buildTimeline(segments, 1, 1);
  const outsideSwitch = timeline.find((entry) => entry.key === "transition-front-top-right");
  assert.equal(timeline[timeline.indexOf(outsideSwitch) - 1].mapIndex, 6);
  assert.equal(timeline[timeline.indexOf(outsideSwitch) + 1].mapIndex, 5);

  for (const jaw of ["top", "bottom"]) {
    const insideSwitch = timeline.find((entry) => entry.key === `transition-back-${jaw}-left`);
    assert.ok(insideSwitch);
    assert.equal(timeline[timeline.indexOf(insideSwitch) - 1].mapIndex, 5);
    assert.equal(timeline[timeline.indexOf(insideSwitch) + 1].mapIndex, 6);
  }
});

test("manual brushing still switches at center; shifted electric segments include each tooth once", () => {
  const manual = buildSegments(14, 14, null, { brushingHand: "right", brushType: "manual" });
  assert.deepEqual(manual.find((segment) => segment.key === "front-top-left").mapIndices, [0, 1, 2, 3, 4, 5, 6]);
  assert.deepEqual(manual.find((segment) => segment.key === "front-top-right").mapIndices, [7, 8, 9, 10, 11, 12, 13]);
  assert.deepEqual(manual.find((segment) => segment.key === "back-top-left").mapIndices, [6, 5, 4, 3, 2, 1, 0]);
  assert.deepEqual(manual.find((segment) => segment.key === "back-top-right").mapIndices, [13, 12, 11, 10, 9, 8, 7]);

  for (const brushHand of ["right", "left"]) {
    for (const count of [1, 2, 3, 5, 10, 14, 16]) {
      const segments = buildSegments(count, count, null, { brushingHand: brushHand, brushType: "electric" });
      for (const jaw of ["top", "bottom"]) {
        for (const surface of ["front", "back"]) {
          const leftSegment = segments.find((segment) => segment.key === `${surface}-${jaw}-left`);
          const rightSegment = segments.find((segment) => segment.key === `${surface}-${jaw}-right`);
          const expectedBoundary = count < 3
            ? Math.ceil(count / 2)
            : Math.max(1, Math.min(count - 1, Math.ceil(count / 2) + (brushHand === "left" ? -1 : 1)));
          assert.equal(leftSegment?.mapIndices.length, expectedBoundary);
          assert.equal(rightSegment?.mapIndices.length, count - expectedBoundary);
          const indices = segments
            .filter((segment) => segment.jaw === jaw && segment.surface === surface)
            .flatMap((segment) => segment.mapIndices)
            .sort((a, b) => a - b);
          assert.deepEqual(indices, Array.from({ length: count }, (_, index) => index));
        }
      }
    }
  }
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

test("active tooth pulse tracks the selected user BPM", () => {
  assert.equal(getActiveToothPulseMs(120), 500);
  assert.equal(getActiveToothPulseMs(60), 1000);
  assert.equal(getActiveToothPulseMs(0), 760);
});
