import { useMemo, useState } from "react";

const TOOTH_STATES = ["none", "front", "back", "both"];

function toRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

function buildArcPositions({ count, startDeg, endDeg, centerX, centerY, radiusX, radiusY }) {
  if (count <= 0) {
    return [];
  }

  return Array.from({ length: count }, (_, index) => {
    const ratio = count === 1 ? 0.5 : index / (count - 1);
    const angleDeg = startDeg + (endDeg - startDeg) * ratio;
    const angle = toRadians(angleDeg);
    const x = centerX + radiusX * Math.cos(angle);
    const y = centerY + radiusY * Math.sin(angle);
    const directionToCenter = Math.atan2(centerY - y, centerX - x) * (180 / Math.PI);

    return {
      index,
      x,
      y,
      rotationDeg: directionToCenter + 90
    };
  });
}

function buildToothLayout(topTeeth, bottomTeeth) {
  const centerX = 180;
  const centerY = 210;

  return {
    top: buildArcPositions({
      count: topTeeth,
      startDeg: 200,
      endDeg: 340,
      centerX,
      centerY,
      radiusX: 132,
      radiusY: 162
    }),
    bottom: buildArcPositions({
      count: bottomTeeth,
      startDeg: 160,
      endDeg: 20,
      centerX,
      centerY,
      radiusX: 132,
      radiusY: 162
    })
  };
}

function buildToothKeys(topTeeth, bottomTeeth) {
  const keys = [];

  for (let index = 0; index < topTeeth; index += 1) {
    keys.push(`top-${index}`);
  }

  for (let index = 0; index < bottomTeeth; index += 1) {
    keys.push(`bottom-${index}`);
  }

  return keys;
}

function buildInitialToothModes(topTeeth, bottomTeeth) {
  return buildToothKeys(topTeeth, bottomTeeth).reduce((accumulator, key) => {
    accumulator[key] = "none";
    return accumulator;
  }, {});
}

function getModeCounts(toothModes) {
  const totals = {
    none: 0,
    front: 0,
    back: 0,
    both: 0
  };

  Object.values(toothModes).forEach((mode) => {
    totals[mode] += 1;
  });

  return totals;
}

function getNextMode(mode) {
  const modeIndex = TOOTH_STATES.indexOf(mode);
  if (modeIndex < 0) {
    return "front";
  }

  return TOOTH_STATES[(modeIndex + 1) % TOOTH_STATES.length];
}

function mergeToothModes(previousModes, topTeeth, bottomTeeth) {
  const merged = buildInitialToothModes(topTeeth, bottomTeeth);

  Object.keys(merged).forEach((key) => {
    if (previousModes[key]) {
      merged[key] = previousModes[key];
    }
  });

  return merged;
}

function Tooth({ jaw, index, point, mode, onCycle }) {
  const toothId = `${jaw}-${index}`;

  function handleKeyDown(event) {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    onCycle(toothId);
  }

  return (
    <g
      transform={`translate(${point.x} ${point.y}) rotate(${point.rotationDeg})`}
      className={`focus-tooth ${mode}`}
      role="button"
      tabIndex={0}
      aria-label={`Tooth ${toothId} focus ${mode}`}
      onClick={() => onCycle(toothId)}
      onKeyDown={handleKeyDown}
    >
      <defs>
        <clipPath id={`${toothId}-clip`}>
          <path d="M0 -18 C10 -18 14 -10 14 0 C14 10 8 18 0 20 C-8 18 -14 10 -14 0 C-14 -10 -10 -18 0 -18 Z" />
        </clipPath>
        <clipPath id={`${toothId}-front`}>
          <rect x="-16" y="0" width="32" height="24" />
        </clipPath>
        <clipPath id={`${toothId}-back`}>
          <rect x="-16" y="-22" width="32" height="22" />
        </clipPath>
      </defs>
      <path className="focus-tooth-base" d="M0 -18 C10 -18 14 -10 14 0 C14 10 8 18 0 20 C-8 18 -14 10 -14 0 C-14 -10 -10 -18 0 -18 Z" />
      <path className="focus-tooth-front" d="M0 -18 C10 -18 14 -10 14 0 C14 10 8 18 0 20 C-8 18 -14 10 -14 0 C-14 -10 -10 -18 0 -18 Z" clipPath={`url(#${toothId}-front)`} />
      <path className="focus-tooth-back" d="M0 -18 C10 -18 14 -10 14 0 C14 10 8 18 0 20 C-8 18 -14 10 -14 0 C-14 -10 -10 -18 0 -18 Z" clipPath={`url(#${toothId}-back)`} />
      <path className="focus-tooth-outline" d="M0 -18 C10 -18 14 -10 14 0 C14 10 8 18 0 20 C-8 18 -14 10 -14 0 C-14 -10 -10 -18 0 -18 Z" />
      <path className="focus-tooth-groove" d="M-6 -7 C-2 -10 2 -10 6 -7" />
    </g>
  );
}

