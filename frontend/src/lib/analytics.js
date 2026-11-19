import { appEnvironment, safePageLocation, sanitizeAnalyticsEvent, sanitizeLanguageEvent } from "./analyticsSanitizer";

const MEASUREMENT_ID = String(import.meta.env.VITE_GA_MEASUREMENT_ID || "").trim();
const ENVIRONMENT = appEnvironment(import.meta.env.VITE_APP_ENVIRONMENT);
const CONSENT_STORAGE_KEY = "brushbeats_analytics_consent";
const CONSENT_STATUS = {
  granted: "granted",
  denied: "denied",
  unknown: "unknown"
};

let initialized = false;
const pendingLanguageFallbackEvents = [];
const pendingLanguageContextEvents = [];

function canUseLocalStorage() {
  try {
    return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
  } catch {
    return false;
  }
}

function consentPayload(analyticsStorage) {
  return {
    analytics_storage: analyticsStorage,
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied"
  };
}

function ensureGtagShim() {
  if (typeof window === "undefined") {
    return;
  }

  window.dataLayer = window.dataLayer || [];

  if (typeof window.gtag !== "function") {
    window.gtag = function gtag() {
      window.dataLayer.push(arguments);
    };
  }
}

function sendGtagEvent(eventName, params = {}) {
  if (typeof window === "undefined" || typeof window.gtag !== "function") {
    return false;
  }

  window.gtag("event", eventName, { ...params, app_environment: ENVIRONMENT });
  return true;
}

function flushPendingLanguageFallbackEvents() {
  if (!initialized || !hasAnalyticsConsent()) {
    return;
  }

  while (pendingLanguageFallbackEvents.length > 0) {
    const nextEvent = pendingLanguageFallbackEvents.shift();
    sendGtagEvent("language_fallback", nextEvent);
  }
}

function flushPendingLanguageContextEvents() {
  if (!initialized || !hasAnalyticsConsent()) {
    return;
  }

  while (pendingLanguageContextEvents.length > 0) {
    const nextEvent = pendingLanguageContextEvents.shift();
    sendGtagEvent("language_context", nextEvent);
  }
}

export function analyticsEnabled() {
  return /^G-[A-Z0-9]{6,20}$/.test(MEASUREMENT_ID);
}

export function getAnalyticsConsentStatus() {
  if (!canUseLocalStorage()) {
    return CONSENT_STATUS.unknown;
  }

  let stored;
  try {
    stored = window.localStorage.getItem(CONSENT_STORAGE_KEY);
  } catch {
    return CONSENT_STATUS.unknown;
  }
  if (stored === CONSENT_STATUS.granted || stored === CONSENT_STATUS.denied) {
    return stored;
  }

  return CONSENT_STATUS.unknown;
}

export function hasAnalyticsConsent() {
  return getAnalyticsConsentStatus() === CONSENT_STATUS.granted;
}

export function setAnalyticsConsent(granted) {
  const nextStatus = granted ? CONSENT_STATUS.granted : CONSENT_STATUS.denied;

  if (canUseLocalStorage()) {
    try {
      window.localStorage.setItem(CONSENT_STORAGE_KEY, nextStatus);
    } catch {
      return CONSENT_STATUS.unknown;
    }
  }

  if (typeof window.gtag === "function") {
    window.gtag("consent", "update", consentPayload(granted ? "granted" : "denied"));
  }

  return nextStatus;
}

export function initializeAnalytics() {
  if (!analyticsEnabled() || !hasAnalyticsConsent() || initialized) {
    return false;
  }

  ensureGtagShim();
  window.gtag("consent", "default", consentPayload("denied"));
  window.gtag("consent", "update", consentPayload("granted"));
  // Set the environment for reporting; never send links with OTPs or shared-link tokens.
  const pageLocation = safePageLocation(window.location.href);
  const referrer = safePageLocation(document.referrer);
  window.gtag("set", { app_environment: ENVIRONMENT, ...(pageLocation && { page_location: pageLocation }) });

  const existingScript = document.querySelector(`script[data-ga4-id="${MEASUREMENT_ID}"]`);
  if (!existingScript) {
    const script = document.createElement("script");
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`;
    script.setAttribute("data-ga4-id", MEASUREMENT_ID);
    document.head.appendChild(script);
  }

  window.gtag("js", new Date());
  window.gtag("config", MEASUREMENT_ID, {
    anonymize_ip: true,
    send_page_view: true,
    app_environment: ENVIRONMENT,
    ...(pageLocation && { page_location: pageLocation }),
    ...(referrer && { page_referrer: referrer })
  });

  initialized = true;
  flushPendingLanguageFallbackEvents();
  flushPendingLanguageContextEvents();
  return true;
}

export function getAnalyticsDiagnostics() {
  return { configured: analyticsEnabled(), measurementId: analyticsEnabled() ? MEASUREMENT_ID : null,
    environment: ENVIRONMENT, consent: getAnalyticsConsentStatus(), initialized };
}

export function trackEvent(eventName, params = {}) {
  if (!analyticsEnabled() || !hasAnalyticsConsent() || !initialized) return;
  const safe = sanitizeAnalyticsEvent(eventName, params);
  if (safe) sendGtagEvent(safe.name, safe.params);
}

export function trackLanguageFallback(payload) {
  if (!analyticsEnabled()) return;
  const safe = sanitizeLanguageEvent("language_fallback", payload);
  if (!safe) return;
  if (!hasAnalyticsConsent() || !initialized || !sendGtagEvent(safe.name, safe.params)) {
    pendingLanguageFallbackEvents.push(safe.params);
  }
}

export function trackLanguageContext(payload) {
  if (!analyticsEnabled()) return;
  const safe = sanitizeLanguageEvent("language_context", payload);
  if (!safe) return;
  if (!hasAnalyticsConsent() || !initialized || !sendGtagEvent(safe.name, safe.params)) {
    pendingLanguageContextEvents.push(safe.params);
  }
}
