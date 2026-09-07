function clampNumber(value, min, max) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, value));
}

export function getActiveToothPulseMs(bpm, options = {}) {
  const fallbackMs = Number(options.fallbackMs ?? 760);
  const minMs = Number(options.minMs ?? 375);
  const maxMs = Number(options.maxMs ?? 1200);
  const safeBpm = Number(bpm);

  if (!Number.isFinite(safeBpm) || safeBpm <= 0) {
    return Number.isFinite(fallbackMs) ? fallbackMs : 760;
  }

  return clampNumber(Math.round((60 / safeBpm) * 1000), minMs, maxMs);
}
