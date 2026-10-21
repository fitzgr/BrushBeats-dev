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

function buildHalfIndices(totalTeeth, side, direction, brushingHand, brushType) {
  const split = splitArch(totalTeeth);
  let boundary = split.left;

  // On the first pass across an arch, keep the one-tooth-past-center
  // electric-brush orientation change in the handed direction. On the
  // return pass, switch at the true center because the hand is approaching
  // the midline from the opposite direction.
  if (brushType === "electric" && totalTeeth >= 3) {
    const handedDirection = brushingHand === "left" ? "rtl" : "ltr";
    if (direction === handedDirection) {
      const offset = brushingHand === "left" ? -1 : 1;
      boundary = Math.max(1, Math.min(totalTeeth - 1, boundary + offset));
    }
  }

  const base = side === "left"
    ? Array.from({ length: boundary }, (_, index) => index)
    : Array.from({ length: totalTeeth - boundary }, (_, index) => boundary + index);

  return direction === "ltr" ? base : [...base].reverse();
}

function buildSegment({ surface, jaw, side, totalTeeth, direction, brushingHand, brushType }) {
  const mapIndices = buildHalfIndices(totalTeeth, side, direction, brushingHand, brushType);
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

function buildRowSegments({ jaw, surface, direction, totalTeeth, brushingHand, brushType }) {
  const sideOrder = direction === "ltr" ? ["left", "right"] : ["right", "left"];
  return sideOrder
    .map((side) => buildSegment({ surface, jaw, side, totalTeeth, direction, brushingHand, brushType }))
    .filter(Boolean);
}

export function buildSegments(topTeeth, bottomTeeth, startSegmentKey = null, options = {}) {
  const brushingHand = options.brushingHand === "left" ? "left" : "right";
  const brushType = options.brushType === "electric" ? "electric" : "manual";
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
        totalTeeth,
        brushingHand,
        brushType
      })
    );
    orderedSegments.push(
      ...buildRowSegments({
        jaw,
        surface: oppositeSurface(parsedStart.surface),
        direction: mirroredDirection,
        totalTeeth,
        brushingHand,
        brushType
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

  // Extend mode uses equal time for every tooth surface across the whole mouth,
  // even when missing teeth make quadrant sizes unequal. Normal mode retains
  // the existing equal-quadrant budgets and 1.5x Extra Care weighting.
  if (options.uniformToothTiming) {
    const secondsPerSurface = weightedEntries.length > 0
      ? toothDurationBudgetSeconds / weightedEntries.length
      : 0;
    return weightedEntries.map((entry) => ({
      ...entry,
      quadrantIndex: getQuadrantIndex(entry.segmentIndex),
      durationSeconds: secondsPerSurface,
      weight: 1
    }));
  }

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

/**
 * Build the standard full-mouth pass, optionally followed by a second pass
 * containing only the patient-selected hygienist focus surfaces. The first
 * pass always uses the user's selected base duration; the second pass adds
 * exactly one ordinary surface allocation per selected surface, without
 * redistributing time away from the rest of the mouth.
 *
 * focusModes is a Map of "jaw:mapIndex" -> "front" | "back" | "both".
 */
export function buildBrushingSessionTimeline({
  segments = [],
  secondsPerTooth = 0,
  transitionBufferSeconds = 1,
  baseDurationSeconds = 120,
  beatsPerMinute = 0,
  focusModes = new Map(),
  extendEnabled = false,
  focusWeight = 1.5
} = {}) {
  const transitionTimeline = buildTimeline(segments, secondsPerTooth, transitionBufferSeconds);
  const totalTransitionSeconds = transitionTimeline
    .filter((entry) => entry.type === "transition")
    .reduce((sum, entry) => sum + (entry.endsAt - entry.startsAt), 0);
  const baseTimeline = buildTimeline(segments, secondsPerTooth, transitionBufferSeconds, {
    toothDurationBudgetSeconds: Math.max(0, Number(baseDurationSeconds) - totalTransitionSeconds),
    beatsPerMinute,
    uniformToothTiming: extendEnabled,
    toothWeightResolver: ({ jaw, mapIndex, surface }) => {
      if (extendEnabled) return 1;
      const mode = focusModes.get(`${jaw}:${mapIndex}`);
      return mode === "both" || mode === surface ? focusWeight : 1;
    }
  });

  if (!extendEnabled || !focusModes.size) {
    return baseTimeline;
  }

  // The full-mouth pass always ends at the user-selected duration. The
  // focused pass follows the same rotated segment order, with time to find
  // its starting tooth and realistic pauses only for brush repositioning.
  let cursor = baseTimeline.at(-1)?.endsAt || 0;
  const focusedTeeth = baseTimeline.filter((entry) => {
    if (entry.type !== "tooth") return false;
    const mode = focusModes.get(`${entry.jaw}:${entry.mapIndex}`);
    return mode === "both" || mode === entry.surface;
  });
  const focusedTimeline = [];
  const appendMove = (previous, next, index) => {
    const isStart = index === 0;
    const jawChanged = Boolean(previous && previous.jaw !== next.jaw);
    const surfaceChanged = Boolean(previous && previous.surface !== next.surface);
    const indexDistance = previous ? Math.abs(previous.mapIndex - next.mapIndex) : 0;
    // Adjacent teeth on the same jaw and face do not require a pause.
    const moveSeconds = isStart ? 3
      : jawChanged ? 3
      : surfaceChanged ? 1.5
      : indexDistance <= 1 ? 0
      : Math.min(3, 1.5 + 0.3 * Math.max(0, indexDistance - 2));
    if (moveSeconds <= 0) return;
    focusedTimeline.push({
      type: "transition",
      key: `extend-move-${index}`,
      pass: "extend",
      transitionCue: isStart ? "extendStart" : jawChanged ? "extendJaw" : surfaceChanged ? "extendSurface" : "extendMove",
      fromLabel: previous?.label || baseTimeline.filter((entry) => entry.type === "tooth").at(-1)?.label || next.label,
      toLabel: next.label,
      toJaw: next.jaw,
      toSurface: next.surface,
      toMapIndex: next.mapIndex,
      startsAt: cursor,
      endsAt: cursor + moveSeconds
    });
    cursor += moveSeconds;
  };
  focusedTeeth.forEach((entry, index) => {
    appendMove(focusedTeeth[index - 1], entry, index);
    focusedTimeline.push({
      ...entry,
      key: `extend-${entry.key}`,
      pass: "extend",
      segmentPosition: index + 1,
      segmentSize: focusedTeeth.length,
      startsAt: cursor,
      endsAt: cursor + entry.durationSeconds,
      weight: 1
    });
    cursor += entry.durationSeconds;
  });
  return [...baseTimeline, ...focusedTimeline];
}
