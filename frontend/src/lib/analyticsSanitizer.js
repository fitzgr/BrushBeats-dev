// Only product-usage metadata belongs in GA4. Never send identities, household
// IDs, verification codes, song names, dental profiles, or URL query strings.
const EVENT_FIELDS = Object.freeze({
  phase2_migration_status: ["result", "has_error"],
  phase2_household_setup_completed: ["review_source", "migration_review"],
  phase3_active_user_switched: [],
  stored_song_queued: ["source"],
  bpm_calculated: [],
  brushing_completed: [],
  song_selected: ["source"],
  brushing_resumed: [],
  song_auto_queued: ["trigger"],
  brushing_started: ["extend_enabled", "duration_seconds"],
  brushing_reset: [],
  song_playback_finished_during_brushing: [],
  account_signup_requested: [],
  account_email_verified: [],
  account_sign_in_completed: [],
  household_cloud_connected: [],
  workflow_step_view: ["step"],
  // Broad, consent-based, non-identifying selection ranges: no exact dental counts or age estimates.
  teeth_selected_01_20: [],
  teeth_selected_21_24: [],
  teeth_selected_25_28: [],
  teeth_selected_29_32: []
});

const BOOLEAN_FIELDS = new Set(["has_error", "migration_review", "extend_enabled"]);
const NUMBER_FIELDS = new Set(["duration_seconds"]);

function safeCategory(value) {
  return typeof value === "string" && /^[a-z][a-z0-9_-]{0,39}$/i.test(value)
    ? value.toLowerCase()
    : null;
}

function safeLanguage(value) {
  if (typeof value !== "string") return "unknown";
  const match = /^([a-z]{2,3})(?:-[a-z0-9]{2,8})*$/i.exec(value.trim());
  return match ? match[1].toLowerCase() : "unknown";
}

export function sanitizeAnalyticsEvent(name, params = {}) {
  if (!Object.prototype.hasOwnProperty.call(EVENT_FIELDS, name)) return null;
  const clean = {};
  for (const field of EVENT_FIELDS[name]) {
    const value = params?.[field];
    if (BOOLEAN_FIELDS.has(field)) {
      if (typeof value === "boolean") clean[field] = value;
    } else if (NUMBER_FIELDS.has(field)) {
      if (Number.isFinite(value) && value >= 0 && value <= 600) clean[field] = Math.round(value);
    } else {
      const category = safeCategory(value);
      if (category) clean[field] = category;
    }
  }
  return { name, params: clean };
}

export function sanitizeLanguageEvent(type, payload = {}) {
  if (type !== "language_context" && type !== "language_fallback") return null;
  const result = {
    requested_language: safeLanguage(payload.requested_language),
    resolved_language: safeLanguage(payload.resolved_language),
    did_fallback: Boolean(payload.did_fallback ?? (type === "language_fallback"))
  };
  const matchType = safeCategory(payload.match_type);
  if (matchType) result.match_type = matchType;
  return { name: type, params: result };
}

export function safePageLocation(href) {
  try {
    const url = new URL(href);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.origin + url.pathname;
  } catch {
    return null;
  }
}

export function appEnvironment(value) {
  return value === "production" ? "production" : "development";
}

/** Group selections for product-usage statistics; never send exact counts or infer age. */
export function toothSelectionEvent(top, bottom) {
  if (!Number.isInteger(top) || !Number.isInteger(bottom) || top < 0 || bottom < 0 || top > 16 || bottom > 16) return null;
  const total = top + bottom;
  if (total < 1 || total > 32) return null;
  if (total <= 20) return "teeth_selected_01_20";
  if (total <= 24) return "teeth_selected_21_24";
  if (total <= 28) return "teeth_selected_25_28";
  return "teeth_selected_29_32";
}
