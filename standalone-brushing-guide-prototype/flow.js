const START_POINT_OPTIONS = [
  { key: "front-top-left", label: "Start 1" },
  { key: "front-top-right", label: "Start 2" },
  { key: "back-top-right", label: "Start 3" },
  { key: "back-top-left", label: "Start 4" },
  { key: "front-bottom-left", label: "Start 5" },
  { key: "front-bottom-right", label: "Start 6" },
  { key: "back-bottom-right", label: "Start 7" },
  { key: "back-bottom-left", label: "Start 8" },
];

const ADULT_TOP_TOOTH_CHART = [
  { number: 1, type: "molar" },
  { number: 2, type: "molar" },
  { number: 3, type: "molar" },
  { number: 4, type: "premolar" },
  { number: 5, type: "premolar" },
  { number: 6, type: "canine" },
  { number: 7, type: "incisor" },
  { number: 8, type: "incisor" },
  { number: 9, type: "incisor" },
  { number: 10, type: "incisor" },
  { number: 11, type: "canine" },
  { number: 12, type: "premolar" },
  { number: 13, type: "premolar" },
  { number: 14, type: "molar" },
  { number: 15, type: "molar" },
  { number: 16, type: "molar" },
];

const ADULT_BOTTOM_TOOTH_CHART = [
  { number: 32, type: "molar" },
  { number: 31, type: "molar" },
  { number: 30, type: "molar" },
  { number: 29, type: "premolar" },
  { number: 28, type: "premolar" },
  { number: 27, type: "canine" },
  { number: 26, type: "incisor" },
  { number: 25, type: "incisor" },
  { number: 24, type: "incisor" },
  { number: 23, type: "incisor" },
  { number: 22, type: "canine" },
  { number: 21, type: "premolar" },
  { number: 20, type: "premolar" },
  { number: 19, type: "molar" },
  { number: 18, type: "molar" },
  { number: 17, type: "molar" },
];

const TOOTH_SHAPES = {
  molar: {
    path: "M0 -28 C16 -29 27 -20 29 -7 C30 11 22 25 11 32 C4 35 -4 35 -11 32 C-22 25 -30 11 -29 -7 C-27 -20 -16 -29 0 -28 Z",
    grooves: [
      { type: "path", d: "M-14 -5 C-9 -14 9 -14 14 -5" },
      { type: "path", d: "M-11 10 C-6 2 6 2 11 10" },
      { type: "path", d: "M-4 -12 C-1 -4 -1 5 -4 14" },
      { type: "path", d: "M7 -11 C4 -3 4 6 7 14" },
    ],
    grooveStroke: "#d7ccbd",
    scale: 0.465,
  },
  premolar: {
    path: "M0 -25 C13 -25 22 -18 23 -5 C23 11 15 24 7 30 C2 32 -2 32 -7 30 C-15 24 -23 11 -23 -5 C-22 -18 -13 -25 0 -25 Z",
    grooves: [
      { type: "path", d: "M-10 -4 C-6 -12 6 -12 10 -4" },
      { type: "path", d: "M-1 -11 C-3 -2 -2 7 1 15" },
    ],
    grooveStroke: "#d9cebf",
    scale: 0.445,
  },
  canine: {
    path: "M0 -27 C10 -27 17 -20 18 -7 C18 10 10 24 3 31 C1 33 -1 33 -3 31 C-10 24 -18 10 -18 -7 C-17 -20 -10 -27 0 -27 Z",
    grooves: [
      { type: "path", d: "M0 -20 C-1 -9 -1 4 0 15" },
      { type: "path", d: "M-5 -8 C-2 -12 2 -12 5 -8" },
    ],
    grooveStroke: "#e6ddd0",
    scale: 0.455,
  },
  incisor: {
    path: "M0 -24 C12 -24 20 -17 20 -4 C20 10 13 21 5 28 C2 30 -2 30 -5 28 C-13 21 -20 10 -20 -4 C-20 -17 -12 -24 0 -24 Z",
    grooves: [
      { type: "path", d: "M-8 -12 C-4 -18 4 -18 8 -12" },
      { type: "path", d: "M0 -14 C-1 -7 -1 3 0 12" },
    ],
    grooveStroke: "#e6ddd0",
    scale: 0.45,
  },
};

