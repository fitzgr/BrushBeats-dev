import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import AgeThemePanel from "./AgeThemePanel";
import AgeOverlay from "./AgeOverlay";
import { getBrushTechniqueTips } from "../lib/reinforcementMessages";
import { buildSegments, buildTimeline, getActiveTimelineEntry } from "../lib/brushingTimeline";

function toRadians(degrees) {
  return (degrees * Math.PI) / 180;
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

function parseSegmentKey(key) {
  const match = String(key || "").match(/^(front|back)-(top|bottom)-(left|right)$/);
  if (!match) {
    return null;
  }

  return {
    surface: match[1],
    jaw: match[2],
    side: match[3]
  };
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

function getActiveToothPulseMs(bpm) {
  const safeBpm = Number(bpm);
  if (!Number.isFinite(safeBpm) || safeBpm <= 0) {
    return 760;
  }

  return clampNumber(Math.round((60 / safeBpm) * 1000), 375, 1200);
}

const ROW_CELEBRATION_DURATION_MS = 3800;
const TOTAL_BRUSH_ROWS = 4;

function getRowNumberFromLabel(label) {
  if (!label) {
    return null;
  }

  if (label.includes("Front Top")) {
    return 1;
  }

  if (label.includes("Back Top")) {
    return 2;
  }

  if (label.includes("Front Bottom")) {
    return 3;
  }

  if (label.includes("Back Bottom")) {
    return 4;
  }

  return null;
}

function getRowSurfaceTarget(rowNumber) {
  if (rowNumber === 1) {
    return { jaw: "top", surface: "front" };
  }

  if (rowNumber === 2) {
    return { jaw: "top", surface: "back" };
  }

  if (rowNumber === 3) {
    return { jaw: "bottom", surface: "front" };
  }

  if (rowNumber === 4) {
    return { jaw: "bottom", surface: "back" };
  }

  return null;
}

function getRippleDirectionFromLabel(label) {
  if (!label) {
    return "ltr";
  }

  return label.includes("Left") ? "rtl" : "ltr";
}

function getRowRippleDelayMs(x, direction) {
  const normalizedX = clampNumber((Number(x) - 32) / 296, 0, 1);
  const sweepProgress = direction === "rtl" ? 1 - normalizedX : normalizedX;
  return Math.round(sweepProgress * 760);
}

function detectLowPerformanceCelebrationMode() {
  if (typeof navigator === "undefined") {
    return false;
  }

  const cores = Number(navigator.hardwareConcurrency || 0);
  const memory = Number(navigator.deviceMemory || 0);
  return (Number.isFinite(cores) && cores > 0 && cores <= 4) || (Number.isFinite(memory) && memory > 0 && memory <= 2);
}

function drawCascadeTooth(ctx, x, y, size, alpha) {
  const scale = size / 18;

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.beginPath();
  ctx.moveTo(0, -9);
  ctx.bezierCurveTo(6, -9, 9, -4, 8, 1);
  ctx.bezierCurveTo(8, 6, 4, 9, 2, 9);
  ctx.bezierCurveTo(1, 9, 0, 7, 0, 5);
  ctx.bezierCurveTo(0, 7, -1, 9, -2, 9);
  ctx.bezierCurveTo(-4, 9, -8, 6, -8, 1);
  ctx.bezierCurveTo(-9, -4, -6, -9, 0, -9);
  ctx.closePath();
  ctx.fillStyle = `rgba(197, 224, 255, ${alpha})`;
  ctx.strokeStyle = `rgba(90, 151, 232, ${Math.min(0.52, alpha * 1.1)})`;
  ctx.lineWidth = 1.3;
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function RowCelebrationCascade({ celebration, reducedMotion, lowPerformanceMode }) {
  const canvasRef = useRef(null);
  const frameRef = useRef(0);

  useEffect(() => {
    return () => {
      if (frameRef.current) {
        window.cancelAnimationFrame(frameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    if (frameRef.current) {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = 0;
    }

    const width = Math.max(1, canvas.clientWidth || 360);
    const height = Math.max(1, canvas.clientHeight || 420);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);

    if (!celebration || reducedMotion) {
      return;
    }

    const particleCount = lowPerformanceMode ? 7 : 12;
    const particles = Array.from({ length: particleCount }, () => {
      const size = 8 + Math.random() * 6;
      const speed = lowPerformanceMode ? 0.06 + Math.random() * 0.05 : 0.08 + Math.random() * 0.08;
      return {
        x: width * (0.08 + Math.random() * 0.84),
        yStart: -size - Math.random() * height * 0.2,
        drift: (Math.random() - 0.5) * 14,
        sway: 8 + Math.random() * 10,
        swaySpeed: 0.003 + Math.random() * 0.004,
        speed,
        size,
        alpha: 0.14 + Math.random() * 0.18
      };
    });

    const startTime = performance.now();
    const durationMs = Number(celebration.durationMs || ROW_CELEBRATION_DURATION_MS);

    const paintFrame = (timestamp) => {
      const elapsedMs = timestamp - startTime;
      const progress = clampNumber(elapsedMs / durationMs, 0, 1);
      context.clearRect(0, 0, width, height);

      for (const particle of particles) {
        const travelY = particle.yStart + particle.speed * elapsedMs;
        const waveX = Math.sin(elapsedMs * particle.swaySpeed + particle.x * 0.02) * particle.sway;
        const x = particle.x + particle.drift * progress + waveX;
        const y = travelY;
        const fadeProgress = clampNumber(progress * 1.18, 0, 1);
        const lowerFade = clampNumber((y - height * 0.55) / (height * 0.5), 0, 1);
        const alpha = particle.alpha * (1 - fadeProgress) * (1 - lowerFade * 0.9);

        if (alpha > 0.015 && y < height * 1.02) {
          drawCascadeTooth(context, x, y, particle.size, alpha);
        }
      }

      if (elapsedMs < durationMs) {
        frameRef.current = window.requestAnimationFrame(paintFrame);
      } else {
        context.clearRect(0, 0, width, height);
      }
    };

    frameRef.current = window.requestAnimationFrame(paintFrame);

    return () => {
      if (frameRef.current) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = 0;
      }
      context.clearRect(0, 0, width, height);
    };
  }, [celebration, reducedMotion, lowPerformanceMode]);

  return <canvas className={`row-celebration-cascade${celebration ? " active" : ""}`} ref={canvasRef} aria-hidden="true" />;
}

function BrushingGuide({ timer, brushingPhase, values, bpmData, isMobile, brushingMusicElapsedSeconds, startCountdownTotalMs = 5000, startCountdownRemainingMs = 0, sessionStartSegmentKey = null, brushingHand, brushType = "manual", hideIntro = false, onCueChange, brushControlCue, primaryBrushActionLabel, onPrimaryBrushAction, onRestartBrushing, rotatingStartEnabled = false, onRotatingStartEnabledChange, ageUiProfile, embedded = false, showThemePanel = true }) {
  const { t } = useTranslation();
  const totalSeconds = Number(bpmData?.totalBrushingSeconds || 120);
  const topTeeth = Number(values?.top || 16);
  const bottomTeeth = Number(values?.bottom || 16);
  const mapCenter = { x: 180, y: 214 };
  const useChildToothChart = topTeeth <= 10 && bottomTeeth <= 10 && topTeeth + bottomTeeth <= 20;
  const topToothChart = selectVisibleToothChart(useChildToothChart ? CHILD_TOP_TOOTH_CHART : ADULT_TOP_TOOTH_CHART, topTeeth);
  const bottomToothChart = selectVisibleToothChart(useChildToothChart ? CHILD_BOTTOM_TOOTH_CHART : ADULT_BOTTOM_TOOTH_CHART, bottomTeeth);
  const totalTeeth = topTeeth + bottomTeeth;
  const expectedToothActions = totalTeeth * 2;
  const hasAlignedBpmSnapshot = Number(bpmData?.totalTeeth) === totalTeeth && Number.isFinite(Number(bpmData?.secondsPerTooth));
  const fallbackSecondsPerTooth = totalSeconds / Math.max(1, expectedToothActions);
  const toothDurationSeconds = hasAlignedBpmSnapshot ? Number(bpmData.secondsPerTooth) : fallbackSecondsPerTooth;
  const timingSourceLabel = hasAlignedBpmSnapshot ? "snapshot" : "live-fallback";
  const showTimingDebug = import.meta.env.DEV;
  const [showCompletionFlash, setShowCompletionFlash] = useState(false);
  const [rowCelebration, setRowCelebration] = useState(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const completionTonePlayedRef = useRef(false);
  const audioContextRef = useRef(null);
  const celebrationTimerRef = useRef(0);
  const lastCelebratedTransitionRef = useRef("");
  const transitionBufferSeconds = Number(bpmData?.transitionBufferSeconds || 1);
  const segments = useMemo(
    () => buildSegments(topTeeth, bottomTeeth, sessionStartSegmentKey),
    [bottomTeeth, sessionStartSegmentKey, topTeeth]
  );
  const timeline = buildTimeline(segments, toothDurationSeconds, transitionBufferSeconds);
  const toothEntries = timeline.filter((entry) => entry.type === "tooth");
  const isPaused = brushingPhase === "paused";
  const hasActiveBrushTimeline = brushingPhase === "running" || isPaused || timer.running;
  const elapsedSeconds = brushingPhase === "complete"
    ? totalSeconds
    : hasActiveBrushTimeline
      ? Math.min(totalSeconds, Math.max(0, Number(brushingMusicElapsedSeconds) || 0))
      : 0;
  const completedToothEntries = toothEntries.filter((entry) => entry.endsAt <= elapsedSeconds).length;
  const activeEntry = hasActiveBrushTimeline ? getActiveTimelineEntry(timeline, elapsedSeconds) : null;
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
  const nextMoveSeconds = activeEntry ? Math.max(1, Math.ceil(activeEntry.endsAt - elapsedSeconds)) : null;
  const agePhase = useMemo(() => {
    const total = topTeeth + bottomTeeth;
    if (total <= 4) return "infant";
    if (total <= 12) return "toddler";
    if (total <= 20) return "primary";
    if (total <= 28) return "mixed";
    return "adult";
  }, [topTeeth, bottomTeeth]);
  const tips = useMemo(() => getBrushTechniqueTips(brushType, ageUiProfile?.phase || agePhase), [agePhase, ageUiProfile?.phase, brushType]);
  const tipIndex = Math.floor(Math.max(0, elapsedSeconds) / 18) % Math.max(1, tips.length);
  const activeTip = brushingPhase === "running" ? (tips[tipIndex] || "") : "";
  const activeToothPulseMs = getActiveToothPulseMs(bpmData?.searchBpm || bpmData?.musicBpm || bpmData?.baseBpm || bpmData?.rawBpm);
  const lowPerformanceCelebrationMode = useMemo(() => detectLowPerformanceCelebrationMode(), []);
  const celebrationSurfaceTarget = useMemo(() => getRowSurfaceTarget(rowCelebration?.rowNumber), [rowCelebration?.rowNumber]);

  const triggerRowCompletionCelebration = useCallback((rowNumber, options = {}) => {
    const safeRow = Number(rowNumber);
    if (!Number.isFinite(safeRow) || safeRow < 1 || safeRow >= TOTAL_BRUSH_ROWS || reducedMotion) {
      return;
    }

    const direction = options.direction === "rtl" ? "rtl" : "ltr";
    const celebrationId = `${safeRow}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setRowCelebration({
      id: celebrationId,
      rowNumber: safeRow,
      direction,
      durationMs: ROW_CELEBRATION_DURATION_MS,
      theme: options.theme || "classic"
    });

    if (celebrationTimerRef.current) {
      window.clearTimeout(celebrationTimerRef.current);
    }

    celebrationTimerRef.current = window.setTimeout(() => {
      setRowCelebration((current) => (current?.id === celebrationId ? null : current));
    }, ROW_CELEBRATION_DURATION_MS);
  }, [reducedMotion]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const applyMotionPreference = () => {
      setReducedMotion(Boolean(mediaQuery.matches));
    };

    applyMotionPreference();
    mediaQuery.addEventListener("change", applyMotionPreference);

    return () => {
      mediaQuery.removeEventListener("change", applyMotionPreference);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (audioContextRef.current && typeof audioContextRef.current.close === "function") {
        audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }
      if (celebrationTimerRef.current) {
        window.clearTimeout(celebrationTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (brushingPhase === "idle" || brushingPhase === "countdown" || brushingPhase === "awaitingPlayback") {
      lastCelebratedTransitionRef.current = "";
      setRowCelebration(null);
      if (celebrationTimerRef.current) {
        window.clearTimeout(celebrationTimerRef.current);
      }
    }
  }, [brushingPhase]);

  useEffect(() => {
    if (reducedMotion || activeEntry?.type !== "transition") {
      return;
    }

    const transitionKey = String(activeEntry.key || `${activeEntry.fromLabel}-${activeEntry.toLabel}-${activeEntry.startsAt}-${activeEntry.endsAt}`);
    if (lastCelebratedTransitionRef.current === transitionKey) {
      return;
    }

    lastCelebratedTransitionRef.current = transitionKey;
    const completedRow = getRowNumberFromLabel(activeEntry.fromLabel);
    const nextRow = getRowNumberFromLabel(activeEntry.toLabel);
    if (!completedRow || !nextRow || completedRow === nextRow || completedRow >= TOTAL_BRUSH_ROWS) {
      return;
    }

    triggerRowCompletionCelebration(completedRow, {
      direction: getRippleDirectionFromLabel(activeEntry.fromLabel)
    });
  }, [activeEntry, reducedMotion, triggerRowCompletionCelebration]);

  useEffect(() => {
    if (brushingPhase !== "complete") {
      setShowCompletionFlash(false);
      completionTonePlayedRef.current = false;
      return;
    }

    setShowCompletionFlash(true);

    if (!completionTonePlayedRef.current && typeof window !== "undefined") {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;

      if (AudioContextClass) {
        try {
          const audioContext = audioContextRef.current || new AudioContextClass();
          audioContextRef.current = audioContext;

          const startTone = () => {
            const now = audioContext.currentTime;
            const pulseSpacingSeconds = 0.26;
            const pulseDurationSeconds = 0.2;
            const pulseFrequencies = [1174.66, 1318.51, 1567.98];

            pulseFrequencies.forEach((frequency, index) => {
              const pulseStart = now + index * pulseSpacingSeconds;
              const oscillator = audioContext.createOscillator();
              const gainNode = audioContext.createGain();

              oscillator.type = "square";
              oscillator.frequency.setValueAtTime(frequency, pulseStart);

              gainNode.gain.setValueAtTime(0.0001, pulseStart);
              gainNode.gain.exponentialRampToValueAtTime(0.48, pulseStart + 0.02);
              gainNode.gain.exponentialRampToValueAtTime(0.24, pulseStart + 0.11);
              gainNode.gain.exponentialRampToValueAtTime(0.0001, pulseStart + pulseDurationSeconds);

              oscillator.connect(gainNode);
              gainNode.connect(audioContext.destination);
              oscillator.start(pulseStart);
              oscillator.stop(pulseStart + pulseDurationSeconds + 0.02);
            });
          };

          if (audioContext.state === "suspended") {
            audioContext.resume().then(startTone).catch(() => {});
          } else {
            startTone();
          }

          completionTonePlayedRef.current = true;
        } catch {
          completionTonePlayedRef.current = true;
        }
      }
    }

    const completionFlashTimer = window.setTimeout(() => {
      setShowCompletionFlash(false);
    }, 2400);

    return () => {
      window.clearTimeout(completionFlashTimer);
    };
  }, [brushingPhase]);

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

  function getToothState(jaw, mapIndex) {
    if (brushingPhase === "complete") {
      return { frontDone: true, backDone: true, activeSurface: null };
    }

    const state = {
      frontDone: false,
      backDone: false,
      activeSurface: null
    };

    if (!hasActiveBrushTimeline) {
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
  const countdownPreviewSegment = brushingPhase === "countdown" && sessionStartSegmentKey
    ? segments.find((segment) => segment.key === sessionStartSegmentKey) || null
    : null;
  const countdownPreviewLabel = countdownPreviewSegment ? getSegmentLabel(t, countdownPreviewSegment.label) : null;
  const countdownPreviewTarget = useMemo(() => {
    if (!countdownPreviewSegment) {
      return null;
    }

    const parsed = parseSegmentKey(countdownPreviewSegment.key);
    if (!parsed) {
      return null;
    }

    const jawToothCount = parsed.jaw === "top" ? topTeeth : bottomTeeth;
    const split = Math.ceil(jawToothCount / 2);
    const startMapIndex = parsed.side === "left" ? 0 : Math.max(0, jawToothCount - 1);

    return {
      ...parsed,
      jawToothCount,
      split,
      startMapIndex
    };
  }, [bottomTeeth, countdownPreviewSegment, topTeeth]);
  const countdownStartPoint = useMemo(() => {
    if (!countdownPreviewTarget) {
      return null;
    }

    const pointSet = countdownPreviewTarget.jaw === "top" ? topPoints : bottomPoints;
    const point = pointSet[countdownPreviewTarget.startMapIndex];
    if (!point) {
      return null;
    }

    const labelOffsetX = countdownPreviewTarget.side === "left" ? -30 : 30;
    const labelOffsetY = countdownPreviewTarget.jaw === "top" ? -20 : 22;

    return {
      x: point.x,
      y: point.y,
      labelX: point.x + labelOffsetX,
      labelY: point.y + labelOffsetY,
      side: countdownPreviewTarget.side,
      jaw: countdownPreviewTarget.jaw
    };
  }, [bottomPoints, countdownPreviewTarget, topPoints]);
  const countdownPathTotalSteps = countdownPreviewSegment?.mapIndices?.length || 0;
  const countdownPathStepDurationMs = 85;
  const countdownPathPulseWindowMs = countdownPathTotalSteps * countdownPathStepDurationMs;
  const countdownElapsedMs = clampNumber(
    Number(startCountdownTotalMs || 0) - Number(startCountdownRemainingMs || 0),
    0,
    Number(startCountdownTotalMs || 0)
  );
  const currentCountdownPathStep = brushingPhase === "countdown" && countdownPathTotalSteps > 0
    ? Math.min(
      countdownPathTotalSteps,
      1 + Math.floor((countdownElapsedMs % Math.max(countdownPathStepDurationMs, countdownPathPulseWindowMs)) / countdownPathStepDurationMs)
    )
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
  const mapBrushDirectionClass = brushFacingDirection === "left" ? "facing-left" : "facing-right";
  const mapBrushMessagePrimary = brushingPhase === "complete"
    ? "Stop music"
    : centerValue;
  const mapBrushMessageSecondary = brushingPhase === "countdown" && countdownPreviewLabel
    ? countdownPreviewLabel
    : brushingPhase === "complete"
    ? ""
    : centerLabel;
  const mapBrushMessageTertiary = brushingPhase === "countdown" && currentCountdownPathStep && countdownPathTotalSteps > 0
    ? t("brushing.guide.countdownPathStep", {
      step: currentCountdownPathStep,
      total: countdownPathTotalSteps
    })
    : "";
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
    const isActiveTooth = activeToothEntry?.jaw === jaw && activeToothEntry.mapIndex === mapIndex;
    const rippleDelayMs = rowCelebration ? getRowRippleDelayMs(point.x, rowCelebration.direction) : 0;
    const celebrateFrontSurface = Boolean(rowCelebration && celebrationSurfaceTarget?.jaw === jaw && celebrationSurfaceTarget?.surface === "front");
    const celebrateBackSurface = Boolean(rowCelebration && celebrationSurfaceTarget?.jaw === jaw && celebrationSurfaceTarget?.surface === "back");
    const countdownSurface = countdownPreviewSegment?.jaw === jaw && countdownPreviewSegment.mapIndices.includes(mapIndex)
      ? countdownPreviewSegment.surface
      : null;
    const isCountdownPreviewTooth = Boolean(countdownSurface);
    const countdownStep = countdownPreviewTarget?.jaw === jaw
      ? countdownPreviewTarget.side === "left"
        ? countdownPreviewTarget.split - 1 - mapIndex
        : mapIndex - countdownPreviewTarget.split
      : -1;
    const isCountdownPathTooth = isCountdownPreviewTooth && Number.isFinite(countdownStep) && countdownStep >= 0;
    const isCountdownStartTooth = Boolean(isCountdownPreviewTooth && countdownPreviewTarget?.jaw === jaw && mapIndex === countdownPreviewTarget.startMapIndex);
    const countdownSurfaceStyle = isCountdownPathTooth
      ? { "--countdown-path-delay": `${Math.round(countdownStep * 85)}ms` }
      : undefined;

    return (
      <g
        key={toothId}
        transform={`translate(${point.x} ${point.y}) rotate(${point.rotationDeg ?? point.angleDeg - 90}) scale(${toothShape.scale * (point.layoutScale || 1)})`}
        className={`tooth-svg ${meta?.type || "molar"}${isActiveTooth ? " active-tooth" : ""}${isCountdownPreviewTooth ? " countdown-preview-tooth" : ""}${isCountdownStartTooth ? " countdown-start-tooth" : ""}`}
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
          className={`tooth-face back-face${state.backDone ? " clean" : ""}${activeSurface === "back" ? " active-surface" : ""}${countdownSurface === "back" ? " countdown-preview-surface" : ""}`}
          d={toothShape.path}
          clipPath={`url(#${toothId}-back-surface)`}
          style={countdownSurface === "back" ? countdownSurfaceStyle : undefined}
        />
        <path
          className={`tooth-face front-face${state.frontDone ? " clean" : ""}${activeSurface === "front" ? " active-surface" : ""}${countdownSurface === "front" ? " countdown-preview-surface" : ""}`}
          d={toothShape.path}
          clipPath={`url(#${toothId}-front-surface)`}
          style={countdownSurface === "front" ? countdownSurfaceStyle : undefined}
        />
        {celebrateBackSurface && (
          <path
            className="tooth-celebration-ripple back-ripple"
            d={toothShape.path}
            clipPath={`url(#${toothId}-back-surface)`}
            style={{ "--row-ripple-delay": `${rippleDelayMs}ms` }}
          />
        )}
        {celebrateFrontSurface && (
          <path
            className="tooth-celebration-ripple front-ripple"
            d={toothShape.path}
            clipPath={`url(#${toothId}-front-surface)`}
            style={{ "--row-ripple-delay": `${rippleDelayMs}ms` }}
          />
        )}
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
            <div className="session-actions guide-session-actions with-rotate-start-copy">
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
              <label className="brush-start-rotation-toggle-row guide-rotate-start-copy" aria-label="rotate start">
                <input
                  type="checkbox"
                  checked={Boolean(rotatingStartEnabled)}
                  onChange={(event) => onRotatingStartEnabledChange?.(event.target.checked)}
                />
                <span>rotate start</span>
              </label>
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
        <div
          className={`mouth-map${brushingPhase === "complete" ? " completion-finished" : ""}${showCompletionFlash ? " completion-flash" : ""}`}
          role="img"
          aria-label={t("brushing.guide.mouthMapAria")}
          style={{ "--active-tooth-pulse-duration": `${activeToothPulseMs}ms` }}
        >
        <RowCelebrationCascade
          celebration={rowCelebration}
          reducedMotion={reducedMotion}
          lowPerformanceMode={lowPerformanceCelebrationMode}
        />
        <div
          className={`map-hand-orientation-layer ${mapBrushDirectionClass}${activeJaw ? ` jaw-${activeJaw}` : ""}${!brushFacingDirection ? " neutral-orientation" : ""}${brushingPhase === "countdown" ? " countdown" : ""}${activeEntry?.type === "transition" ? " transition" : ""}${brushingPhase === "complete" ? " complete" : ""}`}
          aria-hidden="true"
        >
            <div className="brush-hand-orientation-visual" aria-hidden="true">
              <span className="brush-hand-orientation-hand" />
              <span className="brush-hand-orientation-handle">
                <span className="map-brush-message-primary">{mapBrushMessagePrimary}</span>
                {mapBrushMessageSecondary ? (
                  <span className="map-brush-message-secondary">{mapBrushMessageSecondary}</span>
                ) : null}
                {mapBrushMessageTertiary ? (
                  <span className="map-brush-message-tertiary">{mapBrushMessageTertiary}</span>
                ) : null}
              </span>
              <span className="brush-hand-orientation-neck" />
              <span className="brush-hand-orientation-head">
                <span className="brush-hand-orientation-bristles" />
              </span>
            </div>
        </div>
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
          {countdownStartPoint && (
            <g className="countdown-start-indicator" aria-hidden="true">
              <line
                x1={mapCenter.x}
                y1={mapCenter.y}
                x2={countdownStartPoint.x}
                y2={countdownStartPoint.y}
                className="countdown-start-guide"
              />
              <circle
                cx={countdownStartPoint.x}
                cy={countdownStartPoint.y}
                r="8"
                className="countdown-start-core"
              />
              <circle
                cx={countdownStartPoint.x}
                cy={countdownStartPoint.y}
                r="14"
                className="countdown-start-ring"
              />
              <text
                x={countdownStartPoint.labelX}
                y={countdownStartPoint.labelY}
                textAnchor="middle"
                className="countdown-start-label"
              >
                {t("brushing.guide.startOutsideTooth")}
              </text>
            </g>
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
      {showTimingDebug && (
        <p className="guide-debug-timing" aria-live="off">
          Debug: {totalTeeth} teeth | {toothDurationSeconds.toFixed(2)}s/tooth | source: {timingSourceLabel}
        </p>
      )}

    </section>
  );
}

export default BrushingGuide;
