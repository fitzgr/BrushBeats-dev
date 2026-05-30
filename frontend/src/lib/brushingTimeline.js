function splitArch(count) {
  return {
    left: Math.ceil(count / 2),
    right: Math.floor(count / 2)
  };
}

export function buildSegments(topTeeth, bottomTeeth) {
  const topSplit = splitArch(topTeeth);
  const bottomSplit = splitArch(bottomTeeth);
  const segments = [
    {
      key: "front-top-left",
      label: "Front Top Left",
      jaw: "top",
      surface: "front",
      mapIndices: Array.from({ length: topSplit.left }, (_, index) => index)
    },
    {
      key: "front-top-right",
      label: "Front Top Right",
      jaw: "top",
      surface: "front",
      mapIndices: Array.from({ length: topSplit.right }, (_, index) => topSplit.left + index)
    },
    {
      key: "back-top-right",
      label: "Back Top Right",
      jaw: "top",
      surface: "back",
      mapIndices: Array.from({ length: topSplit.right }, (_, index) => topTeeth - 1 - index)
    },
    {
      key: "back-top-left",
      label: "Back Top Left",
      jaw: "top",
      surface: "back",
      mapIndices: Array.from({ length: topSplit.left }, (_, index) => topSplit.left - 1 - index)
    },
    {
      key: "front-bottom-left",
      label: "Front Bottom Left",
      jaw: "bottom",
      surface: "front",
      mapIndices: Array.from({ length: bottomSplit.left }, (_, index) => index)
    },
    {
      key: "front-bottom-right",
      label: "Front Bottom Right",
      jaw: "bottom",
      surface: "front",
      mapIndices: Array.from({ length: bottomSplit.right }, (_, index) => bottomSplit.left + index)
    },
    {
      key: "back-bottom-right",
      label: "Back Bottom Right",
      jaw: "bottom",
      surface: "back",
      mapIndices: Array.from({ length: bottomSplit.right }, (_, index) => bottomTeeth - 1 - index)
    },
    {
      key: "back-bottom-left",
      label: "Back Bottom Left",
      jaw: "bottom",
      surface: "back",
      mapIndices: Array.from({ length: bottomSplit.left }, (_, index) => bottomSplit.left - 1 - index)
    }
  ];

  return segments.filter((segment) => segment.mapIndices.length > 0);
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

export function buildTimeline(segments, secondsPerTooth, transitionBufferSeconds) {
  const timeline = [];
  let cursor = 0;
  const transitionCount = Math.max(0, segments.length - 1);

  segments.forEach((segment, segmentIndex) => {
    segment.mapIndices.forEach((mapIndex, toothIndex) => {
      timeline.push({
        type: "tooth",
        key: `${segment.key}-${mapIndex}`,
        label: segment.label,
        jaw: segment.jaw,
        surface: segment.surface,
        mapIndex,
        segmentPosition: toothIndex + 1,
        segmentSize: segment.mapIndices.length,
        startsAt: cursor,
        endsAt: cursor + secondsPerTooth
      });
      cursor += secondsPerTooth;
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