const state = {
  topCount: 16,
  bottomCount: 16,
  startPointKey: START_POINT_OPTIONS[0].key,
  phase: 0,
  isPlaying: false,
  timers: [],
  trailStep: -1,
};

const elements = {
  topCountInput: document.getElementById("topCountInput"),
  bottomCountInput: document.getElementById("bottomCountInput"),
  startPointSelect: document.getElementById("startPointSelect"),
  playBtn: document.getElementById("playBtn"),
  prevBtn: document.getElementById("prevBtn"),
  nextBtn: document.getElementById("nextBtn"),
  resetBtn: document.getElementById("resetBtn"),
  stepCounter: document.getElementById("stepCounter"),
  stageTitle: document.getElementById("stageTitle"),
  stageMeta: document.getElementById("stageMeta"),
  phaseStrip: document.getElementById("phaseStrip"),
  stageView: document.getElementById("stageView"),
  stepLabel: document.getElementById("stepLabel"),
  startPointSummary: document.getElementById("startPointSummary"),
  teethSummary: document.getElementById("teethSummary"),
};

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function toRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

function splitArch(count) {
  return {
    left: Math.ceil(count / 2),
    right: Math.floor(count / 2),
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
    side: match[3],
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
    side,
    mapIndices,
  };
}

function buildRowSegments({ jaw, surface, direction, totalTeeth }) {
  const sideOrder = direction === "ltr" ? ["left", "right"] : ["right", "left"];
  return sideOrder
    .map((side) => buildSegment({ surface, jaw, side, totalTeeth, direction }))
    .filter(Boolean);
}

function buildSegments(topTeeth, bottomTeeth, startSegmentKey = null) {
  const parsedStart = parseStartSegmentKey(startSegmentKey) || {
    surface: "front",
    jaw: "top",
    side: "left",
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
      })
    );
    orderedSegments.push(
      ...buildRowSegments({
        jaw,
        surface: oppositeSurface(parsedStart.surface),
        direction: mirroredDirection,
        totalTeeth,
      })
    );
  });

  return orderedSegments;
}

function selectVisibleToothChart(chart, count) {
  const safeCount = Math.max(0, Math.min(chart.length, count));
  const start = Math.floor((chart.length - safeCount) / 2);
  return chart.slice(start, start + safeCount);
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

function createJawToothLayout({ chart, jaw, mapCenter = { x: 180, y: 214 } }) {
  const count = chart.length;
  const profile = jaw === "top"
    ? { cx: 180, cy: 198, rx: 146, ry: 142, startDeg: 188, endDeg: 352, edgeScale: 1.04, centerScale: 1.13 }
    : { cx: 180, cy: 230, rx: 146, ry: 142, startDeg: 172, endDeg: 8, edgeScale: 1.04, centerScale: 1.13 };

  const density = clampNumber(count / 16, 0.25, 1);
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
      layoutScale,
    };
  });
}

function createFrontFacingLayout({ chart, jaw }) {
  const count = chart.length;
  const spread = count <= 1 ? 0 : 300 / (count - 1);
  const centerIndex = (count - 1) / 2;
  const baseY = jaw === "top" ? 86 : 246;
  const rowCurve = jaw === "top" ? 64 : -64;

  return chart.map((tooth, index) => {
    const normalized = count <= 1 ? 0 : (index - centerIndex) / Math.max(1, centerIndex);
    const x = count <= 1 ? 180 : 37 + index * spread;
    const t = Math.min(1, Math.abs(normalized));
    // Parabolic profile keeps each row fully convex with no concave segment.
    const smoothArc = t * t;
    const y = baseY + smoothArc * rowCurve;
    const tilt = jaw === "top" ? 180 : 0;

    return {
      index,
      x,
      y,
      angleDeg: 0,
      rotationDeg: tilt,
      layoutScale: 1 + (1 - Math.abs(normalized)) * 0.03,
    };
  });
}

