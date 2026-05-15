import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import AgeThemePanel from "./AgeThemePanel";
import AgeOverlay from "./AgeOverlay";
import { getBrushTechniqueTips } from "../lib/reinforcementMessages";

function toRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

function createArcPoints({ count, cx, cy, rx, ry, startDeg, endDeg }) {
  if (count <= 0) {
    return [];
  }

  return Array.from({ length: count }, (_, index) => {
    const ratio = count === 1 ? 0.5 : index / (count - 1);
    const angleDeg = startDeg + (endDeg - startDeg) * ratio;
    const angle = toRadians(angleDeg);

    return {
      index,
      x: cx + rx * Math.cos(angle),
      y: cy + ry * Math.sin(angle),
      angleDeg,
      layoutScale: 1
    };
  });
}

function getToothArcWeight(type) {
  switch (type) {
    case "molar":
      return 1.26;
    case "premolar":
      return 1.14;
    case "canine":
      return 0.9;
    case "incisor":
    default:
      return 0.88;
  }
}

function getToothRadialOffset(type) {
  switch (type) {
    case "molar":
      return 3.2;
    case "premolar":
      return 1.6;
    default:
      return 0;
  }
}

function createJawToothLayout({ chart, jaw, child = false, mapCenter = { x: 180, y: 214 } }) {
  const count = chart.length;
  const profile = child
    ? jaw === "top"
      ? { cx: 180, cy: 198, rx: 136, ry: 132, startDeg: 188, endDeg: 352, edgeScale: 1.06, centerScale: 1.15 }
      : { cx: 180, cy: 230, rx: 136, ry: 132, startDeg: 172, endDeg: 8, edgeScale: 1.06, centerScale: 1.15 }
    : jaw === "top"
      ? { cx: 180, cy: 198, rx: 146, ry: 142, startDeg: 188, endDeg: 352, edgeScale: 1.04, centerScale: 1.13 }
      : { cx: 180, cy: 230, rx: 146, ry: 142, startDeg: 172, endDeg: 8, edgeScale: 1.04, centerScale: 1.13 };

  const density = clampNumber(count / (child ? 10 : 16), 0.25, 1);
  const densityScale = 1.1 - density * 0.02;

  const weights = chart.map((tooth) => getToothArcWeight(tooth?.type));
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0) || 1;
  let cursor = 0;

  return weights.map((weight, index) => {
    const centerRatio = (cursor + weight / 2) / totalWeight;
    cursor += weight;
    const angleDeg = profile.startDeg + (profile.endDeg - profile.startDeg) * centerRatio;
    const angle = toRadians(angleDeg);
    const toothType = chart[index]?.type;
    const radialOffset = getToothRadialOffset(toothType);
    const baseX = profile.cx + profile.rx * Math.cos(angle);
    const baseY = profile.cy + profile.ry * Math.sin(angle);
    const outX = baseX - mapCenter.x;
    const outY = baseY - mapCenter.y;
    const outDistance = Math.hypot(outX, outY) || 1;
    const x = baseX + (outX / outDistance) * radialOffset;
    const y = baseY + (outY / outDistance) * radialOffset;
    const ratio = count <= 1 ? 1 : Math.abs((index / (count - 1)) * 2 - 1);
    const centerWeight = 1 - ratio;
    const layoutScale = (profile.edgeScale + (profile.centerScale - profile.edgeScale) * centerWeight) * densityScale;
    const directionToCenter = Math.atan2(mapCenter.y - y, mapCenter.x - x) * (180 / Math.PI);

    return {
      index,
      x,
      y,
      angleDeg,
      rotationDeg: directionToCenter + 90,
      layoutScale
    };
  });
}

const TOOTH_SHAPES = {
  molar: {
    path: "M0 -28 C16 -29 27 -20 29 -7 C30 11 22 25 11 32 C4 35 -4 35 -11 32 C-22 25 -30 11 -29 -7 C-27 -20 -16 -29 0 -28 Z",
    grooves: [
      { type: "path", d: "M-14 -5 C-9 -14 9 -14 14 -5" },
      { type: "path", d: "M-11 10 C-6 2 6 2 11 10" },
      { type: "path", d: "M-4 -12 C-1 -4 -1 5 -4 14" },
      { type: "path", d: "M7 -11 C4 -3 4 6 7 14" }
    ],
    grooveStroke: "#d7ccbd",
    scale: 0.465
  },
  premolar: {
    path: "M0 -25 C13 -25 22 -18 23 -5 C23 11 15 24 7 30 C2 32 -2 32 -7 30 C-15 24 -23 11 -23 -5 C-22 -18 -13 -25 0 -25 Z",
    grooves: [
      { type: "path", d: "M-10 -4 C-6 -12 6 -12 10 -4" },
      { type: "path", d: "M-1 -11 C-3 -2 -2 7 1 15" }
    ],
    grooveStroke: "#d9cebf",
    scale: 0.445
  },
  canine: {
    path: "M0 -27 C10 -27 17 -20 18 -7 C18 10 10 24 3 31 C1 33 -1 33 -3 31 C-10 24 -18 10 -18 -7 C-17 -20 -10 -27 0 -27 Z",
    grooves: [
      { type: "path", d: "M0 -20 C-1 -9 -1 4 0 15" },
      { type: "path", d: "M-5 -8 C-2 -12 2 -12 5 -8" }
    ],
    grooveStroke: "#e6ddd0",
    scale: 0.455
  },
  incisor: {
    path: "M0 -24 C12 -24 20 -17 20 -4 C20 10 13 21 5 28 C2 30 -2 30 -5 28 C-13 21 -20 10 -20 -4 C-20 -17 -12 -24 0 -24 Z",
    grooves: [
      { type: "path", d: "M-8 -12 C-4 -18 4 -18 8 -12" },
      { type: "path", d: "M0 -14 C-1 -7 -1 3 0 12" }
    ],
    grooveStroke: "#e6ddd0",
    scale: 0.45
  }
};

