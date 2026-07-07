/// <reference types="vite/client" />

import i18n from "i18next";
import type { Resource } from "i18next";
import { initReactI18next } from "react-i18next";
import { trackLanguageContext, trackLanguageFallback } from "./lib/analytics";

export const SUPPORTED_LANGUAGES = ["en", "es", "tr"] as const;
export const FALLBACK_LANGUAGE = "en";
export const SUPPORTED_LANGUAGE_OVERRIDE_KEY = "brushbeats_supported_language_override";

let languageFallbackInfo = {
  didFallback: false,
  needsSupportedLanguageChoice: false,
  requestedLanguage: "",
  resolvedLanguage: FALLBACK_LANGUAGE,
  fallbackLanguage: FALLBACK_LANGUAGE
};
let lastFallbackSignature = "";

function canUseLocalStorage() {
  try {
    return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
  } catch {
    return false;
  }
}

function detectRequestedLanguage() {
  if (typeof window === "undefined") {
    return "";
  }

  const searchParams = new URLSearchParams(window.location.search);
  const queryLanguage = searchParams.get("lng");
  if (queryLanguage) {
    return queryLanguage;
  }

  return navigator.languages?.[0] || navigator.language || "";
}

function normalizeRequestedLanguage(value: string | readonly string[] | undefined) {
  if (Array.isArray(value)) {
    return typeof value[0] === "string" ? value[0] : "";
  }

  return typeof value === "string" ? value : "";
}

function isSupportedLanguage(requestedLanguage: string) {
  return Boolean(resolveSupportedLanguage(requestedLanguage));
}

function resolveSupportedLanguage(requestedLanguage: string) {
  if (!requestedLanguage) {
    return null;
  }

  const normalized = requestedLanguage.toLowerCase();
  return SUPPORTED_LANGUAGES.find(
    (supportedLanguage) => normalized === supportedLanguage || normalized.startsWith(`${supportedLanguage}-`)
  ) || null;
}

function getStoredSupportedLanguageOverride() {
  if (!canUseLocalStorage()) {
    return "";
  }

  try {
    return window.localStorage.getItem(SUPPORTED_LANGUAGE_OVERRIDE_KEY) || "";
  } catch {
    return "";
  }
}

function setStoredSupportedLanguageOverride(language: string) {
  if (!canUseLocalStorage()) {
    return;
  }

  try {
    window.localStorage.setItem(SUPPORTED_LANGUAGE_OVERRIDE_KEY, language);
  } catch {
    // Ignore storage access problems and continue without persisting the override.
  }
}

function clearStoredSupportedLanguageOverride() {
  if (!canUseLocalStorage()) {
    return;
  }

  try {
    window.localStorage.removeItem(SUPPORTED_LANGUAGE_OVERRIDE_KEY);
  } catch {
    // Ignore storage access problems and continue without clearing the override.
  }
}

function resolveRequestedLanguage(requestedLanguage: string) {
  const supportedRequestedLanguage = resolveSupportedLanguage(requestedLanguage);
  if (supportedRequestedLanguage) {
    clearStoredSupportedLanguageOverride();
    return supportedRequestedLanguage;
  }

  const storedOverride = resolveSupportedLanguage(getStoredSupportedLanguageOverride());
  if (storedOverride) {
    return storedOverride;
  }

  return FALLBACK_LANGUAGE;
}

function buildLanguageMatchType(requestedLanguage: string, resolvedLanguage: string) {
  if (!requestedLanguage) {
    return "missing_request";
  }

  const normalizedRequestedLanguage = requestedLanguage.toLowerCase();
  const normalizedResolvedLanguage = resolvedLanguage.toLowerCase();

  if (normalizedRequestedLanguage === normalizedResolvedLanguage) {
    return "exact_match";
  }

  if (normalizedRequestedLanguage.startsWith(`${normalizedResolvedLanguage}-`)) {
    return "regional_match";
  }

  return normalizedResolvedLanguage === FALLBACK_LANGUAGE ? "fallback" : "override";
}

async function loadTranslation(language: string): Promise<Record<string, unknown>> {
  try {
    const translationPath = `${import.meta.env.BASE_URL}locales/${language}/translation.json`;
    const response = await fetch(translationPath);
    if (!response.ok) {
      throw new Error(`Unable to load translation file for ${language}`);
    }

    return await response.json();
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error("[i18n] Failed to load translations", error);
    }

    return {};
  }
}

