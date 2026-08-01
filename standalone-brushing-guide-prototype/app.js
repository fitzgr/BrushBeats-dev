const brushingSequence = [
  { arch: "top", side: "left", surface: "outside" },
  { arch: "top", side: "right", surface: "outside" },
  { arch: "top", side: "left", surface: "inside" },
  { arch: "top", side: "right", surface: "inside" },
  { arch: "bottom", side: "left", surface: "outside" },
  { arch: "bottom", side: "right", surface: "outside" },
  { arch: "bottom", side: "left", surface: "inside" },
  { arch: "bottom", side: "right", surface: "inside" },
];

const mapCenter = { x: 180, y: 214 };
const TEETH_PER_ARCH = 14;
const state = { index: 0 };

const topPaneTitle = document.getElementById("topPaneTitle");
const topPaneMeta = document.getElementById("topPaneMeta");
const bottomPaneTitle = document.getElementById("bottomPaneTitle");
const bottomPaneMeta = document.getElementById("bottomPaneMeta");
const topView = document.getElementById("topView");
const bottomView = document.getElementById("bottomView");
const stepCounter = document.getElementById("stepCounter");
const stepLabel = document.getElementById("stepLabel");

const nextBtn = document.getElementById("nextBtn");
const prevBtn = document.getElementById("prevBtn");

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
  { number: 16, nameKey: "thirdMolar", type: "molar" },
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
  { number: 17, nameKey: "thirdMolar", type: "molar" },
];

const topToothChart = selectVisibleToothChart(ADULT_TOP_TOOTH_CHART, TEETH_PER_ARCH);
const bottomToothChart = selectVisibleToothChart(ADULT_BOTTOM_TOOTH_CHART, TEETH_PER_ARCH);
const topPoints = createJawToothLayout({ chart: topToothChart, jaw: "top", mapCenter });
const bottomPoints = createJawToothLayout({ chart: bottomToothChart, jaw: "bottom", mapCenter });

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