export default function HygienistFocusInstructions({ topTeeth = 16, bottomTeeth = 16, patientPrompt, clinicalPrompt, toothModes = null, onToothModesChange = null }) {
  const [localToothModes, setLocalToothModes] = useState(() => buildInitialToothModes(topTeeth, bottomTeeth));
  const controlledToothModes = toothModes || localToothModes;

  const mapLayout = useMemo(() => buildToothLayout(topTeeth, bottomTeeth), [topTeeth, bottomTeeth]);
  const normalizedToothModes = useMemo(
    () => mergeToothModes(controlledToothModes, topTeeth, bottomTeeth),
    [controlledToothModes, topTeeth, bottomTeeth]
  );
  const modeCounts = useMemo(() => getModeCounts(normalizedToothModes), [normalizedToothModes]);

  function applyToothModes(nextModes) {
    if (onToothModesChange) {
      onToothModesChange(nextModes);
      return;
    }

    setLocalToothModes(nextModes);
  }

  function cycleTooth(toothId) {
    const syncedModes = mergeToothModes(normalizedToothModes, topTeeth, bottomTeeth);
    applyToothModes({
      ...syncedModes,
      [toothId]: getNextMode(syncedModes[toothId])
    });
  }

  function resetAll() {
    applyToothModes(buildInitialToothModes(topTeeth, bottomTeeth));
  }

  return (
    <section className="card hygienist-focus-tab">
      <h2>Hygienist Focus Instructions</h2>
      <p>Tap any tooth to cycle focus mode: none {">"} front {">"} back {">"} both.</p>

      <div className="hygienist-focus-map-shell">
        <svg className="hygienist-focus-map" viewBox="0 0 360 420" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Interactive hygienist focus tooth map">
          {mapLayout.top.map((point) => {
            const toothId = `top-${point.index}`;
            return (
              <Tooth
                key={toothId}
                jaw="top"
                index={point.index}
                point={point}
                mode={normalizedToothModes[toothId] || "none"}
                onCycle={cycleTooth}
              />
            );
          })}
          {mapLayout.bottom.map((point) => {
            const toothId = `bottom-${point.index}`;
            return (
              <Tooth
                key={toothId}
                jaw="bottom"
                index={point.index}
                point={point}
                mode={normalizedToothModes[toothId] || "none"}
                onCycle={cycleTooth}
              />
            );
          })}
        </svg>
      </div>

      <div className="hygienist-focus-legend" aria-label="Focus mode legend">
        <span className="legend-chip none">None ({modeCounts.none})</span>
        <span className="legend-chip front">Front ({modeCounts.front})</span>
        <span className="legend-chip back">Back ({modeCounts.back})</span>
        <span className="legend-chip both">Both ({modeCounts.both})</span>
        <button type="button" className="hygienist-focus-reset" onClick={resetAll}>Reset all to none</button>
      </div>

      <article className="hygienist-focus-card">
        <h3>Patient Prompt</h3>
        <p>{patientPrompt}</p>
      </article>
      <article className="hygienist-focus-card">
        <h3>Clinical Prompt</h3>
        <p>{clinicalPrompt}</p>
      </article>
    </section>
  );
}
