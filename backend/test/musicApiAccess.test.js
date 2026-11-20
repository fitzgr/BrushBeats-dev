"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const app = require("../src/server");

test("opt-in music API enforcement refuses unauthenticated song/video lookup", async () => {
  const previous = process.env.ENABLE_MUSIC_API_ENFORCEMENT;
  process.env.ENABLE_MUSIC_API_ENFORCEMENT = "true";
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = "http://127.0.0.1:" + server.address().port;
  try {
    for (const path of ["/api/songs?bpm=120", "/api/youtube?artist=x&title=y", "/api/youtube/search?q=x"]) {
      const response = await fetch(base + path);
      assert.equal(response.status, 401, path + " should require verified sign-in");
      const body = await response.json();
      assert.equal(body.code, "auth_required");
    }
    // Basic brushing calculations remain available to everyone.
    const bpm = await fetch(base + "/api/bpm?top=14&bottom=14&duration=120");
    assert.notEqual(bpm.status, 401, "brushing timer math must never require music authorization");
    assert.notEqual(bpm.status, 402, "brushing timer math must not be paywalled");
  } finally {
    if (previous === undefined) delete process.env.ENABLE_MUSIC_API_ENFORCEMENT;
    else process.env.ENABLE_MUSIC_API_ENFORCEMENT = previous;
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
