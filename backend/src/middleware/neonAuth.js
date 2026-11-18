"use strict";

/**
 * Validate Neon's Ed25519 bearer tokens without trusting client-provided identity.
 * Do not use decoded JWT claims until the signature, issuer, audience,
 * verification status and expiry have all been validated.
 */
const { createPublicKey, verify } = require("node:crypto");

const MAX_TOKEN_LENGTH = 8192;
const JWKS_CACHE_MS = 5 * 60 * 1000;
let cachedKeys = null;
let cachedUrl = "";
let cachedAt = 0;

function decodeJwtPart(encoded) {
  if (typeof encoded !== "string" || !/^[a-zA-Z0-9_-]+$/.test(encoded)) {
    throw new Error("Malformed JWT");
  }
  return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
}

function validateToken(token, keys, origin, nowSecs = Math.floor(Date.now() / 1000)) {
  if (typeof token !== "string" || token.length > MAX_TOKEN_LENGTH) throw new Error("Invalid token");
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Malformed JWT");
  const [headerPart, payloadPart, signaturePart] = parts;
  const header = decodeJwtPart(headerPart);
  const payload = decodeJwtPart(payloadPart);
  if (header.alg !== "EdDSA" || typeof header.kid !== "string" || !header.kid) {
    throw new Error("Unsupported signing algorithm");
  }
  const jwk = keys.find((key) =>
    key.kid === header.kid && key.kty === "OKP" && key.crv === "Ed25519" &&
    typeof key.x === "string" && (!key.alg || key.alg === "EdDSA") &&
    (!key.use || key.use === "sig")
  );
  if (!jwk || !/^[A-Za-z0-9_-]+$/.test(signaturePart)) {
    throw new Error("Unknown signing key");
  }
  const key = createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: jwk.x }, format: "jwk" });
  if (!verify(null, Buffer.from(headerPart + "." + payloadPart), key,
              Buffer.from(signaturePart, "base64url"))) {
    throw new Error("Invalid signature");
  }
  const audienceMatches = payload.aud === origin ||
    (Array.isArray(payload.aud) && payload.aud.includes(origin));
  if (payload.iss !== origin || !audienceMatches) throw new Error("Invalid issuer or audience");
  if (!Number.isFinite(payload.exp) || payload.exp <= nowSecs ||
      (payload.nbf !== undefined && (!Number.isFinite(payload.nbf) || payload.nbf > nowSecs)) ||
      (payload.iat !== undefined && (!Number.isFinite(payload.iat) || payload.iat > nowSecs + 30))) {
    throw new Error("Invalid token lifetime");
  }
  if (typeof payload.sub !== "string" || payload.sub.length < 3 || payload.sub.length > 255) {
    throw new Error("Missing authenticated user");
  }
  if (payload.emailVerified !== true) throw new Error("Email verification required");
  return payload;
}

async function loadJwks() {
  const authBase = process.env.NEON_AUTH_BASE_URL;
  if (!authBase) throw new Error("Auth not configured");
  const base = new URL(authBase);
  if (base.protocol !== "https:") throw new Error("Invalid auth configuration");
  const jwksUrl = new URL(process.env.NEON_AUTH_JWKS_URL ||
    authBase.replace(/\/$/, "") + "/.well-known/jwks.json");
  if (jwksUrl.protocol !== "https:" || jwksUrl.origin !== base.origin) {
    throw new Error("Invalid JWKS configuration");
  }
  if (cachedKeys && cachedUrl === jwksUrl.href && Date.now() - cachedAt < JWKS_CACHE_MS) {
    return { keys: cachedKeys, origin: base.origin };
  }
  const response = await fetch(jwksUrl, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(5000)
  });
  if (!response.ok) throw new Error("Auth signing keys unavailable");
  const jwks = await response.json();
  if (!Array.isArray(jwks.keys) || jwks.keys.length > 20) throw new Error("Invalid JWKS");
  cachedKeys = jwks.keys;
  cachedUrl = jwksUrl.href;
  cachedAt = Date.now();
  return { keys: cachedKeys, origin: base.origin };
}

async function requireNeonAuth(req, res, next) {
  const match = /^Bearer ([A-Za-z0-9_.-]+)$/i.exec(req.headers.authorization || "");
  if (!match) return res.status(401).json({ code: "auth_required", error: "Sign-in required" });
  try {
    const { keys, origin } = await loadJwks();
    const payload = validateToken(match[1], keys, origin);
    req.authAccount = {
      subject: payload.sub,
      email: typeof payload.email === "string" ? payload.email : null,
      displayName: typeof payload.name === "string" ? payload.name : null
    };
    return next();
  } catch (error) {
    if (/not configured|configuration|unavailable|JWKS/.test(error.message)) {
      return res.status(503).json({ code: "auth_unavailable", error: "Sign-in temporarily unavailable" });
    }
    return res.status(401).json({ code: "auth_invalid", error: "Invalid, unverified or expired sign-in" });
  }
}

module.exports = { requireNeonAuth, validateToken };