const ADULT_TOP_TOOTH_CHART = [
  { number: 1, nameKey: "thirdMolar", type: "molar" },
  { number: 2, nameKey: "secondMolar", type: "molar" },
  { number: 3, nameKey: "firstMolar", type: "molar" },
  { number: 4, nameKey: "secondBicuspid", type: "premolar" },
  { number: 5, nameKey: "firstBicuspid", type: "premolar" },
  { number: 6, nameKey: "cuspid", type: "canine" },
  { number: 7, nameKey: "lateralIncisor", type: "incisor" },
  { number: 8, nameKey: "centralIncisor", type: "incisor" },
  { number: 9, nameKey: "centralIncisor", type: "incisor" },
  { number: 10, nameKey: "lateralIncisor", type: "incisor" },
  { number: 11, nameKey: "cuspid", type: "canine" },
  { number: 12, nameKey: "firstBicuspid", type: "premolar" },
  { number: 13, nameKey: "secondBicuspid", type: "premolar" },
  { number: 14, nameKey: "firstMolar", type: "molar" },
  { number: 15, nameKey: "secondMolar", type: "molar" },
  { number: 16, nameKey: "thirdMolar", type: "molar" }
];

const ADULT_BOTTOM_TOOTH_CHART = [
  { number: 32, nameKey: "thirdMolar", type: "molar" },
  { number: 31, nameKey: "secondMolar", type: "molar" },
  { number: 30, nameKey: "firstMolar", type: "molar" },
  { number: 29, nameKey: "secondBicuspid", type: "premolar" },
  { number: 28, nameKey: "firstBicuspid", type: "premolar" },
  { number: 27, nameKey: "cuspid", type: "canine" },
  { number: 26, nameKey: "lateralIncisor", type: "incisor" },
  { number: 25, nameKey: "centralIncisor", type: "incisor" },
  { number: 24, nameKey: "centralIncisor", type: "incisor" },
  { number: 23, nameKey: "lateralIncisor", type: "incisor" },
  { number: 22, nameKey: "cuspid", type: "canine" },
  { number: 21, nameKey: "firstBicuspid", type: "premolar" },
  { number: 20, nameKey: "secondBicuspid", type: "premolar" },
  { number: 19, nameKey: "firstMolar", type: "molar" },
  { number: 18, nameKey: "secondMolar", type: "molar" },
  { number: 17, nameKey: "thirdMolar", type: "molar" }
];

const CHILD_TOP_TOOTH_CHART = [
  { number: "A", nameKey: "secondMolar", type: "molar" },
  { number: "B", nameKey: "firstMolar", type: "molar" },
  { number: "C", nameKey: "cuspid", type: "canine" },
  { number: "D", nameKey: "lateralIncisor", type: "incisor" },
  { number: "E", nameKey: "centralIncisor", type: "incisor" },
  { number: "F", nameKey: "centralIncisor", type: "incisor" },
  { number: "G", nameKey: "lateralIncisor", type: "incisor" },
  { number: "H", nameKey: "cuspid", type: "canine" },
  { number: "I", nameKey: "firstMolar", type: "molar" },
  { number: "J", nameKey: "secondMolar", type: "molar" }
];

const CHILD_BOTTOM_TOOTH_CHART = [
  { number: "T", nameKey: "secondMolar", type: "molar" },
  { number: "S", nameKey: "firstMolar", type: "molar" },
  { number: "R", nameKey: "cuspid", type: "canine" },
  { number: "Q", nameKey: "lateralIncisor", type: "incisor" },
  { number: "P", nameKey: "centralIncisor", type: "incisor" },
  { number: "O", nameKey: "centralIncisor", type: "incisor" },
  { number: "N", nameKey: "lateralIncisor", type: "incisor" },
  { number: "M", nameKey: "cuspid", type: "canine" },
  { number: "L", nameKey: "firstMolar", type: "molar" },
  { number: "K", nameKey: "secondMolar", type: "molar" }
];
const SEGMENT_LABEL_KEYS = {
  "Front Top Left": "brushing.segments.frontTopLeft",
  "Front Top Right": "brushing.segments.frontTopRight",
  "Back Top Right": "brushing.segments.backTopRight",
  "Back Top Left": "brushing.segments.backTopLeft",
  "Front Bottom Left": "brushing.segments.frontBottomLeft",
  "Front Bottom Right": "brushing.segments.frontBottomRight",
  "Back Bottom Right": "brushing.segments.backBottomRight",
  "Back Bottom Left": "brushing.segments.backBottomLeft"
};