function getPhaseDescriptor(phase) {
  switch (phase) {
    case 0:
      return {
        title: "Baseline",
        short: "No highlight",
        detail: "Show both rows with no highlighting.",
      };
    case 1:
      return {
        title: "Row focus",
        short: "Row focus",
        detail: "Keep only the starting row visible.",
      };
    case 2:
      return {
        title: "Direction",
        short: "Direction",
        detail: "Animate from the center tooth toward the starting tooth direction.",
      };
    case 3:
    default:
      return {
        title: "Surface",
        short: "Surface",
        detail: "Finish using a surface icon cue.",
      };
  }
}

function getPhaseInfo(parsedStart) {
  const jaw = parsedStart?.jaw || "top";
  const side = parsedStart?.side || "left";
  const surface = parsedStart?.surface || "front";

  switch (state.phase) {
    case 0:
      return {
        label: "",
        markerClass: "phase-baseline",
        copy: "No highlighting yet.",
      };
    case 1:
      return {
        label: "",
        markerClass: "phase-jaw",
        copy: "Row focus only.",
      };
    case 2:
      return {
        label: "",
        markerClass: "phase-side",
        copy: "Center-to-start motion.",
      };
    case 3:
    default:
      return {
        label: "",
        markerClass: "phase-surface",
        copy: "Surface icon cue.",
      };
  }
}

function getActiveStartModel() {
  const parsed = parseStartSegmentKey(state.startPointKey) || {
    surface: "front",
    jaw: "top",
    side: "left",
  };
  const totalTeeth = parsed.jaw === "top" ? state.topCount : state.bottomCount;
  const direction = parsed.side === "left" ? "ltr" : "rtl";
  const segment = buildSegment({
    surface: parsed.surface,
    jaw: parsed.jaw,
    side: parsed.side,
    totalTeeth,
    direction,
  });

  return {
    parsed,
    startIndex: segment?.mapIndices?.[0] ?? 0,
    totalTeeth,
    segmentLabel: segment?.label || START_POINT_OPTIONS[0].label,
  };
}

function getRenderableCharts() {
  return {
    topChart: selectVisibleToothChart(ADULT_TOP_TOOTH_CHART, state.topCount),
    bottomChart: selectVisibleToothChart(ADULT_BOTTOM_TOOTH_CHART, state.bottomCount),
  };
}

function renderTooth(point, jaw, meta, mapIndex, activeStartModel) {
  const toothShape = TOOTH_SHAPES[meta?.type || "molar"];
  const highlightModel = getPhaseHighlightModel(activeStartModel);
  const sameJaw = activeStartModel.parsed.jaw === jaw;
  const isStartTooth = sameJaw && activeStartModel.startIndex === mapIndex;
  const highlighted = sameJaw && highlightModel.indices.includes(mapIndex);
  const activeClass = highlighted ? ` ${highlightModel.className}` : "";
  const applySurfaceSpecific = state.phase === 3 && highlighted;
  const highlightFront = highlighted && (!applySurfaceSpecific || activeStartModel.parsed.surface === "front");
  const highlightBack = highlighted && (!applySurfaceSpecific || activeStartModel.parsed.surface === "back");
  const startClass = isStartTooth ? " start-tooth" : "";
  const toothId = `${jaw}-${mapIndex + 1}-${state.phase}`;

  return `
    <g
      transform="translate(${point.x} ${point.y}) rotate(${point.rotationDeg}) scale(${toothShape.scale * (point.layoutScale || 1)})"
      class="tooth-svg ${meta?.type || "molar"}${activeClass}${startClass}"
    >
      <defs>
        <clipPath id="${toothId}-back-surface">
          <rect x="-30" y="-30" width="60" height="30" />
        </clipPath>
        <clipPath id="${toothId}-front-surface">
          <rect x="-30" y="-1" width="60" height="38" />
        </clipPath>
      </defs>
      <path class="tooth-body-base" d="${toothShape.path}" fill="url(#map-toothFill)" filter="url(#map-softShadow)" />
      <path
        class="tooth-face back-face${highlightBack ? " active-surface" : ""}"
        d="${toothShape.path}"
        clip-path="url(#${toothId}-back-surface)"
      />
      <path
        class="tooth-face front-face${highlightFront ? " active-surface" : ""}"
        d="${toothShape.path}"
        clip-path="url(#${toothId}-front-surface)"
      />
      <path class="tooth-outline" d="${toothShape.path}" />
      ${toothShape.grooves
        .map((groove) => (groove.type === "ellipse"
          ? `<ellipse class="tooth-groove" cx="${groove.cx}" cy="${groove.cy}" rx="${groove.rx}" ry="${groove.ry}" stroke="${toothShape.grooveStroke}" />`
          : `<path class="tooth-groove" d="${groove.d}" stroke="${toothShape.grooveStroke}" />`))
        .join("")}
    </g>
  `;
}

