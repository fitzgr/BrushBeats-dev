/**
 * The full-mouth pass stays complete during Extend, except for the selected
 * surfaces being revisited. Those surfaces reset at the start cue and only
 * count as clean again when their second-pass tooth entry finishes.
 */
export function getToothSurfaceVisualState({
  timeline = [],
  elapsedSeconds = 0,
  jaw,
  mapIndex,
  surface,
  focusSurfaceModes = new Map(),
  extendPassStarted = false
} = {}) {
  const mode = focusSurfaceModes.get(`${jaw}:${mapIndex}`);
  const isSelected = mode === "both" || mode === surface;
  const matchesSurface = (entry) =>
    entry.type === "tooth" &&
    entry.jaw === jaw &&
    entry.mapIndex === mapIndex &&
    entry.surface === surface;

  // Require a real Extend tooth entry: no selection or no second pass must
  // never make an otherwise completed surface dirty.
  const repeatSurface = extendPassStarted && isSelected &&
    timeline.some((entry) => entry.pass === "extend" && matchesSurface(entry));
  const brushed = timeline.some((entry) =>
    matchesSurface(entry) &&
    entry.endsAt <= elapsedSeconds &&
    (!repeatSurface || entry.pass === "extend")
  );

  return { brushed, extendPending: Boolean(repeatSurface && !brushed) };
}