const AGE_HYGIENE_COACHING = {
  manual: {
    infant: [
      { do: "Do: Use tiny gentle circles with caregiver help.", avoid: "Avoid: Hard scrubbing on gums." },
      { do: "Do: Brush the gumline softly.", avoid: "Avoid: Skipping the back teeth." },
      { do: "Do: Keep the brush angled at 45 degrees.", avoid: "Avoid: Sharing toothbrushes." }
    ],
    toddler: [
      { do: "Do: Count slow circles on each tooth.", avoid: "Avoid: Biting or chewing the brush." },
      { do: "Do: Clean front and back surfaces.", avoid: "Avoid: Rushing only the front teeth." },
      { do: "Do: Spit and rinse after brushing.", avoid: "Avoid: Swallowing toothpaste foam." }
    ],
    primary: [
      { do: "Do: Use a pea-size toothpaste amount.", avoid: "Avoid: Fast side-to-side scrubbing." },
      { do: "Do: Follow the full top and bottom route.", avoid: "Avoid: Missing the inner surfaces." },
      { do: "Do: Brush your tongue at the end.", avoid: "Avoid: Pressing too hard on enamel." }
    ],
    mixed: [
      { do: "Do: Keep gentle pressure at the gumline.", avoid: "Avoid: Scrubbing with a flat angle." },
      { do: "Do: Track each surface before moving on.", avoid: "Avoid: Skipping erupting molars." },
      { do: "Do: Replace your brush every 3 months.", avoid: "Avoid: Using frayed bristles." }
    ],
    adult: [
      { do: "Do: Keep short, controlled circles.", avoid: "Avoid: Over-brushing one hot spot." },
      { do: "Do: Finish both inner and outer rows.", avoid: "Avoid: Ignoring back molars." },
      { do: "Do: Let bristles do the work gently.", avoid: "Avoid: Heavy pressure near gums." }
    ]
  },
  electric: {
    infant: [
      { do: "Do: Place and pause on each surface.", avoid: "Avoid: Dragging the head across gums." },
      { do: "Do: Lift then place at each next tooth.", avoid: "Avoid: Sliding tooth-to-tooth quickly." },
      { do: "Do: Keep very light pressure.", avoid: "Avoid: Pressing hard with the motor on." }
    ],
    toddler: [
      { do: "Do: Let the brush do the motion for you.", avoid: "Avoid: Scrubbing like a manual brush." },
      { do: "Do: Lift and place between each tooth.", avoid: "Avoid: Sliding over contact points." },
      { do: "Do: Pause 1 to 2 seconds per surface.", avoid: "Avoid: Rushing past inner surfaces." }
    ],
    primary: [
      { do: "Do: Hold the head still, then move on.", avoid: "Avoid: Side-to-side wrist scrubbing." },
      { do: "Do: Lift before each position switch.", avoid: "Avoid: Sweeping continuously across rows." },
      { do: "Do: Keep the gumline angle steady.", avoid: "Avoid: Pressing until bristles flatten." }
    ],
    mixed: [
      { do: "Do: Guide slowly tooth-by-tooth.", avoid: "Avoid: Sliding over several teeth at once." },
      { do: "Do: Lift and reseat at each contact point.", avoid: "Avoid: Continuous dragging across enamel." },
      { do: "Do: Use timer beats for each area.", avoid: "Avoid: Overworking only front teeth." }
    ],
    adult: [
      { do: "Do: Place, pause, lift, then reposition.", avoid: "Avoid: Scrub-sliding across the arch." },
      { do: "Do: Keep gentle pressure at 45 degrees.", avoid: "Avoid: Pressing hard into the gumline." },
      { do: "Do: Treat each surface as a separate pass.", avoid: "Avoid: One-pass sweeping over all surfaces." }
    ]
  }
};

function splitArch(count) {
  return {
    left: Math.ceil(count / 2),
    right: Math.floor(count / 2)
  };
}