function renderMarker(point, activeStartModel, phaseInfo) {
  if (!phaseInfo.label) {
    return "";
  }

  const labelY = activeStartModel.parsed.jaw === "top" ? point.y - 24 : point.y + 32;
  const labelAnchor = activeStartModel.parsed.jaw === "top" ? "baseline" : "hanging";

  return `
    <g class="start-marker ${phaseInfo.markerClass}">
      <line x1="${point.x}" y1="${point.y}" x2="${point.x}" y2="${labelY + (activeStartModel.parsed.jaw === "top" ? 10 : -10)}" />
      <circle cx="${point.x}" cy="${point.y}" r="15" />
      <text x="${point.x}" y="${labelY}" text-anchor="middle" dominant-baseline="${labelAnchor}">
        ${phaseInfo.label}
      </text>
    </g>
  `;
}

function renderFrontFacingStage(activeStartModel, phaseInfo, topChart, bottomChart) {
  const topPoints = createFrontFacingLayout({ chart: topChart, jaw: "top" });
  const bottomPoints = createFrontFacingLayout({ chart: bottomChart, jaw: "bottom" });
  const showTopRow = state.phase === 0 || activeStartModel.parsed.jaw === "top";
  const showBottomRow = state.phase === 0 || activeStartModel.parsed.jaw === "bottom";
  const activePoint = activeStartModel.parsed.jaw === "top"
    ? topPoints[activeStartModel.startIndex]
    : bottomPoints[activeStartModel.startIndex];
  const topMarkup = showTopRow
    ? topPoints.map((point, index) => renderTooth(point, "top", topChart[index], index, activeStartModel)).join("")
    : "";
  const bottomMarkup = showBottomRow
    ? bottomPoints.map((point, index) => renderTooth(point, "bottom", bottomChart[index], index, activeStartModel)).join("")
    : "";
  const markerMarkup = state.phase >= 1 && activePoint ? renderMarker(activePoint, activeStartModel, phaseInfo) : "";
  const highlightModel = getPhaseHighlightModel(activeStartModel);
  const landingMarkup = activePoint && highlightModel.showLanding
    ? renderLandingMarker(activePoint)
    : "";
  const brushGuideMarkup = activePoint && state.phase === 3
    ? renderBrushGuide(activePoint, activeStartModel)
    : "";

  return `
    <div class="map-shell front-facing ${phaseInfo.markerClass} phase-${state.phase}">
      <svg class="mouth-map-svg front-facing-svg" viewBox="0 0 360 360" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Front facing mouth view">
        <defs>
          <filter id="map-softShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0.6" dy="1.2" stdDeviation="1.2" flood-color="#b7aa95" flood-opacity="0.35" />
          </filter>
          <linearGradient id="map-toothFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#fffdf9" />
            <stop offset="100%" stop-color="#f4efe6" />
          </linearGradient>
        </defs>
        <path class="front-mouth-lips" d="M20 166 C52 98 110 54 180 54 C250 54 308 98 340 166 C308 236 250 280 180 280 C110 280 52 236 20 166 Z" />
        <path class="front-mouth-opening" d="M54 166 C80 118 128 88 180 88 C232 88 280 118 306 166 C280 214 232 244 180 244 C128 244 80 214 54 166 Z" />
        ${topMarkup}
        ${bottomMarkup}
        ${brushGuideMarkup}
        ${landingMarkup}
        ${markerMarkup}
      </svg>
    </div>
  `;
}