function createJawToothLayout({ chart, jaw, mapCenter: center }) {
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
    const outX = baseX - center.x;
    const outY = baseY - center.y;
    const outDistance = Math.hypot(outX, outY) || 1;
    const x = baseX + (outX / outDistance) * radialOffset;
    const y = baseY + (outY / outDistance) * radialOffset;
    const ratio = count <= 1 ? 1 : Math.abs((index / (count - 1)) * 2 - 1);
    const centerWeight = 1 - ratio;
    const layoutScale = (profile.edgeScale + (profile.centerScale - profile.edgeScale) * centerWeight) * densityScale;
    const directionToCenter = Math.atan2(center.y - y, center.x - x) * (180 / Math.PI);

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

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function selectVisibleToothChart(chart, count) {
  const safeCount = Math.max(0, Math.min(chart.length, count));
  const start = Math.floor((chart.length - safeCount) / 2);
  return chart.slice(start, start + safeCount);
}

function titleCase(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function buildStepText(step) {
  return `${titleCase(step.arch)} ${titleCase(step.side)} ${titleCase(step.surface)}`;
}

function toothSideFromIndex(index) {
  return index < TEETH_PER_ARCH / 2 ? "left" : "right";
}

function isActiveTooth(step, jaw, mapIndex) {
  return step.arch === jaw && toothSideFromIndex(mapIndex) === step.side;
}

function getSurfaceKey(surface) {
  return surface === "inside" ? "back" : "front";
}

function renderGrooves(toothShape) {
  return toothShape.grooves.map((groove) => {
    if (groove.type === "ellipse") {
      return `<ellipse class="tooth-groove" cx="${groove.cx}" cy="${groove.cy}" rx="${groove.rx}" ry="${groove.ry}" stroke="${toothShape.grooveStroke}" />`;
    }

    return `<path class="tooth-groove" d="${groove.d}" stroke="${toothShape.grooveStroke}" />`;
  }).join("");
}

function renderTooth(point, jaw, meta, mapIndex, step, prefix) {
  const toothShape = TOOTH_SHAPES[meta?.type || "molar"];
  const toothId = `${prefix}-${jaw}-${mapIndex + 1}`;
  const active = isActiveTooth(step, jaw, mapIndex);
  const activeSurface = active ? getSurfaceKey(step.surface) : null;
  const activeClass = active ? " active-tooth" : "";

  return `
    <g
      transform="translate(${point.x} ${point.y}) rotate(${point.rotationDeg}) scale(${toothShape.scale * (point.layoutScale || 1)})"
      class="tooth-svg ${meta?.type || "molar"}${activeClass}"
      data-jaw="${jaw}"
      data-side="${toothSideFromIndex(mapIndex)}"
    >
      <defs>
        <clipPath id="${toothId}-back-surface">
          <rect x="-30" y="-30" width="60" height="30" />
        </clipPath>
        <clipPath id="${toothId}-front-surface">
          <rect x="-30" y="-1" width="60" height="38" />
        </clipPath>
      </defs>
      <path class="tooth-body-base" d="${toothShape.path}" fill="url(#${prefix}-toothFill)" filter="url(#${prefix}-softShadow)" />
      <path
        class="tooth-face back-face${activeSurface === "back" ? " active-surface" : ""}"
        d="${toothShape.path}"
        clip-path="url(#${toothId}-back-surface)"
      />
      <path
        class="tooth-face front-face${activeSurface === "front" ? " active-surface" : ""}"
        d="${toothShape.path}"
        clip-path="url(#${toothId}-front-surface)"
      />
      <path class="tooth-outline" d="${toothShape.path}" />
      ${renderGrooves(toothShape)}
    </g>
  `;
}

function renderMapSvg(step, options = {}) {
  const focusJaw = options.focusJaw || null;
  const prefix = options.prefix || `map-${focusJaw || "full"}`;
  const viewBox = focusJaw === "top" ? "0 42 360 170" : focusJaw === "bottom" ? "0 204 360 170" : "0 0 360 420";
  const svgClass = focusJaw ? "mouth-map-svg detail" : "mouth-map-svg";
  const topMarkup = focusJaw === "bottom" ? "" : topPoints.map((point, index) => renderTooth(point, "top", topToothChart[index], index, step, prefix)).join("");
  const bottomMarkup = focusJaw === "top" ? "" : bottomPoints.map((point, index) => renderTooth(point, "bottom", bottomToothChart[index], index, step, prefix)).join("");

  return `
    <div class="mouth-map-shell ${focusJaw ? `detail-${focusJaw}` : "overview"}">
      <svg class="${svgClass}" viewBox="${viewBox}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${focusJaw ? `${titleCase(focusJaw)} detail` : "Full mouth overview"}">
        <defs>
          <filter id="${prefix}-softShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0.6" dy="1.2" stdDeviation="1.2" flood-color="#b7aa95" flood-opacity="0.35" />
          </filter>
          <linearGradient id="${prefix}-toothFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#fffdf9" />
            <stop offset="100%" stop-color="#f4efe6" />
          </linearGradient>
        </defs>
        ${topMarkup}
        ${bottomMarkup}
      </svg>
    </div>
  `;
}

function createFrontView(step) {
  const container = document.createElement("div");
  container.className = "map-layout";
  container.innerHTML = `
    <div class="map-caption-row">
      <span class="segment-label">Original app mouth map</span>
      <span class="segment-label">28 teeth | both arches</span>
    </div>
    ${renderMapSvg(step, { prefix: `front-${state.index}` })}
  `;
  return container;
}

function createInsideView(step) {
  const container = document.createElement("div");
  container.className = "map-layout";
  container.innerHTML = `
    <div class="map-caption-row">
      <span class="segment-label">Original app detail map</span>
      <span class="segment-label">${titleCase(step.arch)} arch | ${titleCase(step.surface)} surface</span>
    </div>
    ${renderMapSvg(step, { focusJaw: step.arch, prefix: `detail-${state.index}-${step.arch}` })}
  `;
  return container;
}

function render() {
  const step = brushingSequence[state.index];
  const topShowsFront = step.arch === "top";

  topPaneTitle.textContent = topShowsFront ? "Front View" : "Inside View";
  topPaneMeta.textContent = topShowsFront
    ? "Original BrushingGuide layout | both arches"
    : `Original BrushingGuide layout | ${titleCase(step.arch)} detail`;

  bottomPaneTitle.textContent = topShowsFront ? "Inside View" : "Front View";
  bottomPaneMeta.textContent = topShowsFront
    ? `Original BrushingGuide layout | ${titleCase(step.arch)} detail`
    : "Original BrushingGuide layout | both arches";

  const frontView = createFrontView(step);
  const insideView = createInsideView(step);

  topView.innerHTML = "";
  bottomView.innerHTML = "";

  if (topShowsFront) {
    topView.appendChild(frontView);
    bottomView.appendChild(insideView);
  } else {
    topView.appendChild(insideView);
    bottomView.appendChild(frontView);
  }

  stepCounter.textContent = `Step ${state.index + 1} / ${brushingSequence.length}`;
  stepLabel.textContent = `${buildStepText(step)} | Original map half-arch highlight`;
}

nextBtn.addEventListener("click", () => {
  state.index = (state.index + 1) % brushingSequence.length;
  render();
});

prevBtn.addEventListener("click", () => {
  state.index = (state.index - 1 + brushingSequence.length) % brushingSequence.length;
  render();
});

render();
