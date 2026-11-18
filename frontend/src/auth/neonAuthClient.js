/**
 * Minimal client for the already-provisioned Neon Managed Better Auth service.
 * No authentication credentials or JWT are persisted in localStorage.
 * When cookies/JWT headers are unavailable, cloud access fails closed.
 */
const AUTH_BASE = String(import.meta.env.VITE_NEON_AUTH_URL || "").replace(/\/$/, "");

export function isHouseholdAuthConfigured() {
  return AUTH_BASE.startsWith("https://");
}

async function callAuth(path, { method = "GET", body } = {}) {
  if (!isHouseholdAuthConfigured()) {
    throw new Error("Household sign-in has not been configured for this build.");
  }
  const response = await fetch(AUTH_BASE + path, {
    method,
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.error) {
    const error = result.error || {};
    throw new Error(error.message || result.message || "Authentication request failed");
  }
  return { data: result, response };
}

export async function registerParent({ name, email, password }) {
  return (await callAuth("/sign-up/email", { method: "POST", body: { name, email, password } })).data;
}

export async function sendParentEmailVerification({ email }) {
  return (await callAuth("/email-otp/send-verification-otp", {
    method: "POST", body: { email, type: "email-verification" }
  })).data;
}

export async function verifyParentEmail({ email, code }) {
  return (await callAuth("/email-otp/verify-email", {
    method: "POST", body: { email, otp: code }
  })).data;
}

export async function signInParent({ email, password }) {
  return (await callAuth("/sign-in/email", {
    method: "POST", body: { email, password }
  })).data;
}

export async function signOutParent() {
  return (await callAuth("/sign-out", { method: "POST", body: {} })).data;
}

/**
 * Return fresh auth status + the short-lived JWT issued by Neon.
 * The JWT must be readable from the explicitly exposed Set-Auth-Jwt header;
 * never synthesize one from a user ID or treat a cookie as a bearer token.
 */
export async function loadVerifiedParentSession() {
  const { data, response } = await callAuth("/get-session");
  if (!data?.session || !data?.user?.emailVerified) {
    return { user: null, jwt: null };
  }
  const jwt = response.headers.get("set-auth-jwt");
  return { user: data.user, jwt: jwt || null };
}

export async function getHouseholdBearerToken() {
  const result = await loadVerifiedParentSession();
  if (!result.user) throw new Error("Sign in and verify your email before syncing a household.");
  if (!result.jwt) {
    throw new Error("This browser could not retrieve the authenticated cloud token. Cloud sync remains disabled.");
  }
  return result.jwt;
}