function renderMap() {
  const { topChart, bottomChart } = getRenderableCharts();
  const activeStartModel = getActiveStartModel();
  const phaseInfo = getPhaseInfo(activeStartModel.parsed);
  const phaseDescriptor = getPhaseDescriptor(state.phase);

  elements.stepCounter.textContent = `Step ${state.phase} / 3`;
  elements.stageTitle.textContent = "Front view";
  elements.stageMeta.textContent = phaseDescriptor.detail;
  elements.startPointSummary.textContent = "Start point selected";
  elements.teethSummary.textContent = `${state.topCount} row A / ${state.bottomCount} row B`;
  elements.stepLabel.textContent = `Phase ${state.phase}`;
  elements.playBtn.textContent = state.isPlaying ? "Pause" : state.phase === 3 ? "Replay" : "Play";
  elements.playBtn.classList.toggle("primary", !state.isPlaying);
  elements.phaseStrip.innerHTML = [
    `<span class="phase-chip ${state.phase === 0 ? "active" : ""}">${phaseDescriptorTitle(0)}</span>`,
    `<span class="phase-chip ${state.phase === 1 ? "active" : ""}">${phaseDescriptorTitle(1)}</span>`,
    `<span class="phase-chip ${state.phase === 2 ? "active" : ""}">${phaseDescriptorTitle(2)}</span>`,
    `<span class="phase-chip ${state.phase === 3 ? "active" : ""}">${phaseDescriptorTitle(3)}</span>`,
  ].join("");

  elements.stageView.innerHTML = renderFrontFacingStage(activeStartModel, phaseInfo, topChart, bottomChart);
}

function renderFullMapStage(activeStartModel, phaseInfo, topChart, bottomChart) {
  const topPoints = createJawToothLayout({ chart: topChart, jaw: "top" });
  const bottomPoints = createJawToothLayout({ chart: bottomChart, jaw: "bottom" });
  const activePoint = activeStartModel.parsed.jaw === "top"
    ? topPoints[activeStartModel.startIndex]
    : bottomPoints[activeStartModel.startIndex];
  const topMarkup = topPoints.map((point, index) => renderTooth(point, "top", topChart[index], index, activeStartModel)).join("");
  const bottomMarkup = bottomPoints.map((point, index) => renderTooth(point, "bottom", bottomChart[index], index, activeStartModel)).join("");
  const markerMarkup = activePoint ? renderMarker(activePoint, activeStartModel, phaseInfo) : "";

  return `
    <div class="map-shell ${phaseInfo.markerClass}">
      <svg class="mouth-map-svg" viewBox="0 0 360 420" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Front mouth view">
        <defs>
          <filter id="map-softShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0.6" dy="1.2" stdDeviation="1.2" flood-color="#b7aa95" flood-opacity="0.35" />
          </filter>
          <linearGradient id="map-toothFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#fffdf9" />
            <stop offset="100%" stop-color="#f4efe6" />
          </linearGradient>
        </defs>
        ${topMarkup}
        ${bottomMarkup}
        ${markerMarkup}
      </svg>
    </div>
  `;
}

function phaseDescriptorTitle(phase) {
  switch (phase) {
    case 0:
      return "0. Baseline";
    case 1:
      return "1. Row";
    case 2:
      return "2. Direction";
    default:
      return "3. Surface";
  }
}