function buildSegments(topTeeth, bottomTeeth) {
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

function buildTimeline(segments, secondsPerTooth, transitionBufferSeconds) {
  const timeline = [];
  let cursor = 0;
  const transitionCount = Math.max(0, segments.length - 1);

  function buildTransitionPrompt(order) {
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
      const transitionPrompt = buildTransitionPrompt(transitionOrder);

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

function getLabelSide(label) {
  if (!label) {
    return null;
  }

  return label.includes("Left") ? "left" : label.includes("Right") ? "right" : null;
}

function getLabelJaw(label) {
  if (!label) {
    return null;
  }

  return label.includes("Top") ? "top" : label.includes("Bottom") ? "bottom" : null;
}

function getSegmentLabel(t, label) {
  return t(SEGMENT_LABEL_KEYS[label] || label);
}

function formatMinutes(totalSeconds) {
  const safeSeconds = Math.max(0, Math.round(Number(totalSeconds || 120)));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;

  if (seconds === 0) {
    return String(minutes);
  }

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function selectVisibleToothChart(chart, count) {
  const safeCount = Math.max(0, Math.min(chart.length, count));
  const start = Math.floor((chart.length - safeCount) / 2);
  return chart.slice(start, start + safeCount);
}

function getToothLabel(t, tooth) {
  if (!tooth) {
    return "";
  }

  return t("brushing.toothChart.label", {
    number: tooth.number,
    name: t(`brushing.toothChart.names.${tooth.nameKey}`)
  });
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getBouncePointForPhase(fromPoint, toPoint, phase) {
  const safePhase = clampNumber(phase, 0, 1);
  const normalized = safePhase <= 0.5
    ? safePhase / 0.5
    : (1 - safePhase) / 0.5;

  return {
    x: fromPoint.x + (toPoint.x - fromPoint.x) * normalized,
    y: fromPoint.y + (toPoint.y - fromPoint.y) * normalized
  };
}

function getBounceRadiusForPhase(phase) {
  const safePhase = clampNumber(phase, 0, 1);
  const normalized = safePhase <= 0.5
    ? safePhase / 0.5
    : (1 - safePhase) / 0.5;

  return 5.2 + (6.4 - 5.2) * normalized;
}

function splitMessageIntoLines(message, maxLineLength = 24, maxLines = 3) {
  const words = String(message || "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) {
    return [];
  }

  const lines = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;

    if (next.length <= maxLineLength) {
      current = next;
      continue;
    }

    if (current) {
      lines.push(current);
      current = word;
    } else {
      lines.push(word.slice(0, maxLineLength));
      current = word.slice(maxLineLength);
    }

    if (lines.length >= maxLines) {
      break;
    }
  }

  if (lines.length < maxLines && current) {
    lines.push(current);
  }

  return lines.slice(0, maxLines);
}

function formatTenths(seconds) {
  return Math.max(0, seconds).toFixed(1);
}

function mixColor(start, end, amount) {
  return start.map((channel, index) => Math.round(channel + (end[index] - channel) * clampNumber(amount, 0, 1)));
}

function toRgb(channels) {
  return `rgb(${channels[0]} ${channels[1]} ${channels[2]})`;
}

function getCountdownSignal(remainingMs, totalMs) {
  const safeTotalMs = Math.max(1, Number(totalMs) || 0);
  const progress = clampNumber(1 - (Number(remainingMs) || 0) / safeTotalMs, 0, 1);
  const red = [239, 68, 68];
  const yellow = [250, 204, 21];
  const green = [34, 197, 94];
  const warmWhite = [255, 252, 245];
  const coolWhite = [240, 255, 245];
  const base = progress < 0.5
    ? mixColor(red, yellow, progress / 0.5)
    : mixColor(yellow, green, (progress - 0.5) / 0.5);
  const accent = mixColor(base, [255, 255, 255], 0.18);
  const label = progress < 0.5
    ? mixColor(warmWhite, [255, 244, 184], progress / 0.5)
    : mixColor([255, 244, 184], coolWhite, (progress - 0.5) / 0.5);

  return {
    primary: toRgb(base),
    accent: toRgb(accent),
    label: toRgb(label)
  };
}

function BrushingGuide({ timer, brushingPhase, values, bpmData, selectedBpm, isMobile, playbackSeconds, brushingMusicElapsedSeconds, startCountdownTotalMs = 5000, startCountdownRemainingMs = 0, brushingHand, brushType = "manual", hideIntro = false, onCueChange, completionMessage = "", brushControlCue, primaryBrushActionLabel, onPrimaryBrushAction, onRestartBrushing, ageUiProfile, embedded = false, showThemePanel = true }) {
  const { t } = useTranslation();
  const totalSeconds = Number(bpmData?.totalBrushingSeconds || 120);
  const topTeeth = Number(values?.top || 16);
  const bottomTeeth = Number(values?.bottom || 16);
  const mapCenter = { x: 180, y: 214 };
  const useChildToothChart = topTeeth <= 10 && bottomTeeth <= 10 && topTeeth + bottomTeeth <= 20;
  const topToothChart = selectVisibleToothChart(useChildToothChart ? CHILD_TOP_TOOTH_CHART : ADULT_TOP_TOOTH_CHART, topTeeth);
  const bottomToothChart = selectVisibleToothChart(useChildToothChart ? CHILD_BOTTOM_TOOTH_CHART : ADULT_BOTTOM_TOOTH_CHART, bottomTeeth);
  // The ball travels to the tooth and back in one beat cycle (phase 0→0.5→1).
  // This means it visually contacts the tooth twice per beat (at 0.5 and again at 0 of next beat).
  // Halving the BPM makes the full round-trip span two beats so the downbeat lands on the tooth.
  const safeBpm = Math.max(40, Math.min(240, (Number(selectedBpm) || 120) / 8));
  const toothDurationSeconds = Number(bpmData?.secondsPerTooth || totalSeconds / Math.max(1, (topTeeth + bottomTeeth) * 2));
  const transitionBufferSeconds = Number(bpmData?.transitionBufferSeconds || 1);
  const segments = buildSegments(topTeeth, bottomTeeth);
  const timeline = buildTimeline(segments, toothDurationSeconds, transitionBufferSeconds);
  const toothEntries = timeline.filter((entry) => entry.type === "tooth");
  const beatDurationMs = Math.max(220, 60000 / safeBpm);
  const normalizedBeatAnchorMs = (((Math.max(0, Number(playbackSeconds) || 0) * 1000) % beatDurationMs) + beatDurationMs) % beatDurationMs;
  const isPaused = brushingPhase === "paused";
  const beatPhaseOffsetMs = timer.running
    ? -normalizedBeatAnchorMs
    : 0;
  const elapsedSeconds = brushingPhase === "complete"
    ? totalSeconds
    : (timer.running || isPaused)
      ? Math.min(totalSeconds, Math.max(0, brushingMusicElapsedSeconds))
      : 0;
  const completedToothEntries = toothEntries.filter((entry) => entry.endsAt <= elapsedSeconds).length;
  const activeEntry = (timer.running || isPaused)
    ? timeline.find((entry) => elapsedSeconds >= entry.startsAt && elapsedSeconds < entry.endsAt) || null
    : null;
  const activeToothEntry = activeEntry?.type === "tooth" ? activeEntry : null;
  const activeToothProgress = activeToothEntry
    ? clampNumber((elapsedSeconds - activeToothEntry.startsAt) / Math.max(0.001, activeToothEntry.endsAt - activeToothEntry.startsAt), 0, 1)
    : 0;
  const progress = brushingPhase === "complete"
    ? 100
    : toothEntries.length > 0
      ? Math.min(100, ((completedToothEntries + activeToothProgress) / toothEntries.length) * 100)
      : 0;
  const orientationLabel = activeEntry?.type === "transition" ? activeEntry.toLabel : activeToothEntry?.label;
  const activeSide = getLabelSide(orientationLabel);
  const activeJaw = getLabelJaw(orientationLabel);
  const isFrontSurface = activeToothEntry?.surface === "front";
  const nextMoveSeconds = activeEntry ? Math.max(1, Math.ceil(activeEntry.endsAt - elapsedSeconds)) : null;
  const nextTransition = (timer.running || isPaused)
    ? timeline.find((entry) => entry.type === "transition" && entry.startsAt >= elapsedSeconds)
    : null;
  const nextSectionSeconds = nextTransition ? Math.max(1, Math.ceil(nextTransition.startsAt - elapsedSeconds)) : null;
  const transitionCountdownSeconds = activeEntry?.type === "transition"
    ? Math.max(0, activeEntry.endsAt - elapsedSeconds)
    : 0;
  const activeToothMeta = activeToothEntry
    ? activeToothEntry.jaw === "top"
      ? topToothChart[activeToothEntry.mapIndex]
      : bottomToothChart[activeToothEntry.mapIndex]
    : null;
  const mapCenterRadius = 42;
  const agePhase = useMemo(() => {
    const total = topTeeth + bottomTeeth;
    if (total <= 4) return "infant";
    if (total <= 12) return "toddler";
    if (total <= 20) return "primary";
    if (total <= 28) return "mixed";
    return "adult";
  }, [topTeeth, bottomTeeth]);
  const tips = useMemo(() => getBrushTechniqueTips(brushType, ageUiProfile?.phase || agePhase), [agePhase, ageUiProfile?.phase, brushType]);
  const [activeTip, setActiveTip] = useState("");
  const [animationNowMs, setAnimationNowMs] = useState(() => Date.now());
  const tipIndexRef = useRef(0);

  useEffect(() => {
    if (brushingPhase !== "running") {
      return;
    }

    // Show first tip immediately when brushing begins
    setActiveTip(tips[tipIndexRef.current % tips.length] || "");

    const interval = window.setInterval(() => {
      tipIndexRef.current += 1;
      setActiveTip(tips[tipIndexRef.current % tips.length] || "");
    }, 18000); // rotate every 18 seconds

    return () => {
      window.clearInterval(interval);
    };
  }, [brushingPhase, tips]);

  useEffect(() => {
    if (!timer.running) {
      return;
    }

    let animationFrameId = 0;

    const tick = () => {
      setAnimationNowMs(Date.now());
      animationFrameId = window.requestAnimationFrame(tick);
    };

    animationFrameId = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(animationFrameId);
    };
  }, [timer.running]);

  useEffect(() => {
    if (!onCueChange) {
      return;
    }

    if (brushingPhase === "countdown") {
      onCueChange({
        kind: "countdown",
        title: t("brushing.cue.countdownTitle"),
        detail: t("brushing.cue.countdownDetail", { seconds: formatTenths(startCountdownRemainingMs / 1000) })
      });
      return;
    }

    if (brushingPhase === "complete") {
      onCueChange({
        kind: "complete",
        title: t("brushing.cue.completeTitle"),
        detail: ""
      });
      return;
    }

    if (brushingPhase === "paused") {
      onCueChange({
        kind: "paused",
        title: t("brushing.cue.pausedTitle"),
        detail: t("brushing.cue.pausedDetail")
      });
      return;
    }

    if (brushingPhase === "awaitingPlayback") {
      onCueChange({
        kind: "awaitingPlayback",
        title: t("brushing.cue.awaitingPlaybackTitle"),
        detail: t("brushing.cue.awaitingPlaybackDetail")
      });
      return;
    }

    if (!timer.running) {
      onCueChange({
        kind: "ready",
        title: t("brushing.cue.readyTitle"),
        detail: t("brushing.cue.readyDetail", { hand: t(`common.hands.${brushingHand}`) })
      });
      return;
    }

    if (activeEntry?.type === "transition") {
      if (activeEntry.transitionCue === "switchHand") {
        onCueChange({
          kind: "side-switch",
          title: t("brushing.cue.switchHandTitle"),
          detail: t("brushing.cue.switchHandDetail", {
            hand: t(`common.hands.${brushingHand}`)
          })
        });
        return;
      }

      if (activeEntry.transitionCue === "rotate") {
        onCueChange({
          kind: "transition",
          title: t("brushing.cue.rotateTitle"),
          detail: t("brushing.cue.rotateDetail")
        });
        return;
      }

      const fromRight = activeEntry.fromLabel.includes("Right");
      const toRight = activeEntry.toLabel.includes("Right");
      const fromTop = activeEntry.fromLabel.includes("Top");
      const toTop = activeEntry.toLabel.includes("Top");

      if (fromTop !== toTop) {
        onCueChange({
          kind: "halfway",
          title: t("brushing.cue.halfwayTitle"),
          detail: t("brushing.cue.halfwayDetail", {
            fromJaw: t(`brushing.jaw.${fromTop ? "top" : "bottom"}`),
            toJaw: t(`brushing.jaw.${toTop ? "top" : "bottom"}`),
            hand: t(`common.hands.${brushingHand}`)
          })
        });
        return;
      }

      if (fromRight !== toRight) {
        onCueChange({
          kind: "side-switch",
          title: t("brushing.cue.sideSwitchTitle"),
          detail: t("brushing.cue.sideSwitchDetail", {
            fromSide: t(`brushing.side.${fromRight ? "right" : "left"}`),
            toSide: t(`brushing.side.${toRight ? "right" : "left"}`),
            hand: t(`common.hands.${brushingHand}`)
          })
        });
        return;
      }

      onCueChange({
        kind: "transition",
        title: t("brushing.cue.transitionTitle"),
        detail: t("brushing.cue.transitionDetail", {
          fromLabel: getSegmentLabel(t, activeEntry.fromLabel),
          toLabel: getSegmentLabel(t, activeEntry.toLabel),
          seconds: nextMoveSeconds
        })
      });
      return;
    }

    if (activeToothEntry) {
      onCueChange({
        kind: "brushing",
        title: t("brushing.cue.activeTitle", { label: getSegmentLabel(t, activeToothEntry.label) }),
        detail: t("brushing.cue.activeDetail", {
          position: activeToothEntry.segmentPosition,
          size: activeToothEntry.segmentSize,
          hand: t(`common.hands.${brushingHand}`),
          seconds: nextMoveSeconds
        })
      });
      return;
    }

    onCueChange(null);
  }, [activeEntry, activeToothEntry, brushingHand, brushingPhase, nextMoveSeconds, onCueChange, startCountdownRemainingMs, t, timer.running]);

  const topPoints = createJawToothLayout({ chart: topToothChart, jaw: "top", child: useChildToothChart, mapCenter });
  const bottomPoints = createJawToothLayout({ chart: bottomToothChart, jaw: "bottom", child: useChildToothChart, mapCenter });
  const activeToothPoint = activeToothEntry
    ? activeToothEntry.jaw === "top"
      ? topPoints[activeToothEntry.mapIndex]
      : bottomPoints[activeToothEntry.mapIndex]
    : null;
  const activeBounceStartPoint = activeToothPoint ? mapCenter : null;
  const pausedBeatPhase = beatDurationMs > 0 ? normalizedBeatAnchorMs / beatDurationMs : 0;
  const runningBeatPhase = beatDurationMs > 0
    ? ((((animationNowMs + beatPhaseOffsetMs) % beatDurationMs) + beatDurationMs) % beatDurationMs) / beatDurationMs
    : 0;
  const activeBeatPhase = timer.running ? runningBeatPhase : pausedBeatPhase;
  const liveBouncePoint = activeToothPoint && activeBounceStartPoint
    ? getBouncePointForPhase(activeToothPoint, activeBounceStartPoint, activeBeatPhase)
    : null;
  const liveTailPoints = activeToothPoint && activeBounceStartPoint
    ? [0.2, 0.12, 0.06].map((offset) => {
        const phase = (((activeBeatPhase - offset) % 1) + 1) % 1;
        return getBouncePointForPhase(activeToothPoint, activeBounceStartPoint, phase);
      })
    : [];
  const liveBounceRadius = getBounceRadiusForPhase(activeBeatPhase);

  function getToothState(jaw, mapIndex) {
    if (brushingPhase === "complete") {
      return { frontDone: true, backDone: true, activeSurface: null };
    }

    const state = {
      frontDone: false,
      backDone: false,
      activeSurface: null
    };

    if (!timer.running && brushingPhase !== "paused") {
      return state;
    }

    state.frontDone = timeline.some(
      (entry) =>
        entry.type === "tooth" &&
        entry.jaw === jaw &&
        entry.surface === "front" &&
        entry.mapIndex === mapIndex &&
        entry.endsAt <= elapsedSeconds
    );
    state.backDone = timeline.some(
      (entry) =>
        entry.type === "tooth" &&
        entry.jaw === jaw &&
        entry.surface === "back" &&
        entry.mapIndex === mapIndex &&
        entry.endsAt <= elapsedSeconds
    );

    if (activeToothEntry?.jaw === jaw && activeToothEntry.mapIndex === mapIndex) {
      state.activeSurface = activeToothEntry.surface;
    }

    return state;
  }

  const brushFacingDirection = activeSide
    ? brushingHand === "right"
      ? activeSide
      : activeSide === "left"
        ? "right"
        : "left"
    : null;
  const transitionFromSide = activeEntry?.type === "transition" ? getLabelSide(activeEntry.fromLabel) : null;
  const transitionToSide = activeEntry?.type === "transition" ? getLabelSide(activeEntry.toLabel) : null;
  const transitionFromJaw = activeEntry?.type === "transition" ? getLabelJaw(activeEntry.fromLabel) : null;
  const transitionToJaw = activeEntry?.type === "transition" ? getLabelJaw(activeEntry.toLabel) : null;
  const transitionDirection = transitionFromSide && transitionToSide && transitionFromSide !== transitionToSide
    ? `${t(`brushing.side.${transitionFromSide}`)} -> ${t(`brushing.side.${transitionToSide}`)}`
    : transitionFromJaw && transitionToJaw && transitionFromJaw !== transitionToJaw
      ? `${t(`brushing.jaw.${transitionFromJaw}`)} -> ${t(`brushing.jaw.${transitionToJaw}`)}`
      : null;
  const centerLabel = brushingPhase === "countdown"
    ? t("brushing.guide.startLabel")
    : brushingPhase === "complete"
      ? ""
    : activeEntry?.type === "transition"
      ? t("brushing.guide.actionLabel")
      : `${Math.round(progress)}%`;
  const centerValue = brushingPhase === "countdown"
    ? formatTenths(startCountdownRemainingMs / 1000)
    : activeEntry?.type === "transition"
      ? activeEntry.transitionCue === "rotate" && transitionDirection
        ? `${t("brushing.switchPrompts.rotate")}: ${transitionDirection}`
        : activeEntry.transitionCue === "transition" && transitionDirection
          ? `${t("brushing.switchPrompts.transition")}: ${transitionDirection}`
          : t(`brushing.switchPrompts.${activeEntry.transitionCue || "transition"}`)
      : brushingPhase === "complete"
        ? t("brushing.guide.cleanShineLabel")
        : t("brushing.guide.brushNowLabel");
  const completionLines = brushingPhase === "complete" && completionMessage
    ? splitMessageIntoLines(completionMessage, 24, 3)
    : [];
  const countdownSignal = getCountdownSignal(startCountdownRemainingMs, startCountdownTotalMs);
  const [countdownWhole = "0", countdownFraction = "0"] = centerValue.split(".");
  const activeAgePhase = ageUiProfile?.phase || agePhase;
  const coachingMode = brushType === "electric" ? "electric" : "manual";
  const coachingSet = AGE_HYGIENE_COACHING[coachingMode][activeAgePhase] || AGE_HYGIENE_COACHING[coachingMode].adult;
  const coachingIndex = Math.floor(Math.max(0, elapsedSeconds) / 14) % coachingSet.length;
  const activeCoaching = coachingSet[coachingIndex] || coachingSet[0];
  const showMapCoaching = brushingPhase === "countdown" || brushingPhase === "running" || brushingPhase === "paused";
  const showElectricLiftCue = brushType === "electric" && activeEntry?.type === "transition";
  const overlayPhase = brushingPhase === "complete"
    ? "complete"
    : brushingPhase === "running" || brushingPhase === "paused"
      ? progress >= 82
        ? "nearComplete"
        : progress >= 18
          ? "mid"
          : "start"
      : brushingPhase === "countdown"
        ? "start"
        : "idle";

  function renderTooth(point, jaw, meta, mapIndex) {
    const state = getToothState(jaw, mapIndex);
    const activeSurface = state.activeSurface;
    const toothId = `${jaw}-${mapIndex + 1}`;
    const toothShape = TOOTH_SHAPES[meta?.type || "molar"];
    const toothLabel = getToothLabel(t, meta);

    return (
      <g
        key={toothId}
        transform={`translate(${point.x} ${point.y}) rotate(${point.rotationDeg ?? point.angleDeg - 90}) scale(${toothShape.scale * (point.layoutScale || 1)})`}
        className={`tooth-svg ${meta?.type || "molar"}`}
      >
        <title>{toothLabel}</title>
        <defs>
          <clipPath id={`${toothId}-back-surface`}>
            <rect x="-30" y="-30" width="60" height="30" />
          </clipPath>
          <clipPath id={`${toothId}-front-surface`}>
            <rect x="-30" y="-1" width="60" height="38" />
          </clipPath>
        </defs>
        <path className="tooth-body-base" d={toothShape.path} fill="url(#toothFill)" filter="url(#softShadow)" />
        <path
          className={`tooth-face back-face${state.backDone ? " clean" : ""}${activeSurface === "back" ? " active-surface" : ""}`}
          d={toothShape.path}
          clipPath={`url(#${toothId}-back-surface)`}
        />
        <path
          className={`tooth-face front-face${state.frontDone ? " clean" : ""}${activeSurface === "front" ? " active-surface" : ""}`}
          d={toothShape.path}
          clipPath={`url(#${toothId}-front-surface)`}
        />
        <path className="tooth-outline" d={toothShape.path} />
        {toothShape.grooves.map((groove, grooveIndex) => (
          groove.type === "ellipse" ? (
            <ellipse
              key={`${toothId}-groove-${grooveIndex}`}
              className="tooth-groove"
              cx={groove.cx}
              cy={groove.cy}
              rx={groove.rx}
              ry={groove.ry}
              stroke={toothShape.grooveStroke}
            />
          ) : (
            <path key={`${toothId}-groove-${grooveIndex}`} className="tooth-groove" d={groove.d} stroke={toothShape.grooveStroke} />
          )
        ))}
      </g>
    );
  }

  const guideClassName = `${embedded ? "guide guide-embedded" : "card guide"} ${ageUiProfile?.themeClassName || ""}`.trim();

  return (
    <section className={guideClassName}>
      {!embedded && (
        <>
          <h2>{t("brushing.guide.title")}</h2>
          {!hideIntro && (
            <p>
              {isMobile
                ? t("brushing.guide.introMobile", { minutes: formatMinutes(totalSeconds) })
                : t("brushing.guide.introDesktop", { minutes: formatMinutes(totalSeconds) })}
            </p>
          )}
        </>
      )}

        {!isMobile && (
          <div className="guide-top-controls">
            <div className={`brush-cue-card${brushControlCue?.kind ? ` ${brushControlCue.kind}` : ""}`} aria-live="polite">
              <strong>{brushControlCue?.title || t("brushing.readyTitle")}</strong>
              {(brushControlCue?.detail || !brushControlCue)
                ? <span>{brushControlCue?.detail || t("brushing.readyDetail", { hand: t(`common.hands.${brushingHand}`) })}</span>
                : null}
            </div>
            <div className="session-actions guide-session-actions">
              <button
                type="button"
                className="action-btn"
                onClick={onPrimaryBrushAction}
              >
                {primaryBrushActionLabel}
              </button>
              <button type="button" className="action-btn secondary" onClick={onRestartBrushing}>
                {t("brushing.stop")}
              </button>
            </div>
          </div>
        )}


      <div className="guide-map-shell">
        <AgeOverlay
          ageGroup={ageUiProfile?.phase || "adult"}
          themeId={ageUiProfile?.overlayThemeId}
          phase={overlayPhase}
          className="guide-map-age-overlay"
        />
        {showThemePanel && <AgeThemePanel profile={ageUiProfile} variant="guide" className="guide-age-overlay" chipLimit={2} />}
        <div className="mouth-map" role="img" aria-label={t("brushing.guide.mouthMapAria")}>
        {brushFacingDirection && (
          <div className={`map-hand-orientation-layer ${brushFacingDirection === "left" ? "facing-left" : "facing-right"}${activeJaw ? ` jaw-${activeJaw}` : ""}`} aria-hidden="true">
            <div className="brush-hand-orientation-visual" aria-hidden="true">
              <span className="brush-hand-orientation-hand" />
              <span className="brush-hand-orientation-handle" />
              <span className="brush-hand-orientation-neck" />
              <span className="brush-hand-orientation-head">
                <span className="brush-hand-orientation-bristles" />
              </span>
            </div>
          </div>
        )}
        <svg viewBox="0 0 360 420" preserveAspectRatio="xMidYMid meet">
          <defs>
            <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0.6" dy="1.2" stdDeviation="1.2" floodColor="#b7aa95" floodOpacity="0.35" />
            </filter>
            <linearGradient id="toothFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#fffdf9" />
              <stop offset="100%" stopColor="#f4efe6" />
            </linearGradient>
          </defs>
          {topPoints.map((point, index) => renderTooth(point, "top", topToothChart[index], index))}

          {bottomPoints.map((point, index) => renderTooth(point, "bottom", bottomToothChart[index], index))}

          {(timer.running || isPaused) && activeToothPoint && activeBounceStartPoint && liveBouncePoint && (
            <g>
              {liveTailPoints[0] && (
                <circle
                  cx={liveTailPoints[0].x}
                  cy={liveTailPoints[0].y}
                  r="4.4"
                  className={`active-brush-tail tail-3 ${activeToothEntry?.surface || "front"}`}
                />
              )}
              {liveTailPoints[1] && (
                <circle
                  cx={liveTailPoints[1].x}
                  cy={liveTailPoints[1].y}
                  r="5"
                  className={`active-brush-tail tail-2 ${activeToothEntry?.surface || "front"}`}
                />
              )}
              {liveTailPoints[2] && (
                <circle
                  cx={liveTailPoints[2].x}
                  cy={liveTailPoints[2].y}
                  r="5.5"
                  className={`active-brush-tail tail-1 ${activeToothEntry?.surface || "front"}`}
                />
              )}
              <circle
                cx={liveBouncePoint.x}
                cy={liveBouncePoint.y}
                r={liveBounceRadius}
                className={`active-brush-ball ${activeToothEntry?.surface || "front"}`}
              />
            </g>
          )}

          {brushingPhase === "countdown" ? (
            <text x="180" y="216" textAnchor="middle" className="map-score countdown">
              <tspan className="map-score-whole" style={{ fill: countdownSignal.primary }}>{countdownWhole}</tspan>
              <tspan className="map-score-fraction" style={{ fill: countdownSignal.accent }}>{`.${countdownFraction}`}</tspan>
            </text>
          ) : brushingPhase === "complete" && completionLines.length > 0 ? (
            <text x="180" y="206" textAnchor="middle" className="map-score complete-message">
              {completionLines.map((line, index) => (
                <tspan key={`${line}-${index}`} x="180" dy={index === 0 ? 0 : 14}>{line}</tspan>
              ))}
            </text>
          ) : (
            <text
              x="180"
              y="216"
              textAnchor="middle"
              className={`map-score word${activeEntry?.type === "transition" ? " orientation-emphasis" : ""}`}
            >
              {centerValue}
            </text>
          )}
          {centerLabel && (
            <text
              x="180"
              y="238"
              textAnchor="middle"
              className={`map-score-label${brushingPhase === "countdown" ? " countdown" : ""}`}
              style={brushingPhase === "countdown" ? { fill: countdownSignal.label } : undefined}
            >
              {centerLabel}
            </text>
          )}
          {showElectricLiftCue && (
            <text
              key={`electric-cue-${activeEntry?.key || "idle"}`}
              x="180"
              y="252"
              textAnchor="middle"
              className="map-electric-cue pulse-once"
              aria-hidden="true"
            >
              Lift + Place
            </text>
          )}
          {showMapCoaching && activeCoaching && (
            <text x="180" y={activeJaw === "bottom" ? "154" : "264"} textAnchor="middle" className="map-coaching" aria-hidden="true">
              <tspan x="180" dy="0">{activeCoaching.do}</tspan>
              <tspan x="180" dy="14">{activeCoaching.avoid}</tspan>
            </text>
          )}
        </svg>
        </div>
      </div>
      {brushingPhase === "running" && activeTip && (
        <p className="guide-technique-tip" aria-live="polite">{activeTip}</p>
      )}

    </section>
  );
}

export default BrushingGuide;
