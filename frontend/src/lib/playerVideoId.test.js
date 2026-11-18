import test from "node:test";
import assert from "node:assert/strict";
import { normalizePlayerVideoId, parsePlayerVideoId } from "./playerVideoId.js";

const validId = "dQw4w9WgXcQ";

test("accepts a valid YouTube ID", () => {
  assert.equal(normalizePlayerVideoId(validId), validId);
  assert.equal(parsePlayerVideoId({ videoId: validId }), validId);
});

test("refuses empty, malformed, or non-string IDs", () => {
  for (const value of [null, "", "not-an-id", "invalid video id", {}, 12345678901]) {
    assert.equal(normalizePlayerVideoId(value), null);
    assert.equal(parsePlayerVideoId({ videoId: value }), null);
  }
});

test("recovers a valid ID from a trusted embed URL when the direct ID is malformed", () => {
  const embedUrl = "https://www.youtube-nocookie.com/embed/" + validId + "?rel=0";
  assert.equal(parsePlayerVideoId({ videoId: "invalid", embedUrl }), validId);
  assert.equal(parsePlayerVideoId({ embedUrl: "https://www.youtube.com/embed/" + validId }), validId);
});

test("rejects non-embed or untrusted video URLs", () => {
  for (const embedUrl of [
    "https://example.com/embed/" + validId,
    "https://www.youtube.com/watch?v=" + validId,
    "https://www.youtube.com/embed/INVALID",
    "javascript:alert(1)",
    "not a url"
  ]) {
    assert.equal(parsePlayerVideoId({ embedUrl }), null);
  }
});