function getCenterToStartPath(activeStartModel) {
  const teethCount = activeStartModel.parsed.jaw === "top" ? state.topCount : state.bottomCount;
  const centerIndex = activeStartModel.parsed.side === "left"
    ? Math.floor((teethCount - 1) / 2)
    : Math.ceil((teethCount - 1) / 2);
  const startIndex = activeStartModel.startIndex;

  if (startIndex === centerIndex) {
    return [startIndex];
  }

  const step = startIndex > centerIndex ? 1 : -1;
  const path = [];
  for (let cursor = centerIndex; step > 0 ? cursor <= startIndex : cursor >= startIndex; cursor += step) {
    path.push(cursor);
  }
  return path;
}

function getPhaseHighlightModel(activeStartModel) {
  if (state.phase === 1) {
    const teethCount = activeStartModel.parsed.jaw === "top" ? state.topCount : state.bottomCount;
    const direction = activeStartModel.parsed.side === "left" ? "ltr" : "rtl";
    return {
      indices: buildHalfIndices(teethCount, activeStartModel.parsed.side, direction),
      className: "preview-side-tooth",
      showLanding: false,
    };
  }

  if (state.phase === 2) {
    const path = getCenterToStartPath(activeStartModel);
    const safeTrailStep = Number.isFinite(state.trailStep)
      ? Math.max(0, Math.min(state.trailStep, path.length - 1))
      : path.length - 1;
    return {
      indices: path.length ? [path[safeTrailStep]] : [],
      className: "travel-tooth",
      showLanding: path.length > 0 && safeTrailStep >= path.length - 1,
    };
  }

  if (state.phase === 3) {
    return {
      indices: [activeStartModel.startIndex],
      className: "active-tooth",
      showLanding: true,
    };
  }

  return {
    indices: [],
    className: "",
    showLanding: false,
  };
}

function renderLandingMarker(point) {
  return `
    <g class="landing-marker" aria-hidden="true">
      <circle class="landing-ring" cx="${point.x}" cy="${point.y}" r="16" />
      <circle class="landing-core" cx="${point.x}" cy="${point.y}" r="5.5" />
    </g>
  `;
}

function renderBrushGuide(targetPoint, activeStartModel) {
  const fromInside = activeStartModel.parsed.surface === "back";
  const origin = fromInside
    ? { x: 180, y: 166 }
    : {
      x: targetPoint.x + (targetPoint.x < 180 ? -86 : 86),
      y: targetPoint.y + (activeStartModel.parsed.jaw === "top" ? -20 : 20),
    };
  const deltaX = origin.x - targetPoint.x;
  const deltaY = origin.y - targetPoint.y;
  const angleDeg = -90;

  return `
    <g class="brush-guide ${fromInside ? "brush-from-inside" : "brush-from-outside"}" transform="translate(${targetPoint.x} ${targetPoint.y})">
      <g class="brush-guide-motion" style="--brush-from-x:${deltaX}px; --brush-from-y:${deltaY}px; --brush-angle:${angleDeg}deg;">
        <g transform="rotate(${angleDeg})">
          <rect class="brush-guide-handle" x="-74" y="-4.5" width="52" height="9" rx="4.5" />
          <rect class="brush-guide-neck" x="-22" y="-3" width="9" height="6" rx="2" />
          <rect class="brush-guide-head" x="-14" y="-6.5" width="14" height="13" rx="2.8" />
          <rect class="brush-guide-bristle" x="-2" y="-6" width="2" height="12" rx="1" />
          <rect class="brush-guide-bristle" x="-5" y="-6" width="2" height="12" rx="1" />
          <rect class="brush-guide-bristle" x="-8" y="-6" width="2" height="12" rx="1" />
        </g>
      </g>
    </g>
  `;
}

function syncControls() {
  elements.topCountInput.value = String(state.topCount);
  elements.bottomCountInput.value = String(state.bottomCount);
  elements.startPointSelect.value = state.startPointKey;
}

