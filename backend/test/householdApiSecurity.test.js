"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const app = require("../src/server");

test("all family endpoints reject requests without verified parent authentication", async () => {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;
  const householdId = "household_01234567-89ab-4cde-8fab-0123456789ab";
  const endpoints = [
    ["GET", "/api/households/mine"],
    ["GET", "/api/households/" + householdId],
    ["GET", "/api/households/" + householdId + "/entitlement"],
    ["GET", "/api/households/" + householdId + "/music-access"],
    ["POST", "/api/households/" + householdId + "/weekly-teaser"],
    ["POST", "/api/households/" + householdId + "/claim"],
    ["POST", "/api/households/" + householdId + "/sync"]
  ];
  try {
    for (const [method, path] of endpoints) {
      const response = await fetch(base + path, {
        method,
        headers: method === "POST" ? { "Content-Type": "application/json" } : {},
        ...(method === "POST" ? { body: JSON.stringify({ householdName: "Test", members: [] }) } : {})
      });
      assert.equal(response.status, 401, `${method} ${path} must require authorization`);
      const body = await response.json();
      assert.equal(body.code, "auth_required");
    }
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
