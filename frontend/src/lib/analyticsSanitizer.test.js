import test from "node:test";
import assert from "node:assert/strict";
import {
  sanitizeAnalyticsEvent, sanitizeLanguageEvent, safePageLocation, appEnvironment, toothSelectionEvent
} from "./analyticsSanitizer.js";

test("GA4 events never expose identities, songs, browser URLs or dental profile data", () => {
  const event = sanitizeAnalyticsEvent("phase3_active_user_switched", {
    household_id: "household-secret", user_id: "user-secret"
  });
  assert.deepEqual(event, { name: "phase3_active_user_switched", params: {} });

  const selected = sanitizeAnalyticsEvent("song_selected", {
    title: "Treasure", artist: "Bruno Mars", source: "favorites",
    email: "user@example.com", household_id: "123"
  });
  assert.deepEqual(selected, { name: "song_selected", params: { source: "favorites" } });

  assert.deepEqual(sanitizeAnalyticsEvent("bpm_calculated", {
    top_teeth: 14, bottom_teeth: 14, search_bpm: 118
  }), { name: "bpm_calculated", params: {} });

  assert.equal(sanitizeAnalyticsEvent("nonexistent_event", { email: "user@example.com" }), null);
});

test("track only bounded numeric, boolean and low-cardinality values", () => {
  assert.deepEqual(sanitizeAnalyticsEvent("brushing_started", {
    extend_enabled: true, duration_seconds: 123.4, song_title: "Private"
  }), { name: "brushing_started", params: { extend_enabled: true, duration_seconds: 123 } });
  assert.deepEqual(sanitizeAnalyticsEvent("workflow_step_view", {
    step: "https://example.com/?auth=secret"
  }), { name: "workflow_step_view", params: {} });
});

test("language analytics drops referrer, full URL, and verbose browser languages", () => {
  const event = sanitizeLanguageEvent("language_context", {
    requested_language: "en-CA", resolved_language: "en",
    did_fallback: false, match_type: "regional_match",
    browser_languages: "en-CA,fr-CA", page_path: "/?token=secret"
  });
  assert.deepEqual(event, {
    name: "language_context",
    params: { requested_language: "en", resolved_language: "en", did_fallback: false, match_type: "regional_match" }
  });
  assert.equal(sanitizeLanguageEvent("language_context", { requested_language: "sensitive@email.com" }).params.requested_language,"unknown");
});

test("page locations never contain verification codes, query strings or hashes", () => {
  assert.equal(safePageLocation("https://brushbeats.ca/?videoId=abc&code=123#secret"), "https://brushbeats.ca/");
  assert.equal(safePageLocation("https://fitzgr.github.io/BrushBeats-dev/?token=abc"), "https://fitzgr.github.io/BrushBeats-dev/");
  assert.equal(safePageLocation("javascript:alert(1)"), null);
  assert.equal(appEnvironment("production"), "production");
  assert.equal(appEnvironment("unknown"), "development");
});

test("tooth-choice analytics are grouped and never include age or exact tooth counts", () => {
  assert.equal(toothSelectionEvent(10, 10), "teeth_selected_01_20");
  assert.equal(toothSelectionEvent(12, 12), "teeth_selected_21_24");
  assert.equal(toothSelectionEvent(14, 14), "teeth_selected_25_28");
  assert.equal(toothSelectionEvent(16, 16), "teeth_selected_29_32");
  assert.equal(toothSelectionEvent(4, 8), "teeth_selected_01_20");
  assert.equal(toothSelectionEvent(17, 16), null);
  assert.equal(toothSelectionEvent(0, 0), null);
  const safe = sanitizeAnalyticsEvent(toothSelectionEvent(14, 14), {
    age: 63, email: "person@example.com", tooth_count: 28, household_id: "private"
  });
  assert.deepEqual(safe, {name:"teeth_selected_25_28", params:{}});
});
