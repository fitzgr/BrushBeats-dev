function splitArch(count) {
  return {
    left: Math.ceil(count / 2),
    right: Math.floor(count / 2)
  };
}

function oppositeJaw(jaw) {
  return jaw === "top" ? "bottom" : "top";
}

function oppositeSurface(surface) {
  return surface === "front" ? "back" : "front";
}

function parseStartSegmentKey(startSegmentKey) {
  const match = String(startSegmentKey || "").match(/^(front|back)-(top|bottom)-(left|right)$/);
  if (!match) {
    return null;
  }

  return {
    surface: match[1],
    jaw: match[2],
    side: match[3]
  };
}

function buildHalfIndices(totalTeeth, side, direction) {
  const split = splitArch(totalTeeth);
  const base = side === "left"
    ? Array.from({ length: split.left }, (_, index) => index)
    : Array.from({ length: split.right }, (_, index) => split.left + index);

  return direction === "ltr" ? base : [...base].reverse();
}

function buildSegment({ surface, jaw, side, totalTeeth, direction }) {
  const mapIndices = buildHalfIndices(totalTeeth, side, direction);
  if (!mapIndices.length) {
    return null;
  }

  const surfaceLabel = surface === "front" ? "Front" : "Back";
  const jawLabel = jaw === "top" ? "Top" : "Bottom";
  const sideLabel = side === "left" ? "Left" : "Right";

  return {
    key: `${surface}-${jaw}-${side}`,
    label: `${surfaceLabel} ${jawLabel} ${sideLabel}`,
    jaw,
    surface,
    mapIndices
  };
}

function buildRowSegments({ jaw, surface, direction, totalTeeth }) {
  const sideOrder = direction === "ltr" ? ["left", "right"] : ["right", "left"];
  return sideOrder
    .map((side) => buildSegment({ surface, jaw, side, totalTeeth, direction }))
    .filter(Boolean);
}

export function buildSegments(topTeeth, bottomTeeth, startSegmentKey = null) {
  const parsedStart = parseStartSegmentKey(startSegmentKey) || {
    surface: "front",
    jaw: "top",
    side: "left"
  };
  const preferredDirection = parsedStart.side === "left" ? "ltr" : "rtl";
  const mirroredDirection = preferredDirection === "ltr" ? "rtl" : "ltr";
  const jawOrder = [parsedStart.jaw, oppositeJaw(parsedStart.jaw)];
  const orderedSegments = [];

  jawOrder.forEach((jaw) => {
    const totalTeeth = jaw === "top" ? Number(topTeeth || 0) : Number(bottomTeeth || 0);

    orderedSegments.push(
      ...buildRowSegments({
        jaw,
        surface: parsedStart.surface,
        direction: preferredDirection,
        totalTeeth
      })
    );
    orderedSegments.push(
      ...buildRowSegments({
        jaw,
        surface: oppositeSurface(parsedStart.surface),
        direction: mirroredDirection,
        totalTeeth
      })
    );
  });

  return orderedSegments;
}

function buildTransitionPrompt(order, transitionCount, transitionBufferSeconds) {
  if (order === 1 || order === transitionCount) {
    return {
      cue: "switchHand",
      seconds: 1
    };
  }

  if (order === 2 || order === 4) {
    return {
      cue: "rotate",
      seconds: 0.75
    };
  }

  return {
    cue: "transition",
    seconds: transitionBufferSeconds
  };
}

function toSafeWeight(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return 1;
  }

  return numeric;
}

function getTimelineToothEntries(segments) {
  const entries = [];

  segments.forEach((segment, segmentIndex) => {
    segment.mapIndices.forEach((mapIndex, toothIndex) => {
      entries.push({
        segment,
        segmentIndex,
        mapIndex,
        segmentPosition: toothIndex + 1,
        segmentSize: segment.mapIndices.length
      });
    });
  });

  return entries;
}

function getQuadrantIndex(segmentIndex) {
  return Math.floor(Number(segmentIndex || 0) / 2);
}