function sanitizeState() {
  state.topCount = clampNumber(Number.parseInt(elements.topCountInput.value, 10) || 1, 1, 16);
  state.bottomCount = clampNumber(Number.parseInt(elements.bottomCountInput.value, 10) || 1, 1, 16);
  state.startPointKey = elements.startPointSelect.value || START_POINT_OPTIONS[0].key;
}

function clearTimers() {
  while (state.timers.length) {
    window.clearTimeout(state.timers.pop());
  }
}

function stopPlayback() {
  clearTimers();
  state.isPlaying = false;
  state.trailStep = -1;
  renderMap();
}

function startPlayback() {
  const activeStartModel = getActiveStartModel();
  const path = getCenterToStartPath(activeStartModel);
  const travelStepMs = 52;
  const travelPauseAfterPassMs = 110;
  const totalPasses = 5;
  let completedPasses = 0;

  clearTimers();
  state.isPlaying = true;
  state.phase = 0;
  state.trailStep = -1;
  renderMap();

  state.timers.push(window.setTimeout(() => {
    state.phase = 1;
    renderMap();
  }, 850));

  state.timers.push(window.setTimeout(() => {
    state.phase = 2;
    state.trailStep = 0;
    renderMap();

    const runTrailStep = () => {
      if (state.phase !== 2 || !state.isPlaying) {
        return;
      }

      if (state.trailStep >= path.length - 1) {
        completedPasses += 1;

        if (completedPasses >= totalPasses) {
          state.timers.push(window.setTimeout(() => {
            state.phase = 3;
            state.trailStep = -1;
            renderMap();
            state.isPlaying = false;
            renderMap();
          }, travelPauseAfterPassMs));
          return;
        }

        state.timers.push(window.setTimeout(() => {
          state.trailStep = 0;
          renderMap();
          state.timers.push(window.setTimeout(runTrailStep, travelStepMs));
        }, travelPauseAfterPassMs));
        return;
      }

      state.trailStep += 1;
      renderMap();
      state.timers.push(window.setTimeout(runTrailStep, travelStepMs));
    };

    if (path.length <= 1) {
      state.timers.push(window.setTimeout(() => {
        state.phase = 3;
        state.trailStep = -1;
        renderMap();
        state.isPlaying = false;
        renderMap();
      }, travelPauseAfterPassMs));
    } else {
      state.timers.push(window.setTimeout(runTrailStep, travelStepMs));
    }
  }, 1700));
}

function stepPhase(direction) {
  state.isPlaying = false;
  clearTimers();
  if (direction === 1) {
    state.phase = state.phase >= 3 ? 0 : state.phase + 1;
  } else {
    state.phase = state.phase <= 0 ? 3 : state.phase - 1;
  }

  state.trailStep = state.phase === 2 ? Number.POSITIVE_INFINITY : -1;
  renderMap();
}

function handleSettingsChange() {
  sanitizeState();
  state.isPlaying = false;
  clearTimers();
  state.phase = 0;
  state.trailStep = -1;
  renderMap();
}

START_POINT_OPTIONS.forEach((option) => {
  const item = document.createElement("option");
  item.value = option.key;
  item.textContent = option.label;
  elements.startPointSelect.appendChild(item);
});

syncControls();
renderMap();

elements.topCountInput.addEventListener("change", handleSettingsChange);
elements.bottomCountInput.addEventListener("change", handleSettingsChange);
elements.startPointSelect.addEventListener("change", handleSettingsChange);

elements.playBtn.addEventListener("click", () => {
  if (state.isPlaying) {
    stopPlayback();
    return;
  }

  startPlayback();
});

elements.prevBtn.addEventListener("click", () => stepPhase(-1));
elements.nextBtn.addEventListener("click", () => stepPhase(1));
elements.resetBtn.addEventListener("click", () => {
  stopPlayback();
  state.phase = 0;
  state.trailStep = -1;
  renderMap();
});