async function loadTranslations(): Promise<Resource> {
  const entries = await Promise.all(
    SUPPORTED_LANGUAGES.map(async (language) => [language, await loadTranslation(language)] as const)
  );

  return entries.reduce(
    (resources, [language, translation]) => ({
      ...resources,
      [language]: { translation }
    }),
    {} as Resource
  );
}

function updateFallbackInfo(requestedLanguage: string, resolvedLanguage: string) {
  const needsSupportedLanguageChoice = Boolean(requestedLanguage) && !isSupportedLanguage(requestedLanguage);
  const didFallback = needsSupportedLanguageChoice && resolvedLanguage === FALLBACK_LANGUAGE;
  const matchType = buildLanguageMatchType(requestedLanguage, resolvedLanguage);

  languageFallbackInfo = {
    didFallback,
    needsSupportedLanguageChoice,
    requestedLanguage,
    resolvedLanguage,
    fallbackLanguage: FALLBACK_LANGUAGE
  };

  if (import.meta.env.DEV) {
    console.info("[i18n] language detection", {
      requestedLanguage,
      resolvedLanguage,
      supportedLanguages: SUPPORTED_LANGUAGES
    });
  }

  trackLanguageContext({
    requested_language: requestedLanguage || "unknown",
    resolved_language: resolvedLanguage,
    fallback_language: FALLBACK_LANGUAGE,
    browser_language: navigator.language || "",
    browser_languages: navigator.languages?.join(",") || navigator.language || "",
    did_fallback: didFallback,
    needs_supported_language_choice: needsSupportedLanguageChoice,
    match_type: matchType,
    page_path: `${window.location.pathname}${window.location.search}`
  });

  if (!didFallback) {
    return;
  }

  const fallbackSignature = `${requestedLanguage}:${resolvedLanguage}:${window.location.pathname}${window.location.search}`;
  if (fallbackSignature === lastFallbackSignature) {
    return;
  }

  lastFallbackSignature = fallbackSignature;
  trackLanguageFallback({
    requested_language: requestedLanguage,
    resolved_language: resolvedLanguage,
    fallback_language: FALLBACK_LANGUAGE,
    browser_languages: navigator.languages?.join(",") || navigator.language || "",
    page_path: `${window.location.pathname}${window.location.search}`
  });
}

async function syncDetectedLanguage() {
  const requestedLanguage = normalizeRequestedLanguage(detectRequestedLanguage());
  const nextLanguage = resolveRequestedLanguage(requestedLanguage);

  await i18n.changeLanguage(nextLanguage);
  updateFallbackInfo(requestedLanguage, i18n.resolvedLanguage || i18n.language || FALLBACK_LANGUAGE);
  return languageFallbackInfo;
}

const requestedLanguage = normalizeRequestedLanguage(detectRequestedLanguage());
const resources = await loadTranslations();
const initialLanguage = resolveRequestedLanguage(requestedLanguage);

await i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: initialLanguage,
    supportedLngs: [...SUPPORTED_LANGUAGES],
    fallbackLng: FALLBACK_LANGUAGE,
    nonExplicitSupportedLngs: true,
    load: "languageOnly",
    interpolation: {
      escapeValue: false
    },
    react: {
      useSuspense: false
    },
    debug: import.meta.env.DEV
  });

updateFallbackInfo(requestedLanguage, i18n.resolvedLanguage || i18n.language || FALLBACK_LANGUAGE);

// To add a new language later:
// 1. Add the new language code to SUPPORTED_LANGUAGES.
// 2. Add a matching file at public/locales/<language>/translation.json.
// 3. Keep the translation key structure consistent with the English file.
export function getLanguageFallbackInfo() {
  return languageFallbackInfo;
}

export async function setPreferredSupportedLanguage(language: string) {
  const supportedLanguage = resolveSupportedLanguage(language);
  if (!supportedLanguage) {
    return languageFallbackInfo;
  }

  setStoredSupportedLanguageOverride(supportedLanguage);
  return syncDetectedLanguage();
}

export async function refreshDetectedLanguage() {
  return syncDetectedLanguage();
}

export default i18n;
