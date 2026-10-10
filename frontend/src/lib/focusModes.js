/**
 * Only explicit patient selections are eligible for extra-care timing.
 * Missing/empty selections never imply personalized tooth recommendations.
 */
export function buildFocusSurfaceModeMapFromSelector(rawModes = {}) {
  const focusMap = new Map();
  Object.entries(rawModes || {}).forEach(([selectorKey, mode]) => {
    const match = String(selectorKey).match(/^(top|bottom)[-:](\d+)$/);
    if (!match || !["front", "back", "both"].includes(mode)) {
      return;
    }
    focusMap.set(`${match[1]}:${Number(match[2])}`, mode);
  });
  return focusMap;
}