function resolveToothDurations(segments, secondsPerTooth, options = {}) {
  const entries = getTimelineToothEntries(segments);
  const fallbackBudget = Math.max(0, entries.length * Number(secondsPerTooth || 0));
  const requestedBudget = options.toothDurationBudgetSeconds;
  const toothDurationBudgetSeconds = Number.isFinite(Number(requestedBudget))
    ? Math.max(0, Number(requestedBudget))
    : fallbackBudget;
  const toothWeightResolver = typeof options.toothWeightResolver === "function"
    ? options.toothWeightResolver
    : null;
  const weightedEntries = entries.map((entry) => {
    const rawWeight = toothWeightResolver
      ? toothWeightResolver({
          jaw: entry.segment.jaw,
          surface: entry.segment.surface,
          mapIndex: entry.mapIndex,
          key: `${entry.segment.key}-${entry.mapIndex}`,
          segmentKey: entry.segment.key,
          segmentPosition: entry.segmentPosition,
          segmentSize: entry.segmentSize
        })
      : 1;

    return {
      ...entry,
      weight: toSafeWeight(rawWeight)
    };
  });

  const quadrantCount = Math.max(1, Math.ceil(segments.length / 2));
  const quadrantBudgetSeconds = toothDurationBudgetSeconds / quadrantCount;
  const groupedEntries = new Map();

  weightedEntries.forEach((entry) => {
    const quadrantIndex = getQuadrantIndex(entry.segmentIndex);
    const group = groupedEntries.get(quadrantIndex) || [];
    group.push({ ...entry, quadrantIndex });
    groupedEntries.set(quadrantIndex, group);
  });

  const resolvedEntries = [];
  Array.from(groupedEntries.keys()).sort((left, right) => left - right).forEach((quadrantIndex) => {
    const quadrantEntries = groupedEntries.get(quadrantIndex) || [];
    const totalWeight = quadrantEntries.reduce((sum, entry) => sum + entry.weight, 0);

    quadrantEntries.forEach((entry) => {
      const durationSeconds = totalWeight > 0 && quadrantBudgetSeconds > 0
        ? (quadrantBudgetSeconds * entry.weight) / totalWeight
        : 0;

      resolvedEntries.push({
        ...entry,
        durationSeconds
      });
    });
  });

  return resolvedEntries;
}

export function buildTimeline(segments, secondsPerTooth, transitionBufferSeconds, options = {}) {
  const timeline = [];
  let cursor = 0;
  const transitionCount = Math.max(0, segments.length - 1);
  const toothDurations = resolveToothDurations(segments, secondsPerTooth, options);
  const beatsPerMinute = Number(options.beatsPerMinute || options.bpm || 0);
  const hasBeatRate = Number.isFinite(beatsPerMinute) && beatsPerMinute > 0;
  let toothCursor = 0;

  segments.forEach((segment, segmentIndex) => {
    segment.mapIndices.forEach((mapIndex, toothIndex) => {
      const toothTiming = toothDurations[toothCursor] || { durationSeconds: 0 };
      const durationSeconds = toothTiming.durationSeconds;

      timeline.push({
        type: "tooth",
        key: `${segment.key}-${mapIndex}`,
        segmentKey: segment.key,
        label: segment.label,
        jaw: segment.jaw,
        surface: segment.surface,
        mapIndex,
        segmentPosition: toothIndex + 1,
        segmentSize: segment.mapIndices.length,
        quadrantIndex: toothTiming.quadrantIndex,
        startsAt: cursor,
        endsAt: cursor + durationSeconds,
        durationSeconds,
        durationBeats: hasBeatRate ? (durationSeconds * beatsPerMinute) / 60 : null,
        weight: toothTiming.weight || 1
      });
      cursor += durationSeconds;
      toothCursor += 1;
    });

    if (segmentIndex < segments.length - 1) {
      const transitionOrder = segmentIndex + 1;
      const transitionPrompt = buildTransitionPrompt(transitionOrder, transitionCount, transitionBufferSeconds);

      timeline.push({
        type: "transition",
        key: `transition-${segment.key}`,
        fromLabel: segment.label,
        toLabel: segments[segmentIndex + 1].label,
        transitionOrder,
        transitionCue: transitionPrompt.cue,
        startsAt: cursor,
        endsAt: cursor + transitionPrompt.seconds
      });
      cursor += transitionPrompt.seconds;
    }
  });

  return timeline;
}

export function getActiveTimelineEntry(timeline, elapsedSeconds) {
  return timeline.find((entry) => elapsedSeconds >= entry.startsAt && elapsedSeconds < entry.endsAt) || null;
}

export function getActiveToothEntry(timeline, elapsedSeconds) {
  const entry = getActiveTimelineEntry(timeline, elapsedSeconds);
  return entry?.type === "tooth" ? entry : null;
}
