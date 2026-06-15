import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import BPMCalculator from "./components/BPMCalculator";
import SongList from "./components/SongList";
import Player from "./components/Player";
import BrushingGuide from "./components/BrushingGuide";
import WaterFlossingGuide from "./components/WaterFlossingGuide";
import AgeThemePanel from "./components/AgeThemePanel";
import HouseholdSetupPanel from "./components/HouseholdSetupPanel";
import HouseholdOverviewPanel from "./components/HouseholdOverviewPanel";
import HouseholdManagementPanel from "./components/HouseholdManagementPanel";
import AchievementBadgeList from "./components/AchievementBadgeList";
import ProgressDashboardPanel from "./components/ProgressDashboardPanel";
import TranslationWorkshop from "./components/TranslationWorkshop";
import VersionHistory from "./components/VersionHistory";
import MyStoryPage from "./components/MyStoryPage";
import ArtistPromoPage from "./components/ArtistPromoPage";
import { clearPersistedPhase2Data, loadPersistedAppState } from "./db/appStateService";
import { loadHouseholdOverview, switchActiveHouseholdUser } from "./db/householdOverviewService";
import { awardAchievementsForUser } from "./db/achievementEngineService";
import { archiveHouseholdMember, loadHouseholdManagement, removeHouseholdMember, restoreHouseholdMember, saveHouseholdMember, saveHouseholdSettings } from "./db/householdManagementService";
import { initializePhase2Migration } from "./db/migrationService";
import { loadUserProgressDashboard } from "./db/progressDashboardService";
import { getAchievementPresentation } from "./db/rewardProgressionService";
import { completeHouseholdOnboarding, saveHouseholdOnboardingDraft, setHouseholdOnboardingUiDismissed } from "./db/householdSetupService";
import { createBrushingSession, logToothChange, updateUser } from "./db/storeHelpers";
import { getUserScopedState, saveUserScopedDefaults, saveUserScopedFavoriteSongs, saveUserScopedLastSession } from "./db/userScopedStateService";
import { getLanguageFallbackInfo, setPreferredSupportedLanguage } from "./i18n.ts";
import { getGeoCountry, getSongs, getYoutubeVideo } from "./api/client";
import { calculateBpm } from "./lib/bpm";
import { buildReinforcementPool, getAgeMessageGroupCount, pickReinforcementMessage } from "./lib/reinforcementMessages";
import {
  analyticsEnabled,
  getAnalyticsConsentStatus,
  initializeAnalytics,
  setAnalyticsConsent,
  trackEvent
} from "./lib/analytics";
import {
  addFavoriteSong,
  clearFavoriteSongs,
  clearStoredPreferences,
  clearLastSession,
  getStorageConsentStatus,
  isStorageBannerDismissed,
  loadFavoriteSongs,
  loadLastSession,
  loadStoredPreferences,
  removeFavoriteSong,
  saveLastSession,
  saveStoredPreferences,
  setStorageBannerDismissed,
  setStorageConsent
} from "./lib/storagePreference";
import { buildAgeEstimateFromActualAge, buildAgeEstimateFromPhase, estimateAgeFromTeethFull, inferMusicAgeBucket } from "./lib/teethAge";
import { buildAgeUiProfile } from "./lib/ageUiProfile";
import { useDeviceContext } from "./lib/deviceContext";
import { getOverlayThemeOptions, OVERLAY_THEME_AUTO } from "./lib/overlayThemes";
import { buildUserMusicContext } from "./lib/userMusicContext";
import "./App.css";

const DEFAULT_VALUES = { top: 16, bottom: 16 };
const DEFAULT_BRUSH_DURATION_SECONDS = 120;
const BRUSH_DURATION_OPTIONS = [90, 120, 150, 180];
const START_DELAY_SECONDS = 5;
const ROTATING_START_SEGMENT_SEQUENCE = [
  "back-top-left",
  "front-top-left",
  "back-top-right",
  "front-top-right",
  "back-bottom-left",
  "front-bottom-left",
  "back-bottom-right",
  "front-bottom-right"
];
const DEFAULT_AGE_SIMULATION = { active: false, mode: "exact", phase: "primary", value: 2, unit: "years" };
const YOUTUBE_VIDEO_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;

function normalizeYoutubeVideoId(value) {
  const candidate = String(value || "").trim();
  return YOUTUBE_VIDEO_ID_REGEX.test(candidate) ? candidate : null;
}

function buildYoutubeEmbedUrl(videoId) {
  const safeVideoId = normalizeYoutubeVideoId(videoId);
  if (!safeVideoId) {
    return null;
  }

  return `https://www.youtube-nocookie.com/embed/${safeVideoId}?rel=0`;
}

function clampValue(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getMaturityScore(totalTeeth) {
  return clampValue((Number(totalTeeth) - 1) / 31, 0, 1);
}

function createInitialSongPreferences(totalTeeth = DEFAULT_VALUES.top + DEFAULT_VALUES.bottom) {
  const maturityScore = getMaturityScore(totalTeeth);
  const ageEstimate = estimateAgeFromTeethFull(totalTeeth);
  const phaseDefaults = {
    infant: { tolerance: 7, danceabilityBase: 82, acousticnessBase: 18 },
    toddler: { tolerance: 6, danceabilityBase: 78, acousticnessBase: 22 },
    primary: { tolerance: 6, danceabilityBase: 74, acousticnessBase: 26 },
    mixed: { tolerance: 5, danceabilityBase: 62, acousticnessBase: 38 },
    adult: { tolerance: 4, danceabilityBase: 50, acousticnessBase: 54 }
  };
  const phaseConfig = phaseDefaults[ageEstimate?.phase || "adult"];

  return {
    tolerance: phaseConfig.tolerance,
    danceability: clampValue(Math.round(phaseConfig.danceabilityBase + (1 - maturityScore) * 8 + (Math.random() * 20 - 10)), 0, 100),
    acousticness: clampValue(Math.round(phaseConfig.acousticnessBase + maturityScore * 8 + (Math.random() * 20 - 10)), 0, 100)
  };
}

function formatAgeDescription(t, ageEstimate) {
  if (!ageEstimate) {
    return t("age.descriptions.unknownRange");
  }

  if (ageEstimate.simulated && Number.isFinite(Number(ageEstimate.exactAge))) {
    return ageEstimate.unit === "months"
      ? t("age.descriptions.monthExact", { value: ageEstimate.exactAge })
      : t("age.descriptions.yearExact", { value: ageEstimate.exactAge });
  }

  if (ageEstimate.unit === "months") {
    return t("age.descriptions.monthRange", {
      min: ageEstimate.minAge,
      max: ageEstimate.maxAge
    });
  }

  if (ageEstimate.maxAge >= 99) {
    return t("age.descriptions.yearsPlus", {
      min: ageEstimate.minAge
    });
  }

  return t("age.descriptions.yearRange", {
    min: ageEstimate.minAge,
    max: ageEstimate.maxAge
  });
}

function buildLocalizedBrusherProfile(t, totalTeeth, ageEstimate) {
  if (!ageEstimate) {
    return {
      safeTeeth: totalTeeth,
      estimate: null,
      label: t("age.stages.unknown.label"),
      description: t("age.stages.unknown.description")
    };
  }

  let labelKey = `age.stages.${ageEstimate.phase}`;
  if (ageEstimate.phase === "adult") {
    labelKey = totalTeeth >= 29 ? "age.stages.fullAdultSmile" : "age.stages.adultSmile";
  }

  return {
    safeTeeth: totalTeeth,
    estimate: ageEstimate,
    label: t(labelKey),
    description: formatAgeDescription(t, ageEstimate)
  };
}

function normalizeTeethDraftValue(value, fallback) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return fallback;
  }

  return Math.min(16, Math.max(0, Math.round(numericValue)));
}

function buildHouseholdSetupDraft({ household, activeUser, onboardingDraft, userDefaults, migrationState }) {
  const topTeethCount = normalizeTeethDraftValue(
    onboardingDraft?.topTeethCount ?? activeUser?.topTeethCount ?? userDefaults?.values?.top,
    16
  );
  const bottomTeethCount = normalizeTeethDraftValue(
    onboardingDraft?.bottomTeethCount ?? activeUser?.bottomTeethCount ?? userDefaults?.values?.bottom,
    16
  );
  const totalTeethCount = topTeethCount + bottomTeethCount;

  return {
    householdName: onboardingDraft?.householdName || household?.householdName || "BrushBeats Household",
    memberName: onboardingDraft?.memberName || activeUser?.name || "Primary Brusher",
    topTeethCount,
    bottomTeethCount,
    brushingHand: onboardingDraft?.brushingHand || userDefaults?.brushingHand || "right",
    brushType: onboardingDraft?.brushType || userDefaults?.brushType || "manual",
    rotatingStartEnabled: Boolean(onboardingDraft?.rotatingStartEnabled ?? userDefaults?.rotatingStartEnabled ?? false),
    rotatingStartIndex: clampValue(Math.floor(Number(onboardingDraft?.rotatingStartIndex ?? userDefaults?.rotatingStartIndex ?? 0) || 0), 0, ROTATING_START_SEGMENT_SEQUENCE.length - 1),
    overlayTheme: onboardingDraft?.overlayTheme || userDefaults?.overlayTheme || OVERLAY_THEME_AUTO,
    brushDurationSeconds: Number(onboardingDraft?.brushDurationSeconds || userDefaults?.brushDurationSeconds || DEFAULT_BRUSH_DURATION_SECONDS),
    keyword: onboardingDraft?.keyword || userDefaults?.keyword || "",
    filters: onboardingDraft?.filters || userDefaults?.filters || createInitialSongPreferences(totalTeethCount),
    additionalMembers: Array.isArray(onboardingDraft?.additionalMembers) ? onboardingDraft.additionalMembers : [],
    reviewSource: onboardingDraft?.reviewSource || (migrationState?.completedAt ? "migration-review" : "bootstrap")
  };
}

function buildCompletionCelebrationMessage(t, fallbackMessage, unlockedAchievements, dashboard) {
  const highlightedAchievement = Array.isArray(unlockedAchievements) && unlockedAchievements.length > 0
    ? [...unlockedAchievements]
      .map((achievement) => getAchievementPresentation(achievement))
      .sort((left, right) => Number(right.pointsAwarded || 0) - Number(left.pointsAwarded || 0))[0]
    : null;

  if (highlightedAchievement) {
    return t("app.achievements.completionCelebration.unlocked", {
      badge: t(`app.achievements.types.${highlightedAchievement.achievementType}.title`),
      tier: t(`app.achievements.tiers.${highlightedAchievement.tier || "bronze"}`),
      points: highlightedAchievement.pointsAwarded || 0
    });
  }

  if (dashboard?.nextAchievement) {
    if (dashboard.goals?.summary?.allComplete) {
      return t("app.achievements.completionCelebration.goalsComplete", {
        brushing: dashboard.goals.weeklyBrushing.target,
        support: dashboard.goals.weeklySupport.target
      });
    }

    if (dashboard.goals?.summary?.nextFocus) {
      const focusKey = dashboard.goals.summary.nextFocus === "support" ? "weeklySupport" : "weeklyBrushing";
      const focusGoal = dashboard.goals[focusKey];
      return t(`app.achievements.completionCelebration.${focusKey}`, {
        current: focusGoal.current,
        target: focusGoal.target,
        remaining: focusGoal.remaining
      });
    }

    if (dashboard.caregiverNudges?.length > 0) {
      const topNudge = dashboard.caregiverNudges[0];
      if (topNudge.key === "stageTransition") {
        return t("app.achievements.completionCelebration.stageTransition", {
          previousStage: t(`age.stages.${topNudge.values.previousStage}.label`),
          newStage: t(`age.stages.${topNudge.values.newStage}.label`)
        });
      }

      if (topNudge.key === "nextAchievement") {
        return t("app.achievements.completionCelebration.nextAchievement", {
          badge: t(`app.achievements.types.${topNudge.values.achievementType}.title`),
          remaining: topNudge.values.remaining,
          target: topNudge.values.target
        });
      }

      return t(`app.achievements.completionCelebration.${topNudge.key}`, topNudge.values);
    }

    return t("app.achievements.completionCelebration.progress", {
      level: dashboard.progression.currentLevel,
      remainingPoints: dashboard.progression.pointsToNextLevel,
      badge: t(`app.achievements.types.${dashboard.nextAchievement.achievementType}.title`)
    });
  }

  return fallbackMessage;
}

function daysAgoIso(daysAgo) {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString();
}

function mergeStoredDefaults(userDefaults, legacyPreferences) {
  if (!userDefaults && !legacyPreferences) {
    return null;
  }

  const merged = {
    ...(legacyPreferences || {}),
    ...(userDefaults || {})
  };

  merged.values = userDefaults?.values || legacyPreferences?.values || merged.values;
  merged.filters = userDefaults?.filters || legacyPreferences?.filters || merged.filters;
  merged.rotatingStartEnabled = Boolean(
    userDefaults?.rotatingStartEnabled ?? legacyPreferences?.rotatingStartEnabled ?? false
  );
  merged.rotatingStartIndex = clampValue(
    Math.floor(Number(userDefaults?.rotatingStartIndex ?? legacyPreferences?.rotatingStartIndex ?? 0) || 0),
    0,
    ROTATING_START_SEGMENT_SEQUENCE.length - 1
  );

  return merged;
}

function buildMockProgressDashboard(phase = "adult") {
  const presets = {
    infant: {
      totals: { totalSessions: 12, completionRate: 92, streakDays: 4, monthlySessions: 16 },
      progression: { currentLevel: 2, points: 84, nextLevelPoints: 120, pointsToNextLevel: 36, progressPercent: 70 },
      weeklyBrushing: { current: 6, target: 7, remaining: 1, percent: 86, complete: false },
      weeklySupport: { current: 2, target: 3, remaining: 1, percent: 67, complete: false },
      routineCoverage: { current: 2, target: 3, missingTypes: ["water-picking"] },
      tierCounts: { bronze: 2, silver: 1, gold: 0 },
      momentum: "starting",
      nextAchievement: { achievementType: "routine-mix", progress: { measure: "distinctRoutineTypes", remaining: 1, target: 3 } },
      caregiverNudges: [
        { key: "weeklyBrushing", priority: 1, values: { remaining: 1, target: 7, current: 6 } },
        { key: "nextAchievement", priority: 2, values: { achievementType: "routine-mix", remaining: 1, target: 3 } }
      ],
      achievements: [
        { achievementId: "preview-first", achievementType: "first-session", tier: "bronze", pointsAwarded: 15 },
        { achievementId: "preview-streak3", achievementType: "streak-3", tier: "silver", pointsAwarded: 40 }
      ],
      toothMilestones: [
        { toothHistoryId: "preview-m1", label: "tooth-added", recordedAt: daysAgoIso(8), newToothStage: "infant" },
        { toothHistoryId: "preview-m2", label: "manual-adjustment", recordedAt: daysAgoIso(21), newToothStage: "infant" }
      ]
    },
    toddler: {
      totals: { totalSessions: 26, completionRate: 94, streakDays: 7, monthlySessions: 20 },
      progression: { currentLevel: 4, points: 176, nextLevelPoints: 220, pointsToNextLevel: 44, progressPercent: 80 },
      weeklyBrushing: { current: 8, target: 8, remaining: 0, percent: 100, complete: true },
      weeklySupport: { current: 2, target: 3, remaining: 1, percent: 67, complete: false },
      routineCoverage: { current: 2, target: 3, missingTypes: ["water-picking"] },
      tierCounts: { bronze: 3, silver: 2, gold: 1 },
      momentum: "building",
      nextAchievement: { achievementType: "stage-transition", progress: { measure: "stageTransitions", remaining: 1, target: 1 } },
      caregiverNudges: [
        { key: "weeklySupport", priority: 1, values: { remaining: 1, target: 3, current: 2 } },
        { key: "stageTransition", priority: 2, values: { previousStage: "infant", newStage: "toddler" } }
      ],
      achievements: [
        { achievementId: "preview-first", achievementType: "first-session", tier: "bronze", pointsAwarded: 15 },
        { achievementId: "preview-routine-mix", achievementType: "routine-mix", tier: "silver", pointsAwarded: 45 },
        { achievementId: "preview-stage", achievementType: "stage-transition", tier: "gold", pointsAwarded: 90 }
      ],
      toothMilestones: [
        { toothHistoryId: "preview-m1", label: "stage-changed", recordedAt: daysAgoIso(6), previousToothStage: "infant", newToothStage: "toddler" },
        { toothHistoryId: "preview-m2", label: "tooth-added", recordedAt: daysAgoIso(18), newToothStage: "toddler" }
      ]
    },
    primary: {
      totals: { totalSessions: 39, completionRate: 91, streakDays: 9, monthlySessions: 24 },
      progression: { currentLevel: 5, points: 258, nextLevelPoints: 320, pointsToNextLevel: 62, progressPercent: 81 },
      weeklyBrushing: { current: 9, target: 10, remaining: 1, percent: 90, complete: false },
      weeklySupport: { current: 3, target: 3, remaining: 0, percent: 100, complete: true },
      routineCoverage: { current: 3, target: 3, missingTypes: [] },
      tierCounts: { bronze: 3, silver: 3, gold: 1 },
      momentum: "building",
      nextAchievement: { achievementType: "ten-sessions", progress: { measure: "completedSessions", remaining: 1, target: 10 } },
      caregiverNudges: [
        { key: "weeklyBrushing", priority: 1, values: { remaining: 1, target: 10, current: 9 } },
        { key: "nextAchievement", priority: 2, values: { achievementType: "ten-sessions", remaining: 1, target: 10 } }
      ],
      achievements: [
        { achievementId: "preview-streak7", achievementType: "streak-7", tier: "silver", pointsAwarded: 70 },
        { achievementId: "preview-ten", achievementType: "ten-sessions", tier: "silver", pointsAwarded: 60 }
      ],
      toothMilestones: [
        { toothHistoryId: "preview-m1", label: "tooth-added", recordedAt: daysAgoIso(9), newToothStage: "primary" },
        { toothHistoryId: "preview-m2", label: "manual-adjustment", recordedAt: daysAgoIso(28), newToothStage: "primary" }
      ]
    },
    mixed: {
      totals: { totalSessions: 48, completionRate: 89, streakDays: 11, monthlySessions: 28 },
      progression: { currentLevel: 6, points: 344, nextLevelPoints: 420, pointsToNextLevel: 76, progressPercent: 82 },
      weeklyBrushing: { current: 10, target: 10, remaining: 0, percent: 100, complete: true },
      weeklySupport: { current: 4, target: 4, remaining: 0, percent: 100, complete: true },
      routineCoverage: { current: 3, target: 3, missingTypes: [] },
      tierCounts: { bronze: 3, silver: 3, gold: 2 },
      momentum: "strong",
      nextAchievement: { achievementType: "twenty-sessions", progress: { measure: "completedSessions", remaining: 2, target: 20 } },
      caregiverNudges: [
        { key: "goalsComplete", priority: 0, values: { brushing: 10, support: 4 } },
        { key: "nextAchievement", priority: 1, values: { achievementType: "twenty-sessions", remaining: 2, target: 20 } }
      ],
      achievements: [
        { achievementId: "preview-streak7", achievementType: "streak-7", tier: "silver", pointsAwarded: 70 },
        { achievementId: "preview-routine-mix", achievementType: "routine-mix", tier: "gold", pointsAwarded: 90 },
        { achievementId: "preview-stage", achievementType: "stage-transition", tier: "gold", pointsAwarded: 100 }
      ],
      toothMilestones: [
        { toothHistoryId: "preview-m1", label: "stage-changed", recordedAt: daysAgoIso(12), previousToothStage: "primary", newToothStage: "mixed" },
        { toothHistoryId: "preview-m2", label: "tooth-added", recordedAt: daysAgoIso(24), newToothStage: "mixed" }
      ]
    },
    adult: {
      totals: { totalSessions: 62, completionRate: 93, streakDays: 15, monthlySessions: 31 },
      progression: { currentLevel: 8, points: 512, nextLevelPoints: 620, pointsToNextLevel: 108, progressPercent: 83 },
      weeklyBrushing: { current: 10, target: 10, remaining: 0, percent: 100, complete: true },
      weeklySupport: { current: 3, target: 4, remaining: 1, percent: 75, complete: false },
      routineCoverage: { current: 2, target: 3, missingTypes: ["water-picking"] },
      tierCounts: { bronze: 3, silver: 4, gold: 3 },
      momentum: "strong",
      nextAchievement: { achievementType: "twenty-sessions", progress: { measure: "completedSessions", remaining: 1, target: 20 } },
      caregiverNudges: [
        { key: "weeklySupport", priority: 1, values: { remaining: 1, target: 4, current: 3 } },
        { key: "nextAchievement", priority: 2, values: { achievementType: "twenty-sessions", remaining: 1, target: 20 } }
      ],
      achievements: [
        { achievementId: "preview-ten", achievementType: "ten-sessions", tier: "silver", pointsAwarded: 60 },
        { achievementId: "preview-twenty", achievementType: "twenty-sessions", tier: "gold", pointsAwarded: 110 },
        { achievementId: "preview-stage", achievementType: "stage-transition", tier: "gold", pointsAwarded: 100 }
      ],
      toothMilestones: [
        { toothHistoryId: "preview-m1", label: "stage-changed", recordedAt: daysAgoIso(16), previousToothStage: "mixed", newToothStage: "adult" },
        { toothHistoryId: "preview-m2", label: "manual-adjustment", recordedAt: daysAgoIso(31), newToothStage: "adult" }
      ]
    }
  };

  const preset = presets[phase] || presets.adult;

  return {
    totals: preset.totals,
    progression: {
      ...preset.progression,
      pointsBreakdown: [
        { key: "brushing", points: Math.round(preset.progression.points * 0.34) },
        { key: "support", points: Math.round(preset.progression.points * 0.18) },
        { key: "milestones", points: Math.round(preset.progression.points * 0.16) },
        { key: "variety", points: Math.round(preset.progression.points * 0.12) },
        { key: "achievements", points: Math.round(preset.progression.points * 0.2) }
      ]
    },
    goals: {
      weeklyBrushing: preset.weeklyBrushing,
      weeklySupport: preset.weeklySupport
    },
    nextAchievement: preset.nextAchievement,
    caregiverSummary: {
      routineCoverage: preset.routineCoverage,
      tierCounts: preset.tierCounts,
      momentum: preset.momentum
    },
    caregiverNudges: preset.caregiverNudges,
    recentAchievements: preset.achievements,
    recentSessions: [
      { sessionId: `${phase}-s1`, sessionType: "brushing", songTitle: "Dance Around the Sink", completedAt: daysAgoIso(1), targetDurationSeconds: 120 },
      { sessionId: `${phase}-s2`, sessionType: "flossing", completedAt: daysAgoIso(3), targetDurationSeconds: 90 },
      { sessionId: `${phase}-s3`, sessionType: "water-picking", completedAt: daysAgoIso(5), targetDurationSeconds: 60 }
    ],
    toothMilestones: preset.toothMilestones
  };
}

function App() {
  const { t, i18n } = useTranslation();
  const ageSimulationAvailable = true;
  const [dbStatus, setDbStatus] = useState(() => {
    if (typeof window === "undefined") {
      return { ready: false, mode: "legacy-storage-fallback" };
    }

    return window.__brushbeatsDbStatus || { ready: false, mode: "legacy-storage-fallback" };
  });
  const [migrationNotice, setMigrationNotice] = useState(() => {
    if (typeof window === "undefined") {
      return null;
    }

    return window.__brushbeatsMigrationStatus || null;
  });
  const [appView, setAppView] = useState(() => {
    if (typeof window === "undefined") {
      return "brush";
    }

    const mode = new URLSearchParams(window.location.search).get("mode");
    return mode === "workshop" || mode === "history" || mode === "artists" ? mode : "brush";
  });
  const [values, setValues] = useState(DEFAULT_VALUES);
  const [bpmData, setBpmData] = useState(null);
  const [songs, setSongs] = useState([]);
  const [selectedSong, setSelectedSong] = useState(null);
  const [playerData, setPlayerData] = useState(null);
  const [songFilters, setSongFilters] = useState(() => createInitialSongPreferences(DEFAULT_VALUES.top + DEFAULT_VALUES.bottom));
  const [draftSongFilters, setDraftSongFilters] = useState(songFilters);
  const [keyword, setKeyword] = useState("");
  const [songRefreshSeed, setSongRefreshSeed] = useState(0);
  const [timer, setTimer] = useState({ running: false, remaining: DEFAULT_BRUSH_DURATION_SECONDS });
  const [brushingPhase, setBrushingPhase] = useState("idle");
  const [playbackSeconds, setPlaybackSeconds] = useState(0);
  const [songDurationSeconds, setSongDurationSeconds] = useState(0);
  const [brushingMusicElapsedSeconds, setBrushingMusicElapsedSeconds] = useState(0);
  const [countdownRemainingMs, setCountdownRemainingMs] = useState(0);
  const [autoplayToken, setAutoplayToken] = useState(0);
  const [isSongPoolExhausted, setIsSongPoolExhausted] = useState(false);
  const [loading, setLoading] = useState({ bpm: false, songs: false, player: false });
  const [backendStatus, setBackendStatus] = useState("");
  const [error, setError] = useState("");
  const [analyticsConsent, setAnalyticsConsentState] = useState(() => getAnalyticsConsentStatus());
  const [storageConsent, setStorageConsentState] = useState(() => getStorageConsentStatus());
  const [storageBannerDismissed, setStorageBannerDismissedState] = useState(() => isStorageBannerDismissed());
  const [lastSession, setLastSession] = useState(null);
  const [languageFallbackState, setLanguageFallbackState] = useState(() => getLanguageFallbackInfo());
  const [activeModal, setActiveModal] = useState(null);
  const [storageToggleRequest, setStorageToggleRequest] = useState(null);
  const [storageToggleNotice, setStorageToggleNotice] = useState("");
  const [workflowStep, setWorkflowStep] = useState("teeth");
  const [brushingHand, setBrushingHand] = useState("right");
  const [brushType, setBrushType] = useState("manual");
  const [overlayThemeChoice, setOverlayThemeChoice] = useState(OVERLAY_THEME_AUTO);
  const [expandedRoutineCard, setExpandedRoutineCard] = useState(null);
  const [brushDurationSeconds, setBrushDurationSeconds] = useState(DEFAULT_BRUSH_DURATION_SECONDS);
  const [rotatingStartEnabled, setRotatingStartEnabled] = useState(false);
  const [rotatingStartIndex, setRotatingStartIndex] = useState(0);
  const [rotatingStartPersistStatus, setRotatingStartPersistStatus] = useState("idle");
  const [sessionStartSegmentKey, setSessionStartSegmentKey] = useState(null);
  const [brushControlCue, setBrushControlCue] = useState(null);
  const [queuedSongPreview, setQueuedSongPreview] = useState(null);
  const [playerCommand, setPlayerCommand] = useState({ type: "idle", nonce: 0 });
  const [autoRestoredBrushView, setAutoRestoredBrushView] = useState(false);
  const [geoCountry, setGeoCountry] = useState(null);
  const [completionMessage, setCompletionMessage] = useState("");
  const [songsDebugInfo, setSongsDebugInfo] = useState(null);
  const [favoriteSongs, setFavoriteSongs] = useState([]);
  const [householdProfile, setHouseholdProfile] = useState(null);
  const [activeHouseholdUser, setActiveHouseholdUser] = useState(null);
  const [householdOverview, setHouseholdOverview] = useState(null);
  const [householdManagement, setHouseholdManagement] = useState(null);
  const [householdManagementSaving, setHouseholdManagementSaving] = useState(false);
  const [householdManagementNotice, setHouseholdManagementNotice] = useState("");
  const [progressDashboard, setProgressDashboard] = useState(null);
  const [recentUnlockedAchievements, setRecentUnlockedAchievements] = useState([]);
  const [progressDashboardFilters, setProgressDashboardFilters] = useState({ timeRange: "30d", activityType: "all" });
  const [persistedMigrationState, setPersistedMigrationState] = useState(null);
  const [householdOnboardingState, setHouseholdOnboardingState] = useState(null);
  const [householdOnboardingUiState, setHouseholdOnboardingUiState] = useState(null);
  const [householdSetupDraft, setHouseholdSetupDraft] = useState(null);
  const [householdSetupSaving, setHouseholdSetupSaving] = useState(false);
  const [persistedStateRevision, setPersistedStateRevision] = useState(0);
  const [queuedStoredSongKey, setQueuedStoredSongKey] = useState("");
  const [ageSimulation, setAgeSimulation] = useState(() => {
    if (typeof window === "undefined") {
      return DEFAULT_AGE_SIMULATION;
    }

    const params = new URLSearchParams(window.location.search);
    const unit = params.get("simAgeUnit") === "months" ? "months" : "years";
    const rawValue = Number(params.get("simAge"));
    const mode = params.get("simAgeMode") === "phase" ? "phase" : "exact";
    const phase = ["infant", "toddler", "primary", "mixed", "adult"].includes(params.get("simAgePhase"))
      ? params.get("simAgePhase")
      : DEFAULT_AGE_SIMULATION.phase;

    return {
      active: params.get("simulateAge") === "1",
      mode,
      phase,
      value: Number.isFinite(rawValue) ? rawValue : DEFAULT_AGE_SIMULATION.value,
      unit
    };
  });
  const [showAgeExperienceLab, setShowAgeExperienceLab] = useState(() => ageSimulation.active);
  const seenSongsByQueryRef = useRef(new Map());
  const playedSongsRef = useRef(new Set());
  const queuedSongRef = useRef(null);
  const brushMapSectionRef = useRef(null);
  const lastPlaybackTickRef = useRef(null);
  const playbackSecondsRef = useRef(0);
  const countdownDeadlineRef = useRef(null);
  const playOnCountdownEndRef = useRef(false);
  const compactRoutineRef = useRef(storageBannerDismissed || storageConsent !== "unknown");
  const preferencesHydratedRef = useRef(false);
  const repeatSessionBootstrapRef = useRef(false);
  const restoredSessionRef = useRef(null);
  const latestVideoLookupRef = useRef(0);
  const lastCompletionMessageRef = useRef("");
  const trackedMigrationNoticeRef = useRef(null);
  const selectSongWithOptionsRef = useRef(null);
  const sessionStartedAtRef = useRef(null);
  const loggedCompletedSessionRef = useRef(null);
  const previousTrackedTeethRef = useRef(null);
  const appliedSharedVideoRef = useRef("");
  const lastRotatingPersistedRef = useRef({ enabled: false, index: 0 });
  const analyticsAvailable = useMemo(() => analyticsEnabled(), []);
  const device = useDeviceContext();
  const totalTeeth = values.top + values.bottom;
  const toothAgeEstimate = bpmData?.ageEstimate || estimateAgeFromTeethFull(totalTeeth);
  const simulatedAgeEstimate = useMemo(
    () => ageSimulationAvailable && ageSimulation.active
      ? ageSimulation.mode === "phase"
        ? buildAgeEstimateFromPhase(ageSimulation.phase)
        : buildAgeEstimateFromActualAge(ageSimulation.value, ageSimulation.unit)
      : null,
    [ageSimulation.active, ageSimulation.mode, ageSimulation.phase, ageSimulation.unit, ageSimulation.value, ageSimulationAvailable]
  );
  const effectiveAgeEstimate = simulatedAgeEstimate || toothAgeEstimate;
  const detectedBrusherProfile = useMemo(
    () => buildLocalizedBrusherProfile(t, totalTeeth, effectiveAgeEstimate),
    [effectiveAgeEstimate, t, totalTeeth]
  );
  const actualBrusherProfile = useMemo(
    () => buildLocalizedBrusherProfile(t, totalTeeth, toothAgeEstimate),
    [t, toothAgeEstimate, totalTeeth]
  );
  const ageUiProfile = useMemo(
    () => buildAgeUiProfile(t, effectiveAgeEstimate, {
      stageLabel: detectedBrusherProfile.label,
      ageText: formatAgeDescription(t, effectiveAgeEstimate),
      simulated: ageSimulation.active,
      overlayTheme: overlayThemeChoice
    }),
    [ageSimulation.active, detectedBrusherProfile.label, effectiveAgeEstimate, overlayThemeChoice, t]
  );
  const overlayThemeOptions = useMemo(
    () => getOverlayThemeOptions(ageUiProfile.phase),
    [ageUiProfile.phase]
  );
  const simulationPreviewDashboard = useMemo(
    () => ageSimulation.active ? buildMockProgressDashboard(effectiveAgeEstimate?.phase || "adult") : null,
    [ageSimulation.active, effectiveAgeEstimate?.phase]
  );
  const selectedBrushBpm = Number(selectedSong?.bpm || bpmData?.searchBpm || 120);
  const supportedLanguageOptions = useMemo(
    () => [
      { value: "en", label: t("settings.supportedLanguage.options.english") },
      { value: "es", label: t("settings.supportedLanguage.options.spanish") },
      { value: "tr", label: t("settings.supportedLanguage.options.turkish") }
    ],
    [t]
  );
  const workshopInitialLanguage = useMemo(() => {
    if (i18n.resolvedLanguage && i18n.resolvedLanguage !== "en") {
      return i18n.resolvedLanguage;
    }

    return supportedLanguageOptions.find((option) => option.value !== "en")?.value || "es";
  }, [i18n.resolvedLanguage, supportedLanguageOptions]);
  const isReturningVisitor = compactRoutineRef.current;
  const [isRoutineExpanded, setIsRoutineExpanded] = useState(!isReturningVisitor);
  const showCompactRoutine = isReturningVisitor && !isRoutineExpanded;
  const reinforcementPool = useMemo(
    () => buildReinforcementPool(effectiveAgeEstimate?.phase, totalTeeth, brushType),
    [effectiveAgeEstimate?.phase, brushType, totalTeeth]
  );
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const url = new URL(window.location.href);

    if (ageSimulation.active) {
      url.searchParams.set("simulateAge", "1");
      url.searchParams.set("simAgeMode", ageSimulation.mode);
      url.searchParams.set("simAgePhase", ageSimulation.phase);
      url.searchParams.set("simAge", String(ageSimulation.value));
      url.searchParams.set("simAgeUnit", ageSimulation.unit);
    } else {
      url.searchParams.delete("simulateAge");
      url.searchParams.delete("simAgeMode");
      url.searchParams.delete("simAgePhase");
      url.searchParams.delete("simAge");
      url.searchParams.delete("simAgeUnit");
    }

    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }, [ageSimulation.active, ageSimulation.mode, ageSimulation.phase, ageSimulation.unit, ageSimulation.value]);

  const ageGroupCount = getAgeMessageGroupCount();
  const completionBannerMessage = useMemo(
    () => buildCompletionCelebrationMessage(t, completionMessage || t("app.success", { duration: formatTime(Number(bpmData?.totalBrushingSeconds || brushDurationSeconds)) }), recentUnlockedAchievements, progressDashboard),
    [bpmData?.totalBrushingSeconds, brushDurationSeconds, completionMessage, progressDashboard, recentUnlockedAchievements, t]
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    function handleDbStatus(event) {
      setDbStatus(event.detail || { ready: false, mode: "legacy-storage-fallback" });
    }

    function handleMigrationStatus(event) {
      setMigrationNotice(event.detail || null);
    }

    window.addEventListener("brushbeats:db-status", handleDbStatus);
    window.addEventListener("brushbeats:migration-status", handleMigrationStatus);
    return () => {
      window.removeEventListener("brushbeats:db-status", handleDbStatus);
      window.removeEventListener("brushbeats:migration-status", handleMigrationStatus);
    };
  }, []);

  useEffect(() => {
    if (!migrationNotice?.kind || trackedMigrationNoticeRef.current === migrationNotice.kind) {
      return;
    }

    trackedMigrationNoticeRef.current = migrationNotice.kind;
    trackEvent("phase2_migration_status", {
      result: migrationNotice.kind,
      has_error: migrationNotice.kind === "migration-failed"
    });
  }, [migrationNotice]);

  useEffect(() => {
    let isMounted = true;

    async function fetchGeoCountry() {
      try {
        const response = await getGeoCountry();
        if (isMounted) {
          setGeoCountry(response);
        }
      } catch (err) {
        if (isMounted) {
          setGeoCountry({
            ok: false,
            ip: "unknown",
            country: "Unknown",
            countryCode: "--",
            source: "error",
            detail: err?.message || "lookup failed"
          });
        }
      }
    }

    void fetchGeoCountry();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (brushingPhase !== "complete") {
      return;
    }

    const nextMessage = pickReinforcementMessage(reinforcementPool, lastCompletionMessageRef.current);
    lastCompletionMessageRef.current = nextMessage;
    setCompletionMessage(nextMessage);
  }, [brushingPhase, reinforcementPool]);

  useEffect(() => {
    if (device.isMobile && appView === "workshop") {
      setAppView("brush");
    }
  }, [appView, device.isMobile]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const url = new URL(window.location.href);

    if (!device.isMobile && appView === "workshop") {
      url.searchParams.set("mode", "workshop");
    } else if (appView === "history" || appView === "artists") {
      url.searchParams.set("mode", appView);
    } else {
      url.searchParams.delete("mode");
    }

    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }, [appView, device.isMobile]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (appView === "story" || appView === "history" || appView === "artists" || (appView === "workshop" && !device.isMobile)) {
      window.scrollTo({ top: 0, behavior: "auto" });
    }
  }, [appView, device.isMobile]);

  useEffect(() => {
    if (!storageToggleNotice) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setStorageToggleNotice("");
    }, 7000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [storageToggleNotice]);

  useEffect(() => {
    setLanguageFallbackState(getLanguageFallbackInfo());
  }, [i18n.language, i18n.resolvedLanguage]);

  useEffect(() => {
    playbackSecondsRef.current = playbackSeconds;
  }, [playbackSeconds]);

  useEffect(() => {
    if (isReturningVisitor && workflowStep === "brush") {
      setIsRoutineExpanded(false);
    }
  }, [isReturningVisitor, workflowStep]);

  function applySavedSession(session) {
    if (!session) {
      return;
    }

    const nextValues = {
      top: Number(session.values?.top ?? session.topTeethCount ?? DEFAULT_VALUES.top),
      bottom: Number(session.values?.bottom ?? session.bottomTeethCount ?? DEFAULT_VALUES.bottom)
    };
    const nextFilters = session.filters && Number.isFinite(Number(session.filters.tolerance))
      ? session.filters
      : createInitialSongPreferences(nextValues.top + nextValues.bottom);

    setValues(nextValues);
    setSongFilters(nextFilters);
    setDraftSongFilters(nextFilters);
    setKeyword(session.keyword || "");
    setBrushingHand(session.brushingHand || "right");
    setBrushType(session.brushType || "manual");
    const nextRotatingStartEnabled = Boolean(session.rotatingStartEnabled);
    const nextRotatingStartIndex = clampValue(Math.floor(Number(session.rotatingStartIndex) || 0), 0, ROTATING_START_SEGMENT_SEQUENCE.length - 1);
    setRotatingStartEnabled(nextRotatingStartEnabled);
    setRotatingStartIndex(nextRotatingStartIndex);
    lastRotatingPersistedRef.current = { enabled: nextRotatingStartEnabled, index: nextRotatingStartIndex };
    setOverlayThemeChoice(session.overlayTheme || OVERLAY_THEME_AUTO);
    setBrushDurationSeconds(session.brushDurationSeconds || DEFAULT_BRUSH_DURATION_SECONDS);
  }

  function handleRotatingStartEnabledChange(nextEnabled) {
    setRotatingStartEnabled(Boolean(nextEnabled));

    if (storageConsent !== "granted") {
      setRotatingStartPersistStatus("storage-off");
      return;
    }

    setRotatingStartPersistStatus("saving");
  }

  useEffect(() => {
    if (analyticsConsent === "granted") {
      initializeAnalytics();
    }
  }, [analyticsConsent]);

  function handleAcceptAnalytics() {
    const nextStatus = setAnalyticsConsent(true);
    setAnalyticsConsentState(nextStatus);
    initializeAnalytics();
  }

  function handleDeclineAnalytics() {
    const nextStatus = setAnalyticsConsent(false);
    setAnalyticsConsentState(nextStatus);
  }

  useEffect(() => {
    let cancelled = false;

    async function hydratePersistedState() {
      if (storageConsent === "granted") {
        const fallbackState = {
          storageConsent,
          storageBannerDismissed,
          preferences: loadStoredPreferences(),
          lastSession: loadLastSession(),
          favoriteSongs: loadFavoriteSongs()
        };
        const persistedState = dbStatus.ready
          ? await loadPersistedAppState(fallbackState)
          : {
              ...fallbackState,
              household: null,
              activeUser: null,
              migrationState: null,
              onboardingState: null,
              onboardingDraft: null,
              userDefaults: null
            };

        const scopedState = dbStatus.ready && persistedState.activeUser?.userId
          ? await getUserScopedState(persistedState.activeUser.userId, {
              defaults: mergeStoredDefaults(persistedState.userDefaults, persistedState.preferences),
              lastSession: persistedState.lastSession,
              favoriteSongs: persistedState.favoriteSongs || []
            })
          : {
              defaults: mergeStoredDefaults(persistedState.userDefaults, persistedState.preferences),
              lastSession: persistedState.lastSession,
              favoriteSongs: persistedState.favoriteSongs || []
            };

        const overview = dbStatus.ready && persistedState.household?.householdId
          ? await loadHouseholdOverview(persistedState.household.householdId)
          : null;

        if (cancelled) {
          return;
        }

        if (persistedState.storageConsent && persistedState.storageConsent !== storageConsent) {
          setStorageConsentState(persistedState.storageConsent);
        }

        if (typeof persistedState.storageBannerDismissed === "boolean" && persistedState.storageBannerDismissed !== storageBannerDismissed) {
          setStorageBannerDismissedState(persistedState.storageBannerDismissed);
        }

        const savedPreferences = scopedState.defaults;
        const savedSession = scopedState.lastSession;
        const savedFavorites = scopedState.favoriteSongs || [];

        if (savedPreferences) {
          applySavedSession(savedPreferences);
        } else if (savedSession) {
          applySavedSession(savedSession);
        }

        restoredSessionRef.current = savedSession;
        setBpmData(savedSession?.bpmSnapshot || null);
        setLastSession(savedSession);
        setFavoriteSongs(savedFavorites);
        setHouseholdProfile(persistedState.household || null);
        setActiveHouseholdUser(persistedState.activeUser || null);
        setHouseholdOverview(overview);
        setProgressDashboard(
          dbStatus.ready && persistedState.activeUser?.userId
            ? await loadUserProgressDashboard(persistedState.activeUser.userId, progressDashboardFilters, persistedState.household?.rewardSettings, persistedState.household?.goalSettings)
            : null
        );
        setPersistedMigrationState(persistedState.migrationState || null);
        setHouseholdOnboardingState(persistedState.onboardingState || null);
        setHouseholdOnboardingUiState(persistedState.onboardingUiState || null);
        setHouseholdSetupDraft(
          persistedState.household?.householdId && !persistedState.onboardingState?.completedAt
            ? buildHouseholdSetupDraft({
                household: persistedState.household,
                activeUser: persistedState.activeUser,
                onboardingDraft: persistedState.onboardingDraft,
                userDefaults: mergeStoredDefaults(persistedState.userDefaults, persistedState.preferences),
                migrationState: persistedState.migrationState
              })
            : null
        );
        preferencesHydratedRef.current = true;
        return;
      }

      if (storageConsent === "denied") {
        clearStoredPreferences();
        clearLastSession();
      }

      preferencesHydratedRef.current = false;
      repeatSessionBootstrapRef.current = false;
      restoredSessionRef.current = null;
      setLastSession(null);
      setFavoriteSongs([]);
      setBpmData(null);
      setAutoRestoredBrushView(false);
      setHouseholdProfile(null);
      setActiveHouseholdUser(null);
      setHouseholdOverview(null);
      setProgressDashboard(null);
      setRecentUnlockedAchievements([]);
      setPersistedMigrationState(null);
      setHouseholdOnboardingState(null);
      setHouseholdOnboardingUiState(null);
      setHouseholdSetupDraft(null);
    }

    void hydratePersistedState();
    return () => {
      cancelled = true;
    };
  }, [dbStatus.ready, persistedStateRevision, progressDashboardFilters, storageBannerDismissed, storageConsent]);

  useEffect(() => {
    if (
      storageConsent !== "granted" ||
      !dbStatus.ready ||
      !householdProfile?.householdId ||
      !householdSetupDraft ||
      householdOnboardingState?.completedAt
    ) {
      return;
    }

    void saveHouseholdOnboardingDraft(householdSetupDraft);
  }, [dbStatus.ready, householdOnboardingState?.completedAt, householdProfile?.householdId, householdSetupDraft, storageConsent]);

  useEffect(() => {
    let cancelled = false;

    async function refreshHouseholdOverview() {
      if (storageConsent !== "granted" || !dbStatus.ready || !householdProfile?.householdId) {
        setHouseholdOverview(null);
        return;
      }

      const overview = await loadHouseholdOverview(householdProfile.householdId);
      if (!cancelled) {
        setHouseholdOverview(overview);
      }
    }

    void refreshHouseholdOverview();
    return () => {
      cancelled = true;
    };
  }, [dbStatus.ready, householdProfile?.householdId, persistedStateRevision, storageConsent]);

  useEffect(() => {
    let cancelled = false;

    async function refreshHouseholdManagement() {
      if (storageConsent !== "granted" || !dbStatus.ready || !householdProfile?.householdId) {
        setHouseholdManagement(null);
        return;
      }

      const management = await loadHouseholdManagement(householdProfile.householdId);
      if (!cancelled) {
        setHouseholdManagement(management);
      }
    }

    void refreshHouseholdManagement();
    return () => {
      cancelled = true;
    };
  }, [dbStatus.ready, householdProfile?.householdId, persistedStateRevision, storageConsent]);

  useEffect(() => {
    let cancelled = false;

    async function refreshProgressDashboard() {
      if (storageConsent !== "granted" || !dbStatus.ready || !activeHouseholdUser?.userId || !householdOnboardingState?.completedAt) {
        setProgressDashboard(null);
        return;
      }

      const dashboard = await loadUserProgressDashboard(activeHouseholdUser.userId, progressDashboardFilters, householdProfile?.rewardSettings, householdProfile?.goalSettings);
      if (!cancelled) {
        setProgressDashboard(dashboard);
      }
    }

    void refreshProgressDashboard();
    return () => {
      cancelled = true;
    };
  }, [activeHouseholdUser?.userId, dbStatus.ready, householdOnboardingState?.completedAt, householdProfile?.goalSettings, householdProfile?.rewardSettings, persistedStateRevision, progressDashboardFilters, storageConsent]);

  useEffect(() => {
    if (!activeHouseholdUser?.userId) {
      previousTrackedTeethRef.current = null;
      return;
    }

    previousTrackedTeethRef.current = {
      userId: activeHouseholdUser.userId,
      top: Number(activeHouseholdUser.topTeethCount ?? values.top ?? 0),
      bottom: Number(activeHouseholdUser.bottomTeethCount ?? values.bottom ?? 0),
      stage: activeHouseholdUser.toothStage || toothAgeEstimate?.phase || "unknown"
    };
  }, [activeHouseholdUser?.bottomTeethCount, activeHouseholdUser?.topTeethCount, activeHouseholdUser?.toothStage, activeHouseholdUser?.userId, toothAgeEstimate?.phase, values.bottom, values.top]);

  useEffect(() => {
    const nextSnapshot = {
      userId: activeHouseholdUser?.userId || null,
      top: Number(values.top || 0),
      bottom: Number(values.bottom || 0),
      stage: toothAgeEstimate?.phase || "unknown"
    };

    if (
      storageConsent !== "granted" ||
      !dbStatus.ready ||
      !householdOnboardingState?.completedAt ||
      !activeHouseholdUser?.userId ||
      !preferencesHydratedRef.current
    ) {
      previousTrackedTeethRef.current = nextSnapshot;
      return;
    }

    const previousSnapshot = previousTrackedTeethRef.current;
    if (!previousSnapshot || previousSnapshot.userId !== nextSnapshot.userId) {
      previousTrackedTeethRef.current = nextSnapshot;
      return;
    }

    if (
      previousSnapshot.top === nextSnapshot.top &&
      previousSnapshot.bottom === nextSnapshot.bottom &&
      previousSnapshot.stage === nextSnapshot.stage
    ) {
      return;
    }

    const nextTotal = nextSnapshot.top + nextSnapshot.bottom;
    const previousTotal = previousSnapshot.top + previousSnapshot.bottom;
    const eventType = nextTotal > previousTotal
      ? "tooth-added"
      : nextTotal < previousTotal
        ? "tooth-lost"
        : previousSnapshot.stage !== nextSnapshot.stage
          ? "stage-changed"
          : "manual-adjustment";

    previousTrackedTeethRef.current = nextSnapshot;

    void (async () => {
      const updatedUser = await updateUser(activeHouseholdUser.userId, {
        topTeethCount: nextSnapshot.top,
        bottomTeethCount: nextSnapshot.bottom,
        totalTeethCount: nextTotal,
        toothStage: nextSnapshot.stage
      });
      setActiveHouseholdUser(updatedUser);
      const toothHistoryRecord = await logToothChange({
        userId: activeHouseholdUser.userId,
        householdId: householdProfile?.householdId,
        eventType,
        previousTopTeethCount: previousSnapshot.top,
        previousBottomTeethCount: previousSnapshot.bottom,
        newTopTeethCount: nextSnapshot.top,
        newBottomTeethCount: nextSnapshot.bottom,
        previousToothStage: previousSnapshot.stage,
        newToothStage: nextSnapshot.stage,
        reason: "phase3-progress-tracking"
      });
      const unlockedAchievements = await awardAchievementsForUser(activeHouseholdUser.userId, householdProfile?.householdId, {
        sourceEventType: eventType,
        sourceEventId: toothHistoryRecord.toothHistoryId,
        sourceEventAt: toothHistoryRecord.recordedAt,
        sourceContext: {
          previousStage: previousSnapshot.stage,
          newStage: nextSnapshot.stage
        }
      });
      if (unlockedAchievements.length > 0) {
        setRecentUnlockedAchievements((current) => [...unlockedAchievements, ...current].slice(0, 4));
      }
      setProgressDashboard(await loadUserProgressDashboard(activeHouseholdUser.userId, progressDashboardFilters, householdProfile?.rewardSettings, householdProfile?.goalSettings));
      setPersistedStateRevision((current) => current + 1);
    })().catch((trackingError) => {
      setError(trackingError?.message || t("app.householdSetup.saveFailed"));
    });
  }, [activeHouseholdUser?.userId, toothAgeEstimate?.phase, dbStatus.ready, householdOnboardingState?.completedAt, householdProfile?.goalSettings, householdProfile?.householdId, householdProfile?.rewardSettings, progressDashboardFilters, storageConsent, t, values.bottom, values.top]);

  useEffect(() => {
    if (storageConsent !== "granted" || !preferencesHydratedRef.current) {
      setRotatingStartPersistStatus(storageConsent === "granted" ? "idle" : "storage-off");
      return;
    }

    const rotatingChanged =
      lastRotatingPersistedRef.current.enabled !== rotatingStartEnabled ||
      lastRotatingPersistedRef.current.index !== rotatingStartIndex;

    const saved = saveStoredPreferences({
      values,
      filters: songFilters,
      keyword,
      brushingHand,
      brushType,
      rotatingStartEnabled,
      rotatingStartIndex,
      overlayTheme: overlayThemeChoice,
      brushDurationSeconds,
      savedAt: Date.now()
    });

    if (rotatingChanged) {
      if (saved) {
        lastRotatingPersistedRef.current = { enabled: rotatingStartEnabled, index: rotatingStartIndex };
        setRotatingStartPersistStatus("saved");
      } else {
        setRotatingStartPersistStatus("error");
      }
    }
  }, [brushDurationSeconds, brushingHand, brushType, keyword, overlayThemeChoice, rotatingStartEnabled, rotatingStartIndex, songFilters, storageConsent, values]);

  useEffect(() => {
    if (storageConsent !== "granted" || !dbStatus.ready || !activeHouseholdUser?.userId || !preferencesHydratedRef.current) {
      return;
    }

    void saveUserScopedDefaults(activeHouseholdUser.userId, {
      values,
      filters: songFilters,
      keyword,
      brushingHand,
      brushType,
      rotatingStartEnabled,
      rotatingStartIndex,
      overlayTheme: overlayThemeChoice,
      brushDurationSeconds,
      savedAt: Date.now()
    });
  }, [activeHouseholdUser?.userId, brushDurationSeconds, brushingHand, brushType, dbStatus.ready, keyword, overlayThemeChoice, rotatingStartEnabled, rotatingStartIndex, songFilters, storageConsent, values]);

  useEffect(() => {
    if (storageConsent !== "granted" || !dbStatus.ready || !activeHouseholdUser?.userId || !preferencesHydratedRef.current) {
      return;
    }

    void saveUserScopedFavoriteSongs(activeHouseholdUser.userId, favoriteSongs);
  }, [activeHouseholdUser?.userId, dbStatus.ready, favoriteSongs, storageConsent]);

  useEffect(() => {
    if (storageConsent !== "granted" || !dbStatus.ready || !activeHouseholdUser?.userId || !preferencesHydratedRef.current || !lastSession) {
      return;
    }

    void saveUserScopedLastSession(activeHouseholdUser.userId, lastSession);
  }, [activeHouseholdUser?.userId, dbStatus.ready, lastSession, storageConsent]);

  useEffect(() => {
    if (storageConsent !== "granted" || repeatSessionBootstrapRef.current || !lastSession?.song) {
      return;
    }

    repeatSessionBootstrapRef.current = true;
    applySavedSession(lastSession);
    setWorkflowStep("brush");
    setAutoRestoredBrushView(true);
    setSelectedSong(lastSession.song);
    setError("");
    setBpmData(lastSession.bpmSnapshot || null);

    if (lastSession.youtube?.embedUrl) {
      setPlayerData(lastSession.youtube);
      return;
    }

    void selectSongWithOptionsRef.current?.(lastSession.song, { autoplay: false });
  }, [lastSession, storageConsent]);

  useEffect(() => {
    if (brushingPhase !== "complete" || storageConsent !== "granted" || !dbStatus.ready || !activeHouseholdUser?.userId || !householdProfile?.householdId) {
      return;
    }

    const completionKey = `${activeHouseholdUser.userId}:${selectedSong?.title || ""}:${selectedSong?.artist || ""}:${sessionStartedAtRef.current || "none"}`;
    if (loggedCompletedSessionRef.current === completionKey) {
      return;
    }

    loggedCompletedSessionRef.current = completionKey;

    void (async () => {
      const createdSession = await createBrushingSession({
        userId: activeHouseholdUser.userId,
        householdId: householdProfile.householdId,
        sessionType: "brushing",
        startedAt: sessionStartedAtRef.current || new Date(Date.now() - Math.round(brushingMusicElapsedSeconds * 1000)).toISOString(),
        completedAt: new Date().toISOString(),
        durationSeconds: Math.max(0, Math.round(brushingMusicElapsedSeconds)),
        targetDurationSeconds: Number(bpmData?.totalBrushingSeconds || brushDurationSeconds),
        songTitle: selectedSong?.title || null,
        artistName: selectedSong?.artist || null,
        bpmUsed: Number(selectedSong?.bpm || bpmData?.searchBpm || 0),
        topTeethCount: Number(values.top || 0),
        bottomTeethCount: Number(values.bottom || 0),
        totalTeethCount: Number(values.top || 0) + Number(values.bottom || 0),
        performanceRating: "complete",
        completed: true,
        source: "phase3-progress-dashboard"
      });
      const unlockedAchievements = await awardAchievementsForUser(activeHouseholdUser.userId, householdProfile.householdId, {
        relatedSessionId: createdSession.sessionId,
        sourceEventType: "brushing-session-complete",
        sourceEventId: createdSession.sessionId,
        sourceEventAt: createdSession.completedAt,
        sourceContext: {
          sessionType: "brushing",
          brushType,
          toothStage: toothAgeEstimate?.phase || "unknown"
        }
      });
      setRecentUnlockedAchievements(unlockedAchievements);
      setProgressDashboard(await loadUserProgressDashboard(activeHouseholdUser.userId, progressDashboardFilters, householdProfile?.rewardSettings, householdProfile?.goalSettings));
      setPersistedStateRevision((current) => current + 1);
    })().catch((sessionError) => {
      setError(sessionError?.message || t("app.householdSetup.saveFailed"));
    });
  }, [activeHouseholdUser?.userId, bpmData?.searchBpm, bpmData?.totalBrushingSeconds, brushDurationSeconds, brushType, brushingMusicElapsedSeconds, brushingPhase, dbStatus.ready, householdProfile?.goalSettings, householdProfile?.householdId, householdProfile?.rewardSettings, progressDashboardFilters, selectedSong?.artist, selectedSong?.bpm, selectedSong?.title, storageConsent, t, toothAgeEstimate?.phase, values.bottom, values.top]);

  async function handleAllowStorage() {
    const nextStatus = setStorageConsent(true);
    setStorageConsentState(nextStatus);
    setStorageBannerDismissed(false);
    setStorageBannerDismissedState(false);

    if (!dbStatus.ready) {
      return;
    }

    try {
      const migrationStatus = await initializePhase2Migration();
      if (typeof window !== "undefined") {
        window.__brushbeatsMigrationStatus = migrationStatus;
        window.dispatchEvent(new CustomEvent("brushbeats:migration-status", { detail: migrationStatus }));
      }
      setPersistedStateRevision((current) => current + 1);
      setError("");
    } catch (setupError) {
      setError(setupError?.message || t("app.migration.failedLegacyStorage"));
    }
  }

  async function handleDeclineStorage() {
    const nextStatus = setStorageConsent(false);
    setStorageConsentState(nextStatus);
    clearStoredPreferences();
    clearLastSession();
    clearFavoriteSongs();
    setLastSession(null);
    setFavoriteSongs([]);
    setHouseholdManagement(null);
    setHouseholdOverview(null);
    setProgressDashboard(null);
    setRecentUnlockedAchievements([]);

    if (!dbStatus.ready) {
      return;
    }

    try {
      await clearPersistedPhase2Data();
      setPersistedStateRevision((current) => current + 1);
      setMigrationNotice(null);
      setError("");
    } catch (clearError) {
      setError(clearError?.message || t("app.householdSetup.saveFailed"));
    }
  }

  function handleDismissStorageBanner() {
    setStorageBannerDismissed(true);
    setStorageBannerDismissedState(true);
  }

  async function handleConfirmStorageToggle() {
    if (storageToggleRequest === "enable") {
      await handleAllowStorage();
      setStorageToggleNotice("Session storage enabled: BrushBeats will remember your preferences, last session, and favorites on this device.");
    } else if (storageToggleRequest === "disable") {
      await handleDeclineStorage();
      setStorageToggleNotice("Session storage disabled: saved preferences, last session, and favorites were cleared on this device.");
    }

    setStorageToggleRequest(null);
  }

  function handleCancelStorageToggle() {
    setStorageToggleRequest(null);
  }

  function handleHouseholdSetupDraftChange(field, value) {
    setHouseholdSetupDraft((current) => {
      if (!current) {
        return current;
      }

      if (field === "topTeethCount" || field === "bottomTeethCount") {
        return {
          ...current,
          [field]: normalizeTeethDraftValue(value, current[field])
        };
      }

      return {
        ...current,
        [field]: value
      };
    });
  }

  function handleAddHouseholdMember() {
    setHouseholdSetupDraft((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        additionalMembers: [
          ...(current.additionalMembers || []),
          {
            clientId: `member-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
            memberName: "",
            topTeethCount: 16,
            bottomTeethCount: 16
          }
        ].slice(0, 4)
      };
    });
  }

  function handleRemoveHouseholdMember(clientId) {
    setHouseholdSetupDraft((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        additionalMembers: (current.additionalMembers || []).filter((member) => member.clientId !== clientId)
      };
    });
  }

  function handleAdditionalMemberChange(clientId, field, value) {
    setHouseholdSetupDraft((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        additionalMembers: (current.additionalMembers || []).map((member) => {
          if (member.clientId !== clientId) {
            return member;
          }

          if (field === "topTeethCount" || field === "bottomTeethCount") {
            return {
              ...member,
              [field]: normalizeTeethDraftValue(value, member[field])
            };
          }

          return {
            ...member,
            [field]: value
          };
        })
      };
    });
  }

  async function handleDismissHouseholdSetup() {
    setHouseholdOnboardingUiState({ dismissedAt: new Date().toISOString() });
    await setHouseholdOnboardingUiDismissed(true);
  }

  async function handleReopenHouseholdSetup() {
    if (!householdSetupDraft && householdProfile?.householdId) {
      setHouseholdSetupDraft(
        buildHouseholdSetupDraft({
          household: householdProfile,
          activeUser: activeHouseholdUser,
          onboardingDraft: null,
          userDefaults: {
            values,
            filters: songFilters,
            keyword,
            brushingHand,
            brushType,
            rotatingStartEnabled,
            rotatingStartIndex,
            brushDurationSeconds
          },
          migrationState: persistedMigrationState
        })
      );
    }

    setHouseholdOnboardingUiState({ dismissedAt: null });
    await setHouseholdOnboardingUiDismissed(false);
    setWorkflowStep("teeth");
  }

  async function handleCompleteHouseholdSetup(event) {
    event.preventDefault();

    if (!householdProfile?.householdId || !householdSetupDraft) {
      return;
    }

    setHouseholdSetupSaving(true);

    try {
      const result = await completeHouseholdOnboarding({
        household: householdProfile,
        activeUser: activeHouseholdUser,
        draft: householdSetupDraft,
        migrationState: persistedMigrationState
      });

      setHouseholdProfile(result.household);
      setActiveHouseholdUser(result.user);
      setHouseholdManagement(await loadHouseholdManagement(result.household.householdId));
      setHouseholdOverview(await loadHouseholdOverview(result.household.householdId));
      setProgressDashboard(await loadUserProgressDashboard(result.user.userId, progressDashboardFilters, result.household.rewardSettings, result.household.goalSettings));
      setHouseholdOnboardingState({
        completedAt: new Date().toISOString(),
        householdId: result.household.householdId,
        userId: result.user.userId,
        reviewSource: householdSetupDraft.reviewSource
      });
      setHouseholdOnboardingUiState({ dismissedAt: null });
      setHouseholdSetupDraft(null);
      applySavedSession(result.defaults);
      saveStoredPreferences(result.defaults);
      trackEvent("phase2_household_setup_completed", {
        review_source: householdSetupDraft.reviewSource,
        migration_review: householdSetupDraft.reviewSource === "migration-review"
      });
    } catch (setupError) {
      setError(setupError?.message || t("app.householdSetup.saveFailed"));
    } finally {
      setHouseholdSetupSaving(false);
    }
  }

  async function handlePreferredLanguageChange(nextLanguage) {
    const nextFallbackInfo = await setPreferredSupportedLanguage(nextLanguage);
    setLanguageFallbackState(nextFallbackInfo);
  }

  async function handleSaveHouseholdSettings(nextSettings) {
    if (!householdProfile?.householdId) {
      return;
    }

    setHouseholdManagementSaving(true);
    setHouseholdManagementNotice("");
    try {
      const updatedHousehold = await saveHouseholdSettings(householdProfile.householdId, {
        householdName: nextSettings?.householdName?.trim() || "BrushBeats Household",
        rewardSettings: nextSettings?.rewardSettings || householdProfile.rewardSettings || {},
        goalSettings: nextSettings?.goalSettings || householdProfile.goalSettings || {}
      });
      setHouseholdProfile(updatedHousehold);
      setHouseholdManagement(await loadHouseholdManagement(updatedHousehold.householdId));
      setHouseholdOverview(await loadHouseholdOverview(updatedHousehold.householdId));
      if (activeHouseholdUser?.userId) {
        setProgressDashboard(await loadUserProgressDashboard(activeHouseholdUser.userId, progressDashboardFilters, updatedHousehold.rewardSettings, updatedHousehold.goalSettings));
      }
      setError("");
      setHouseholdManagementNotice(t("app.householdManagement.saved"));
    } catch (householdError) {
      setError(householdError?.message || t("app.householdSetup.saveFailed"));
    } finally {
      setHouseholdManagementSaving(false);
    }
  }

  async function handleSaveHouseholdMember(userId, draft) {
    if (!householdProfile?.householdId) {
      return;
    }

    setHouseholdManagementSaving(true);
    setHouseholdManagementNotice("");
    try {
      const member = await saveHouseholdMember(householdProfile.householdId, {
        userId,
        ...draft
      });
      const [management, overview] = await Promise.all([
        loadHouseholdManagement(householdProfile.householdId),
        loadHouseholdOverview(householdProfile.householdId)
      ]);

      setHouseholdManagement(management);
      setHouseholdOverview(overview);

      if (member.userId === activeHouseholdUser?.userId) {
        setActiveHouseholdUser(member);
        applySavedSession(member);
      }

      setPersistedStateRevision((current) => current + 1);
      setError("");
      setHouseholdManagementNotice(t("app.householdManagement.saved"));
    } catch (memberError) {
      setError(memberError?.message || t("app.householdSetup.saveFailed"));
    } finally {
      setHouseholdManagementSaving(false);
    }
  }

  async function handleArchiveHouseholdMember(userId) {
    if (!householdProfile?.householdId) {
      return;
    }

    setHouseholdManagementSaving(true);
    try {
      const management = await archiveHouseholdMember(householdProfile.householdId, userId);
      const [overview, scopedState] = await Promise.all([
        loadHouseholdOverview(householdProfile.householdId),
        management.household.activeUserId
          ? getUserScopedState(management.household.activeUserId, {
              defaults: { values, filters: songFilters, keyword, brushingHand, brushType, rotatingStartEnabled, rotatingStartIndex, overlayTheme: overlayThemeChoice, brushDurationSeconds },
              lastSession,
              favoriteSongs
            })
          : Promise.resolve(null)
      ]);

      const nextActiveUser = management.members.find((member) => member.userId === management.household.activeUserId) || null;

      setHouseholdManagement(management);
      setHouseholdOverview(overview);
      setActiveHouseholdUser(nextActiveUser);
      setHouseholdProfile(management.household);

      if (nextActiveUser && scopedState) {
        if (scopedState.defaults) {
          applySavedSession(scopedState.defaults);
        }
        setLastSession(scopedState.lastSession || null);
        setFavoriteSongs(scopedState.favoriteSongs || []);
        setProgressDashboard(await loadUserProgressDashboard(nextActiveUser.userId, progressDashboardFilters, management.household.rewardSettings, management.household.goalSettings));
      }

      setPersistedStateRevision((current) => current + 1);
      setError("");
    } catch (archiveError) {
      setError(archiveError?.message || t("app.householdSetup.saveFailed"));
    } finally {
      setHouseholdManagementSaving(false);
    }
  }

  async function handleRestoreHouseholdMember(userId) {
    if (!householdProfile?.householdId) {
      return;
    }

    setHouseholdManagementSaving(true);
    try {
      setHouseholdManagement(await restoreHouseholdMember(householdProfile.householdId, userId));
      setHouseholdOverview(await loadHouseholdOverview(householdProfile.householdId));
      setPersistedStateRevision((current) => current + 1);
      setError("");
    } catch (restoreError) {
      setError(restoreError?.message || t("app.householdSetup.saveFailed"));
    } finally {
      setHouseholdManagementSaving(false);
    }
  }

  async function handleDeleteHouseholdMember(userId) {
    if (!householdProfile?.householdId) {
      return;
    }

    setHouseholdManagementSaving(true);
    try {
      const management = await removeHouseholdMember(householdProfile.householdId, userId);
      const [overview, scopedState] = await Promise.all([
        loadHouseholdOverview(householdProfile.householdId),
        management?.household?.activeUserId
          ? getUserScopedState(management.household.activeUserId, {
              defaults: { values, filters: songFilters, keyword, brushingHand, brushType, rotatingStartEnabled, rotatingStartIndex, overlayTheme: overlayThemeChoice, brushDurationSeconds },
              lastSession,
              favoriteSongs
            })
          : Promise.resolve(null)
      ]);

      const nextActiveUser = management?.members?.find((member) => member.userId === management.household.activeUserId) || null;
      setHouseholdManagement(management);
      setHouseholdOverview(overview);
      setActiveHouseholdUser(nextActiveUser);
      setHouseholdProfile(management?.household || householdProfile);

      if (nextActiveUser && scopedState) {
        if (scopedState.defaults) {
          applySavedSession(scopedState.defaults);
        }
        setLastSession(scopedState.lastSession || null);
        setFavoriteSongs(scopedState.favoriteSongs || []);
        setProgressDashboard(await loadUserProgressDashboard(nextActiveUser.userId, progressDashboardFilters, management.household.rewardSettings, management.household.goalSettings));
      }

      setPersistedStateRevision((current) => current + 1);
      setError("");
    } catch (removeError) {
      setError(removeError?.message || t("app.householdSetup.saveFailed"));
    } finally {
      setHouseholdManagementSaving(false);
    }
  }

  async function handleLogRoutineActivity(sessionType) {
    if (!storageConsent || storageConsent !== "granted" || !dbStatus.ready || !activeHouseholdUser?.userId || !householdProfile?.householdId) {
      return;
    }

    const durationByType = {
      flossing: 90,
      "water-picking": 60
    };

    try {
      const now = new Date().toISOString();
      const durationSeconds = durationByType[sessionType] || 60;
      const createdSession = await createBrushingSession({
        userId: activeHouseholdUser.userId,
        householdId: householdProfile.householdId,
        sessionType,
        startedAt: now,
        completedAt: now,
        durationSeconds,
        targetDurationSeconds: durationSeconds,
        topTeethCount: Number(values.top || 0),
        bottomTeethCount: Number(values.bottom || 0),
        totalTeethCount: Number(values.top || 0) + Number(values.bottom || 0),
        performanceRating: "complete",
        completed: true,
        source: "phase3-quick-log"
      });
      const unlockedAchievements = await awardAchievementsForUser(activeHouseholdUser.userId, householdProfile.householdId, {
        relatedSessionId: createdSession.sessionId,
        sourceEventType: sessionType,
        sourceEventId: createdSession.sessionId,
        sourceEventAt: createdSession.completedAt,
        sourceContext: {
          sessionType,
          brushType,
          toothStage: toothAgeEstimate?.phase || "unknown"
        }
      });
      if (unlockedAchievements.length > 0) {
        setRecentUnlockedAchievements(unlockedAchievements);
      }
      setProgressDashboard(await loadUserProgressDashboard(activeHouseholdUser.userId, progressDashboardFilters, householdProfile?.rewardSettings, householdProfile?.goalSettings));
      setPersistedStateRevision((current) => current + 1);
      trackEvent("phase3_activity_logged", { session_type: sessionType });
      setError("");
    } catch (activityError) {
      setError(activityError?.message || t("app.householdSetup.saveFailed"));
    }
  }

  async function handleSwitchHouseholdUser(userId) {
    if (!dbStatus.ready || !householdProfile?.householdId || !userId || userId === activeHouseholdUser?.userId) {
      return;
    }

    try {
      const [overview, scopedState] = await Promise.all([
        switchActiveHouseholdUser(householdProfile.householdId, userId),
        getUserScopedState(userId, {
          defaults: {
            values,
            filters: songFilters,
            keyword,
            brushingHand,
            brushType,
            rotatingStartEnabled,
            rotatingStartIndex,
            brushDurationSeconds
          },
          lastSession,
          favoriteSongs
        })
      ]);

      const nextActiveUser = overview?.members?.find((member) => member.userId === userId) || null;
      const nextDefaults = scopedState.defaults;

      if (nextDefaults) {
        applySavedSession(nextDefaults);
      }

      setHouseholdOverview(overview);
  setHouseholdManagement(await loadHouseholdManagement(householdProfile.householdId));
      setActiveHouseholdUser(nextActiveUser);
  setProgressDashboard(await loadUserProgressDashboard(userId, progressDashboardFilters, householdProfile?.rewardSettings, householdProfile?.goalSettings));
      setRecentUnlockedAchievements([]);
      setLastSession(scopedState.lastSession || null);
      setFavoriteSongs(scopedState.favoriteSongs || []);
      setBpmData(scopedState.lastSession?.bpmSnapshot || null);
      setAutoRestoredBrushView(false);
      setSelectedSong(null);
      setPlayerData(null);
      setQueuedStoredSongKey("");
  loggedCompletedSessionRef.current = null;
      setWorkflowStep("teeth");
      trackEvent("phase3_active_user_switched", {
        household_id: householdProfile.householdId,
        user_id: userId
      });
    } catch (switchError) {
      setError(switchError?.message || t("app.householdSetup.saveFailed"));
    }
  }

  async function handleQueueStoredSong(song, source = "favorites") {
    if (!song?.title || !song?.artist) {
      return;
    }

    await handleSelectSong(song, source);
    trackEvent("stored_song_queued", {
      source,
      title: song.title,
      artist: song.artist
    });
  }

  function handleToggleFavoriteSong(song) {
    if (storageConsent !== "granted") {
      return;
    }

    const key = `${(song?.title || "").trim().toLowerCase()}::${(song?.artist || "").trim().toLowerCase()}`;
    const exists = favoriteSongs.some((item) => `${(item?.title || "").trim().toLowerCase()}::${(item?.artist || "").trim().toLowerCase()}` === key);

    if (exists) {
      removeFavoriteSong(song);
      setFavoriteSongs((current) => current.filter((item) => `${(item?.title || "").trim().toLowerCase()}::${(item?.artist || "").trim().toLowerCase()}` !== key));
      return;
    }

    addFavoriteSong(song);
    setFavoriteSongs((current) => [{ ...song, savedAt: Date.now() }, ...current.filter((item) => `${(item?.title || "").trim().toLowerCase()}::${(item?.artist || "").trim().toLowerCase()}` !== key)].slice(0, 25));
  }

  function openPrivacyModal() {
    setActiveModal("privacy");
  }

  function openStorageInfoModal() {
    setActiveModal("storage");
  }

  function closePrivacyModal() {
    setActiveModal(null);
  }

  function beginBrushingCountdown() {
    const totalSeconds = Number(bpmData?.totalBrushingSeconds || brushDurationSeconds);
    const startDelayMs = START_DELAY_SECONDS * 1000;
    if (rotatingStartEnabled) {
      const safeIndex = clampValue(Math.floor(Number(rotatingStartIndex) || 0), 0, ROTATING_START_SEGMENT_SEQUENCE.length - 1);
      const nextStartSegmentKey = ROTATING_START_SEGMENT_SEQUENCE[safeIndex];
      setSessionStartSegmentKey(nextStartSegmentKey);
      setRotatingStartIndex((safeIndex + 1) % ROTATING_START_SEGMENT_SEQUENCE.length);
    } else {
      setSessionStartSegmentKey(null);
    }
    countdownDeadlineRef.current = Date.now() + startDelayMs;
    setCountdownRemainingMs(startDelayMs);
    setTimer({ running: false, remaining: totalSeconds });
    setBrushingPhase("countdown");
  }

  function toSongKey(song) {
    return `${(song?.title || "").trim().toLowerCase()}::${(song?.artist || "").trim().toLowerCase()}`;
  }

  function markSongAsPlayed(song) {
    const songKey = toSongKey(song);
    if (!songKey || songKey === "::") {
      return;
    }

    playedSongsRef.current.add(songKey);
  }

  function pickRandomQueuedSong(currentSong, songPool = songs) {
    const currentSongKey = toSongKey(currentSong);
    const unplayedCandidates = songPool.filter((song) => {
      const songKey = toSongKey(song);
      return songKey !== currentSongKey && !playedSongsRef.current.has(songKey);
    });

    const fallbackCandidates = songPool.filter((song) => toSongKey(song) !== currentSongKey);
    const candidates = unplayedCandidates.length > 0 ? unplayedCandidates : fallbackCandidates;

    if (!candidates.length) {
      return null;
    }

    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  function queueNextGeneratedSong(currentSong, songPool = songs) {
    const nextSong = pickRandomQueuedSong(currentSong, songPool);
    queuedSongRef.current = nextSong;
    setQueuedSongPreview(nextSong);
    return nextSong;
  }

  useEffect(() => {
    playedSongsRef.current = new Set();
    queuedSongRef.current = null;
    setQueuedSongPreview(null);
  }, [bpmData?.searchBpm, keyword, songFilters.acousticness, songFilters.danceability, songFilters.tolerance, songRefreshSeed, totalTeeth]);

  useEffect(() => {
    if (!loading.bpm && !loading.songs && !loading.player) {
      setBackendStatus("");
      return;
    }

    const infoTimer = window.setTimeout(() => {
      setBackendStatus(t("app.backendStatus.waking"));
    }, 1800);

    const detailTimer = window.setTimeout(() => {
      setBackendStatus(t("app.backendStatus.connecting"));
    }, 7000);

    return () => {
      window.clearTimeout(infoTimer);
      window.clearTimeout(detailTimer);
    };
  }, [loading.bpm, loading.player, loading.songs, t]);

  useEffect(() => {
    let cancelled = false;

    const restoredSession = restoredSessionRef.current;
    if (restoredSession) {
      const restoredMatches =
        restoredSession.values?.top === values.top &&
        restoredSession.values?.bottom === values.bottom &&
        restoredSession.brushDurationSeconds === brushDurationSeconds;

      if (!restoredMatches) {
        restoredSessionRef.current = null;
      } else if (restoredSession.bpmSnapshot) {
        setBpmData(restoredSession.bpmSnapshot);
        restoredSessionRef.current = null;
        return () => {
          cancelled = true;
        };
      }

      restoredSessionRef.current = null;
    }

    if (autoRestoredBrushView && workflowStep === "brush") {
      return () => {
        cancelled = true;
      };
    }

    function loadBpm() {
      try {
        setLoading((prev) => ({ ...prev, bpm: true }));
        const data = calculateBpm({ ...values, totalBrushingSeconds: brushDurationSeconds });

        if (!cancelled) {
          setBpmData(data);
          trackEvent("bpm_calculated", { top_teeth: values.top, bottom_teeth: values.bottom, search_bpm: data.searchBpm });
          setError("");
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message);
        }
      } finally {
        if (!cancelled) {
          setLoading((prev) => ({ ...prev, bpm: false }));
        }
      }
    }

    loadBpm();
    return () => {
      cancelled = true;
    };
  }, [autoRestoredBrushView, brushDurationSeconds, values, workflowStep]);

  useEffect(() => {
    if (timer.running || brushingPhase === "paused" || brushingPhase === "complete") {
      return;
    }

    const nextSeconds = Number(bpmData?.totalBrushingSeconds || brushDurationSeconds);
    setTimer((prev) => {
      if (prev.remaining === nextSeconds && prev.running === false) {
        return prev;
      }

      return { running: false, remaining: nextSeconds };
    });
  }, [bpmData?.totalBrushingSeconds, brushDurationSeconds, brushingPhase, timer.running]);

  useEffect(() => {
    if (brushingPhase !== "countdown") {
      return;
    }

    if (countdownRemainingMs <= 0) {
      const totalSeconds = Number(bpmData?.totalBrushingSeconds || brushDurationSeconds);
      countdownDeadlineRef.current = null;
      setCountdownRemainingMs(0);
      setTimer({ running: true, remaining: totalSeconds });
      setBrushingPhase("running");
      lastPlaybackTickRef.current = playbackSecondsRef.current;
      if (playOnCountdownEndRef.current) {
        playOnCountdownEndRef.current = false;
        issuePlayerCommand("play");
      }
      return;
    }

    const intervalId = window.setInterval(() => {
      const remaining = Math.max(0, (countdownDeadlineRef.current || 0) - Date.now());
      setCountdownRemainingMs((previous) => (Math.abs(previous - remaining) < 20 ? previous : remaining));
    }, 100);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [bpmData?.totalBrushingSeconds, brushDurationSeconds, brushingPhase, countdownRemainingMs]);

  useEffect(() => {
    if (!bpmData?.searchBpm || (workflowStep !== "music" && brushingPhase !== "running")) {
      return;
    }

    let cancelled = false;

    async function loadSongs() {
      try {
        setLoading((prev) => ({ ...prev, songs: true }));
        const userMusicContext = buildUserMusicContext({
          countryCode: geoCountry?.countryCode,
          targetBpm: Number(bpmData.searchBpm || 120),
          toothCount: totalTeeth,
          genreHint: keyword,
          ageBucket: inferMusicAgeBucket(effectiveAgeEstimate)
        });
        const result = await getSongs({
          bpm: bpmData.searchBpm,
          tolerance: songFilters.tolerance,
          danceability: songFilters.danceability,
          acousticness: songFilters.acousticness,
          totalTeeth,
          keyword,
          seed: songRefreshSeed,
          browserLanguage: userMusicContext.browserLanguage,
          countryCode: userMusicContext.countryCode,
          genreHint: userMusicContext.genreHint,
          ageBucket: userMusicContext.ageBucket
        });
        const queryKey = `${totalTeeth}:${Math.round(bpmData.searchBpm)}:${songFilters.tolerance}:${songFilters.danceability}:${songFilters.acousticness}:${keyword.trim().toLowerCase()}`;
        const seenForQuery = seenSongsByQueryRef.current.get(queryKey) || new Set();
        const fetchedSongs = result.songs || [];
        const unseenSongs = fetchedSongs.filter((song) => !seenForQuery.has(toSongKey(song)));

        for (const song of unseenSongs) {
          seenForQuery.add(toSongKey(song));
        }

        seenSongsByQueryRef.current.set(queryKey, seenForQuery);

        if (!cancelled) {
          setSongs(unseenSongs);
          setSongsDebugInfo((previous) => ({
            ...(previous || {}),
            source: result.source,
            queryUsed: result.queryUsed,
            contextUsed: result.contextUsed,
            geoSource: result.geoSource,
            fetchedCount: fetchedSongs.length,
            shownCount: unseenSongs.length
          }));
          setIsSongPoolExhausted(fetchedSongs.length > 0 && unseenSongs.length === 0);
          setError("");
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message);
          setSongs([]);
          setSongsDebugInfo(null);
          setIsSongPoolExhausted(false);
        }
      } finally {
        if (!cancelled) {
          setLoading((prev) => ({ ...prev, songs: false }));
        }
      }
    }

    const timeout = window.setTimeout(loadSongs, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [bpmData?.searchBpm, brushingPhase, effectiveAgeEstimate, geoCountry?.countryCode, keyword, songFilters, songRefreshSeed, totalTeeth, workflowStep]);

  function handleSimulationChange(field, value) {
    setAgeSimulation((current) => {
      if (field === "mode") {
        return {
          ...current,
          mode: value === "phase" ? "phase" : "exact"
        };
      }

      if (field === "phase") {
        return {
          ...current,
          phase: ["infant", "toddler", "primary", "mixed", "adult"].includes(value)
            ? value
            : current.phase,
          mode: "phase"
        };
      }

      if (field === "unit") {
        return {
          ...current,
          mode: "exact",
          unit: value === "months" ? "months" : "years"
        };
      }

      return {
        ...current,
        mode: "exact",
        value: Number.isFinite(Number(value)) ? Number(value) : current.value
      };
    });
  }

  function handleSimulationToggle(active) {
    setAgeSimulation((current) => ({
      ...current,
      active: Boolean(active)
    }));

    if (active) {
      setShowAgeExperienceLab(true);
    }
  }

  function handleSimulationReset() {
    setAgeSimulation(DEFAULT_AGE_SIMULATION);
  }

  function handleOverlayThemeChange(value) {
    setOverlayThemeChoice(value || OVERLAY_THEME_AUTO);
  }

  function handleToggleAgeExperienceLab() {
    setAppView("brush");
    setWorkflowStep("teeth");
    setShowAgeExperienceLab((current) => !current);
  }

  function updateDraftSongFilter(key, value) {
    setDraftSongFilters((prev) => ({ ...prev, [key]: value }));
  }

  function commitSongFilter(key, value) {
    const nextFilters = { ...draftSongFilters, [key]: value };
    setDraftSongFilters(nextFilters);
    setSongFilters((prev) => {
      if (
        prev.tolerance === nextFilters.tolerance &&
        prev.danceability === nextFilters.danceability &&
        prev.acousticness === nextFilters.acousticness
      ) {
        return prev;
      }

      return nextFilters;
    });
  }

  useEffect(() => {
    if (!timer.running || brushingPhase !== "running") {
      return;
    }

    const totalSeconds = Number(bpmData?.totalBrushingSeconds || brushDurationSeconds);
    const remaining = Math.max(0, totalSeconds - Math.floor(brushingMusicElapsedSeconds));

    setTimer((prev) => {
      const nextRunning = remaining > 0;
      if (prev.remaining === remaining && prev.running === nextRunning) {
        return prev;
      }

      return { running: nextRunning, remaining };
    });

    if (remaining <= 0) {
      trackEvent("brushing_completed");
      setBrushingPhase("complete");
    }
  }, [timer.running, brushingPhase, brushingMusicElapsedSeconds, bpmData?.totalBrushingSeconds, brushDurationSeconds]);

  function issuePlayerCommand(type) {
    setPlayerCommand((previous) => ({ type, nonce: previous.nonce + 1 }));
  }

  function handlePlaybackTick(seconds) {
    setPlaybackSeconds(seconds);

    if (brushingPhase === "awaitingPlayback" && seconds > 0) {
      beginBrushingCountdown();
      lastPlaybackTickRef.current = seconds;
      return;
    }

    if (brushingPhase !== "running") {
      lastPlaybackTickRef.current = seconds;
      return;
    }

    const previousTick = lastPlaybackTickRef.current;
    lastPlaybackTickRef.current = seconds;

    if (typeof previousTick !== "number") {
      return;
    }

    const delta = seconds - previousTick;

    // New song starts near 0s; ignore negative jump and continue accumulating from subsequent ticks.
    if (delta <= 0 || delta > 5) {
      return;
    }

    setBrushingMusicElapsedSeconds((prev) => prev + delta);
  }

  function handlePlaybackDurationChange(duration) {
    setSongDurationSeconds(Number(duration) || 0);
  }

  async function handleSelectSong(song, source = "generated") {
    trackEvent("song_selected", { title: song.title, artist: song.artist, source });
    setAutoRestoredBrushView(false);
    setQueuedStoredSongKey(source === "favorites" || source === "lastSession" ? toSongKey(song) : "");
    setSongsDebugInfo((previous) => ({
      ...(previous || {}),
      selectionSource: source,
      selectedTitle: song.title,
      selectedArtist: song.artist,
      youtubeQueryMode: "direct-title-artist"
    }));
    queuedSongRef.current = null;
    setQueuedSongPreview(null);
    if (storageConsent === "granted") {
      addFavoriteSong(song);
      setFavoriteSongs((current) => [{ ...song, savedAt: Date.now() }, ...current.filter((item) => toSongKey(item) !== toSongKey(song))].slice(0, 25));
    }
    // Navigate to step 3 immediately so the user sees the brush page
    // while the YouTube lookup runs in the background.
    setAppView("brush");
    setWorkflowStep("brush");
    return handleSelectSongWithOptions(song, { autoplay: false, source });
  }

  const preloadSharedYoutubeVideo = useCallback((videoId, videoTitle = "Artist Spotlight Video", source = "shared-video-id") => {
    const safeVideoId = normalizeYoutubeVideoId(videoId);
    const embedUrl = buildYoutubeEmbedUrl(safeVideoId);

    if (!safeVideoId || !embedUrl) {
      return false;
    }

    const normalizedTitle = String(videoTitle || "").trim() || "Artist Spotlight Video";
    const artistLabel = activeHouseholdUser?.name
      ? `${activeHouseholdUser.name} spotlight`
      : "YouTube creator";

    setAppView("brush");
    setWorkflowStep("brush");
    setAutoRestoredBrushView(false);
    setQueuedStoredSongKey("");
    queuedSongRef.current = null;
    setQueuedSongPreview(null);

    setSelectedSong({
      title: normalizedTitle,
      artist: artistLabel,
      bpm: Number(bpmData?.searchBpm || 120)
    });
    setPlayerData({
      videoId: safeVideoId,
      embedUrl,
      title: normalizedTitle,
      channelTitle: "Shared YouTube Link"
    });
    setSongsDebugInfo((previous) => ({
      ...(previous || {}),
      selectionSource: source,
      selectedTitle: normalizedTitle,
      selectedArtist: artistLabel,
      youtubeMatchedTitle: normalizedTitle,
      youtubeMatchedChannel: "Shared YouTube Link",
      youtubeQueryMode: "direct-video-id"
    }));
    setError("");
    return true;
  }, [activeHouseholdUser?.name, bpmData?.searchBpm]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const rawVideoId = params.get("videoId") || params.get("yt") || params.get("v");
    const sharedVideoId = normalizeYoutubeVideoId(rawVideoId);
    if (!sharedVideoId || appliedSharedVideoRef.current === sharedVideoId) {
      return;
    }

    const sharedTitle = params.get("videoTitle") || params.get("title") || "Artist Spotlight Video";
    const applied = preloadSharedYoutubeVideo(sharedVideoId, sharedTitle, "shared-link");
    if (applied) {
      appliedSharedVideoRef.current = sharedVideoId;
    }
  }, [activeHouseholdUser?.name, bpmData?.searchBpm, preloadSharedYoutubeVideo]);

  function handlePreviewArtistVideo({ videoId, title }) {
    preloadSharedYoutubeVideo(videoId, title, "artist-page-preview");
  }

  useEffect(() => {
    if (workflowStep !== "brush" || !selectedSong) {
      return;
    }

    window.requestAnimationFrame(() => {
      brushMapSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [selectedSong, workflowStep]);

  async function handleSelectSongWithOptions(song, options = { autoplay: false, source: "generated" }) {
    const lookupId = latestVideoLookupRef.current + 1;
    latestVideoLookupRef.current = lookupId;
    setSelectedSong(song);
    setSongDurationSeconds(0);
    // Keep old playerData visible while loading new video
    if (!loading.player) {
      setLoading((prev) => ({ ...prev, player: true }));
    }

    try {
      const video = await getYoutubeVideo({
        title: song.title,
        artist: song.artist
      });

      if (lookupId !== latestVideoLookupRef.current) {
        return null;
      }

      setPlayerData(video);
      setSongsDebugInfo((previous) => ({
        ...(previous || {}),
        selectionSource: options.source || previous?.selectionSource || "generated",
        selectedTitle: song.title,
        selectedArtist: song.artist,
        youtubeMatchedTitle: video?.title || null,
        youtubeMatchedChannel: video?.channelTitle || null,
        youtubeQueryMode: "direct-title-artist"
      }));

      // Ensure we're on step 3 (already set in handleSelectSong, but guard for direct calls).
      setAppView("brush");
      setWorkflowStep("brush");

      if (options.autoplay && video?.embedUrl) {
        setAutoplayToken((prev) => prev + 1);
      }

      setError("");
      return video;
    } catch (err) {
      if (lookupId !== latestVideoLookupRef.current) {
        return null;
      }
      setError(err.message);
      setPlayerData(null);
      return null;
    } finally {
      if (lookupId === latestVideoLookupRef.current) {
        setLoading((prev) => ({ ...prev, player: false }));
      }
    }
  }
  selectSongWithOptionsRef.current = handleSelectSongWithOptions;

  function startBrushing(options = {}) {
    if ((bpmData?.totalTeeth || 0) <= 0) {
      setError(t("brushing.errors.needsTeeth"));
      return;
    }

    if (!playerData?.embedUrl) {
      setError(t("brushing.errors.needsPlayback"));
      return;
    }

    const totalSeconds = Number(bpmData?.totalBrushingSeconds || brushDurationSeconds);
    const shouldResume = Boolean(options.resumeFromPause);
    const shouldRestartVideo = Boolean(options.restartVideo);
    const hasPendingCountdown = countdownRemainingMs > 0;

    if (shouldResume) {
      if (hasPendingCountdown) {
        countdownDeadlineRef.current = Date.now() + countdownRemainingMs;
        setBrushingPhase("countdown");
      } else {
        lastPlaybackTickRef.current = playbackSeconds;
        setTimer((previous) => ({ ...previous, running: true }));
        setBrushingPhase("running");
      }
    } else {
      setBrushingMusicElapsedSeconds(0);
      setPlaybackSeconds(shouldRestartVideo ? 0 : playbackSeconds);
      lastPlaybackTickRef.current = shouldRestartVideo ? 0 : playbackSeconds;
      setTimer({ running: false, remaining: totalSeconds });

      if ((shouldRestartVideo ? 0 : playbackSeconds) > 0) {
        beginBrushingCountdown();
      } else {
        setBrushingPhase("awaitingPlayback");
      }
    }

    if (shouldResume) {
      if (!hasPendingCountdown || !playOnCountdownEndRef.current) {
        issuePlayerCommand("play");
      }
    } else if (shouldRestartVideo) {
      playOnCountdownEndRef.current = false;
      issuePlayerCommand("restart");
    } else {
      playOnCountdownEndRef.current = false;
      issuePlayerCommand("play");
    }

    if (shouldResume) {
      trackEvent("brushing_resumed", { song_title: selectedSong?.title, song_artist: selectedSong?.artist, remaining_seconds: timer.remaining });
      setError("");
      return;
    }

    sessionStartedAtRef.current = new Date().toISOString();
    loggedCompletedSessionRef.current = null;
    setRecentUnlockedAchievements([]);

    markSongAsPlayed(selectedSong);

    const queuedSong = queueNextGeneratedSong(selectedSong);
    if (queuedSong) {
      trackEvent("song_auto_queued", { title: queuedSong.title, artist: queuedSong.artist, trigger: "start_brushing" });
    }

    if (storageConsent === "granted" && selectedSong?.title && selectedSong?.artist) {
      const sessionToSave = {
        song: {
          title: selectedSong.title,
          artist: selectedSong.artist,
          bpm: selectedSong.bpm
        },
        youtube: playerData?.embedUrl
          ? {
              embedUrl: playerData.embedUrl,
              videoId: playerData.videoId
            }
          : undefined,
        bpmSnapshot: bpmData,
        values,
        filters: songFilters,
        keyword,
        brushingHand,
        brushType,
        rotatingStartEnabled,
        rotatingStartIndex,
        brushDurationSeconds,
        savedAt: Date.now()
      };

      saveStoredPreferences({
        values,
        filters: songFilters,
        keyword,
        brushingHand,
        brushType,
        rotatingStartEnabled,
        rotatingStartIndex,
        overlayTheme: overlayThemeChoice,
        brushDurationSeconds,
        savedAt: sessionToSave.savedAt
      });
      saveLastSession(sessionToSave);
      setLastSession(sessionToSave);
    }

    trackEvent("brushing_started", { song_title: selectedSong?.title, song_artist: selectedSong?.artist, duration_seconds: totalSeconds });
    setError("");
  }

  function pauseBrushing() {
    if (brushingPhase !== "running" && brushingPhase !== "countdown" && brushingPhase !== "awaitingPlayback") {
      return;
    }

    setTimer((previous) => ({ ...previous, running: false }));
    setBrushingPhase("paused");
    lastPlaybackTickRef.current = playbackSeconds;
    if (brushingPhase === "countdown" && countdownDeadlineRef.current) {
      setCountdownRemainingMs(Math.max(0, countdownDeadlineRef.current - Date.now()));
      countdownDeadlineRef.current = null;
    }
    issuePlayerCommand("pause");
  }

  function restartBrushing() {
    const totalSeconds = Number(bpmData?.totalBrushingSeconds || brushDurationSeconds);
    const remainingSongSeconds = songDurationSeconds > 0 ? Math.max(0, songDurationSeconds - playbackSeconds) : null;
    const needsSongRestart = typeof remainingSongSeconds === "number" && remainingSongSeconds < totalSeconds + START_DELAY_SECONDS;
    const confirmMessage = needsSongRestart
      ? t("brushing.resetConfirmRestartSuggested", {
          remaining: formatTime(Math.floor(remainingSongSeconds))
        })
      : t("brushing.resetConfirm");
    const resetBrushOnly = typeof window === "undefined" ? true : window.confirm(confirmMessage);

    if (!resetBrushOnly) {
      issuePlayerCommand("reset");
      setPlaybackSeconds(0);
      lastPlaybackTickRef.current = 0;
    } else if (needsSongRestart) {
      setError(t("brushing.errors.songMayEndEarly", {
        remaining: formatTime(Math.floor(remainingSongSeconds))
      }));
    }

    setBrushingMusicElapsedSeconds(0);
    setCountdownRemainingMs(0);
    setSessionStartSegmentKey(null);
    countdownDeadlineRef.current = null;
    playOnCountdownEndRef.current = false;
    sessionStartedAtRef.current = null;
    loggedCompletedSessionRef.current = null;
    setTimer({ running: false, remaining: totalSeconds });
    setBrushingPhase("idle");
    queuedSongRef.current = null;
    setQueuedSongPreview(null);
    trackEvent("brushing_reset", { song_title: selectedSong?.title, song_artist: selectedSong?.artist, duration_seconds: totalSeconds });
    if (!needsSongRestart || !resetBrushOnly) {
      setError("");
    }
  }

  function handlePrimaryBrushAction() {
    if (brushingPhase === "running" || brushingPhase === "awaitingPlayback") {
      pauseBrushing();
      return;
    }

    if (brushingPhase === "paused") {
      startBrushing({ resumeFromPause: true });
      return;
    }

    startBrushing({ restartVideo: brushingPhase === "complete" });
  }

  function handleBrushDurationChange(nextDuration) {
    const safeDuration = Number(nextDuration || DEFAULT_BRUSH_DURATION_SECONDS);
    setBrushDurationSeconds(safeDuration);
  }

  function handleProgressDashboardFilterChange(key, value) {
    setProgressDashboardFilters((current) => ({
      ...current,
      [key]: value
    }));
  }

  function updateValue(key, value) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function regenerateSongs() {
    setSongRefreshSeed((prev) => prev + 1);
  }

  function handleSongEnded() {
    if (brushingPhase !== "running" && brushingPhase !== "countdown") {
      return;
    }

    trackEvent("song_playback_finished_during_brushing", {
      song_title: selectedSong?.title,
      song_artist: selectedSong?.artist,
      queued_title: queuedSongRef.current?.title,
      queued_artist: queuedSongRef.current?.artist
    });
  }

  const subtitle = useMemo(() => {
    if (!bpmData) {
      return t("app.subtitle.withoutBpm", {
        description: detectedBrusherProfile.description
      });
    }

    return t("app.subtitle.withBpm", {
      label: detectedBrusherProfile.label,
      bpm: Math.round(bpmData.searchBpm),
      secondsPerTooth: bpmData.secondsPerTooth,
      transitionSeconds: bpmData.transitionBufferSeconds,
      ageText: formatAgeDescription(t, effectiveAgeEstimate)
    });
  }, [bpmData, detectedBrusherProfile.description, detectedBrusherProfile.label, effectiveAgeEstimate, t]);

  function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs.toString().padStart(2, "0")}`;
  }

  const primaryBrushActionLabel =
    brushingPhase === "running" || brushingPhase === "countdown" || brushingPhase === "awaitingPlayback"
      ? t("brushing.pause")
      : brushingPhase === "paused"
        ? t("brushing.resume")
        : brushingPhase === "complete"
          ? t("brushing.again", { duration: formatTime(Number(bpmData?.totalBrushingSeconds || brushDurationSeconds)) })
          : t("brushing.start", { duration: formatTime(Number(bpmData?.totalBrushingSeconds || brushDurationSeconds)) });

  const showTopConsentNotices = workflowStep === "teeth";
  const requiresHouseholdSetup =
    appView === "brush" &&
    storageConsent === "granted" &&
    dbStatus.ready &&
    householdProfile?.householdId &&
    householdSetupDraft &&
    !householdOnboardingUiState?.dismissedAt &&
    !householdOnboardingState?.completedAt;
  const showHouseholdOverview =
    appView === "brush" &&
    storageConsent === "granted" &&
    dbStatus.ready &&
    householdOnboardingState?.completedAt &&
    householdOverview?.household;
  const showProgressDashboard =
    appView === "brush" &&
    storageConsent === "granted" &&
    dbStatus.ready &&
    householdOnboardingState?.completedAt &&
    activeHouseholdUser?.userId &&
    progressDashboard;
  const showHouseholdManagement =
    appView === "brush" &&
    storageConsent === "granted" &&
    dbStatus.ready &&
    householdOnboardingState?.completedAt &&
    householdManagement?.household;

  return (
    <main
      className={`app-shell ${device.isMobile ? "mobile-shell" : "desktop-shell"}${appView === "workshop" && !device.isMobile ? " workshop-shell" : ""} ${ageUiProfile.shellClassName} ${ageUiProfile.themeClassName}${ageSimulation.active ? " debug-simulation-active" : ""}`}
      style={ageUiProfile.cssVars}
    >
      {!(appView === "workshop" && !device.isMobile) && (
      <header className="app-header">
        <p className="eyebrow">
          <span>{t("app.eyebrow")}</span>
          {import.meta.env.VITE_GIT_SHA && (
            <span className="top-commit-id" aria-label="Build commit id">#{import.meta.env.VITE_GIT_SHA.substring(0, 7)}</span>
          )}
        </p>
        <h1>{device.isMobile ? t("app.title.mobile") : t("app.title.desktop")}</h1>
        <p>{subtitle}</p>
        <AgeThemePanel profile={ageUiProfile} className="header-age-theme-panel" />
        <p className={`mode-chip ${device.mode}`}>{device.isMobile ? t("common.layouts.mobile") : t("common.layouts.desktop")}</p>
        {ageSimulation.active && (
          <p className="simulation-chip" aria-live="polite">{t("settings.experienceSimulator.headerChip", { label: detectedBrusherProfile.label })}</p>
        )}
        <p className="geo-debug-chip" aria-live="polite">
          {t("app.geoDebug", {
            country: geoCountry?.country || "Unknown",
            countryCode: geoCountry?.countryCode || "--",
            ip: geoCountry?.ip || "unknown",
            source: geoCountry?.source || "pending"
          })}
        </p>
        <div className="header-utility-row">
          <button
            type="button"
            className={`header-utility-btn${showAgeExperienceLab ? " active" : ""}`}
            onClick={handleToggleAgeExperienceLab}
          >
            {showAgeExperienceLab ? t("common.buttons.hideAgeExperienceLab") : t("common.buttons.openAgeExperienceLab")}
          </button>
          <button
            type="button"
            className="header-utility-btn"
            onClick={() => setAppView((current) => (current === "story" ? "brush" : "story"))}
          >
            {appView === "story" ? "Return to brushing flow" : "My Story About the App"}
          </button>
          {!device.isMobile && (
            <>
              <button
                type="button"
                className="header-utility-btn"
                onClick={() => setAppView((current) => (current === "workshop" || current === "history" ? "brush" : "workshop"))}
              >
                {appView === "workshop" || appView === "history" ? "Return to brushing flow" : "Open translation workshop"}
              </button>
            </>
          )}
        </div>
      </header>
      )}

      {appView === "workshop" && !device.isMobile ? (
        <TranslationWorkshop
          initialTargetLanguage={workshopInitialLanguage}
          languageOptions={supportedLanguageOptions}
          onExit={() => setAppView("brush")}
        />
      ) : appView === "story" ? (
        <MyStoryPage onExit={() => setAppView("brush")} />
      ) : appView === "artists" ? (
        <ArtistPromoPage
          onExit={() => setAppView("brush")}
          onPreviewVideo={handlePreviewArtistVideo}
          profileLabel={detectedBrusherProfile?.label}
          activeUserName={activeHouseholdUser?.name}
        />
      ) : appView === "history" ? (
        <VersionHistory
          onExit={() => setAppView("brush")}
          onOpenStory={() => setAppView("story")}
        />
      ) : (
        <>
      <nav className={`workflow-tabs ${device.isMobile ? "mobile-workflow-tabs" : "desktop-workflow-tabs"}`} aria-label={t("app.workflow.ariaLabel")}>
          <button
            type="button"
            className={`workflow-tab${workflowStep === "teeth" ? " active" : ""}`}
            onClick={() => setWorkflowStep("teeth")}
          >
            {t("app.workflow.teeth")}
          </button>
          <button
            type="button"
            className={`workflow-tab${workflowStep === "music" ? " active" : ""}`}
            onClick={() => setWorkflowStep("music")}
          >
            {t("app.workflow.music")}
          </button>
          <button
            type="button"
            className={`workflow-tab${workflowStep === "brush" ? " active" : ""}`}
            onClick={() => setWorkflowStep("brush")}
          >
            {t("app.workflow.brush")}
          </button>
      </nav>

      <section className={`care-routine-strip ${ageUiProfile.themeClassName}${showCompactRoutine ? " compact" : ""}`} aria-label={t("app.routine.ariaLabel")}>
        <div className="care-routine-header">
          <div className="care-routine-copy">
            <strong>{t("app.routine.title")}</strong>
            <p>{t("app.routine.intro")}</p>
          </div>
          {isReturningVisitor && (
            <button
              type="button"
              className="care-routine-toggle"
              onClick={() => setIsRoutineExpanded((current) => !current)}
            >
              {isRoutineExpanded ? t("app.routine.collapse") : t("app.routine.expand")}
            </button>
          )}
        </div>
        {showCompactRoutine ? (
          <div className="care-routine-compact-layout">
            <article className="care-routine-card active compact-primary">
              <span className="care-routine-badge">{t("app.routine.available")}</span>
              <strong>{t("app.routine.brushing.title")}</strong>
              <p>{t("app.routine.brushing.description")}</p>
            </article>
            <div className="care-routine-mini-list" aria-label={t("app.routine.ariaLabel")}>
              <button
                type="button"
                className={`care-routine-mini-pill${expandedRoutineCard === "flossing" ? " active" : ""}`}
                onClick={() => setExpandedRoutineCard((c) => (c === "flossing" ? null : "flossing"))}
              >
                {t("app.routine.flossing.title")}
              </button>
              <button
                type="button"
                className={`care-routine-mini-pill${expandedRoutineCard === "waterPicking" ? " active" : ""}`}
                onClick={() => setExpandedRoutineCard((c) => (c === "waterPicking" ? null : "waterPicking"))}
              >
                {t("app.routine.waterPicking.title")}
              </button>
            </div>
            {expandedRoutineCard === "flossing" && (
              <article className="care-routine-card best-practice care-routine-expanded">
                <span className="care-routine-badge">{t("app.routine.bestPractice")}</span>
                <strong>{t("app.routine.flossing.title")}</strong>
                <p>{t("app.routine.flossing.description")}</p>
              </article>
            )}
            {expandedRoutineCard === "waterPicking" && (
              <article className="care-routine-card best-practice care-routine-expanded">
                <span className="care-routine-badge">{t("app.routine.bestPractice")}</span>
                <strong>{t("app.routine.waterPicking.title")}</strong>
                <p>{t("app.routine.waterPicking.description")}</p>
              </article>
            )}
          </div>
        ) : (
          <div className="care-routine-grid">
            <article className="care-routine-card active">
              <span className="care-routine-badge">{t("app.routine.available")}</span>
              <strong>{t("app.routine.brushing.title")}</strong>
              <p>{t("app.routine.brushing.description")}</p>
            </article>
            <article className="care-routine-card best-practice">
              <span className="care-routine-badge">{t("app.routine.bestPractice")}</span>
              <strong>{t("app.routine.flossing.title")}</strong>
              <p>{t("app.routine.flossing.description")}</p>
            </article>
            <article className="care-routine-card best-practice">
              <span className="care-routine-badge">{t("app.routine.bestPractice")}</span>
              <strong>{t("app.routine.waterPicking.title")}</strong>
              <p>{t("app.routine.waterPicking.description")}</p>
            </article>
          </div>
        )}
      </section>

      {languageFallbackState.needsSupportedLanguageChoice && (
        <section className="language-simulator-card" aria-label={t("settings.supportedLanguage.ariaLabel")}>
          <div className="language-simulator-copy">
            <strong>{t("settings.supportedLanguage.label")}</strong>
            <span>{t("settings.supportedLanguage.hint", { requestedLanguage: languageFallbackState.requestedLanguage || t("settings.supportedLanguage.unknownLanguage") })}</span>
          </div>
          <label className="language-simulator-control">
            <span>{t("settings.language")}</span>
            <select
              value={i18n.resolvedLanguage || i18n.language || "en"}
              onChange={(event) => handlePreferredLanguageChange(event.target.value)}
            >
              {supportedLanguageOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </section>
      )}

      {showTopConsentNotices && analyticsAvailable && analyticsConsent === "unknown" && (
        <section className="consent-banner" role="region" aria-label="Privacy controls">
          <p>
            {t("privacy.analyticsMessage")}
            <button type="button" className="privacy-link" onClick={openPrivacyModal}>
              {t("common.buttons.privacyPolicy")}
            </button>
          </p>
          <div className="consent-actions">
            <button type="button" className="action-btn" onClick={handleAcceptAnalytics}>
              {t("common.buttons.allowAnalytics")}
            </button>
            <button type="button" className="action-btn secondary" onClick={handleDeclineAnalytics}>
              {t("common.buttons.decline")}
            </button>
          </div>
        </section>
      )}

      {showTopConsentNotices && !storageBannerDismissed && (
        <section className="storage-banner" role="region" aria-label="Storage consent controls">
          <p>
            {t("privacy.storageMessage")}
            <button type="button" className="privacy-link" onClick={openPrivacyModal}>
              {t("common.buttons.privacyPolicy")}
            </button>
          </p>
          <div className="consent-actions">
            <button type="button" className="action-btn" onClick={() => setStorageToggleRequest("enable")}>
              {t("common.buttons.allowStorage")}
            </button>
            <button type="button" className="action-btn secondary" onClick={() => setStorageToggleRequest("disable")}>
              {t("common.buttons.optOut")}
            </button>
            <button type="button" className="action-btn secondary" onClick={handleDismissStorageBanner}>
              {t("common.buttons.dismiss")}
            </button>
          </div>
        </section>
      )}

      {migrationNotice?.kind === "imported-legacy-storage" && !error && <p className="info-banner">{t("app.migration.importedLegacyStorage")}</p>}
      {migrationNotice?.kind === "bootstrapped-household" && !error && <p className="info-banner">{t("app.migration.bootstrappedHousehold")}</p>}
      {migrationNotice?.kind === "migration-failed" && !error && <p className="error-banner">{t("app.migration.failedLegacyStorage")}</p>}

      {backendStatus && !error && <p className="info-banner">{backendStatus}</p>}
      {error && <p className="error-banner">{error}</p>}

      {requiresHouseholdSetup && (
        <HouseholdSetupPanel
          t={t}
          draft={householdSetupDraft}
          saving={householdSetupSaving}
          requiresMigrationReview={householdSetupDraft.reviewSource === "migration-review"}
          onDraftChange={handleHouseholdSetupDraftChange}
          onAdditionalMemberChange={handleAdditionalMemberChange}
          onAddMember={handleAddHouseholdMember}
          onRemoveMember={handleRemoveHouseholdMember}
          onDismiss={handleDismissHouseholdSetup}
          onSubmit={handleCompleteHouseholdSetup}
        />
      )}

      {showHouseholdOverview && (
        <HouseholdOverviewPanel
          t={t}
          overview={householdOverview}
          onSwitchUser={handleSwitchHouseholdUser}
        />
      )}

      {showProgressDashboard && (
        <ProgressDashboardPanel
          t={t}
          dashboard={progressDashboard}
          activeUserName={activeHouseholdUser?.name}
          filters={progressDashboardFilters}
          onFilterChange={handleProgressDashboardFilterChange}
          onLogActivity={handleLogRoutineActivity}
        />
      )}

      {showHouseholdManagement && (
        <HouseholdManagementPanel
          key={`${householdManagement.household.householdId}:${householdManagement.household.updatedAt || "household"}:${householdManagement.members.length}:${householdManagement.archivedMembers.length}`}
          t={t}
          management={householdManagement}
          activeUserId={activeHouseholdUser?.userId}
          saving={householdManagementSaving}
          saveNotice={householdManagementNotice}
          onSaveHousehold={handleSaveHouseholdSettings}
          onSaveMember={handleSaveHouseholdMember}
          onArchiveMember={handleArchiveHouseholdMember}
          onRestoreMember={handleRestoreHouseholdMember}
          onRemoveMember={handleDeleteHouseholdMember}
          onActivateMember={handleSwitchHouseholdUser}
        />
      )}

      {workflowStep === "teeth" && (
        <section className={`layout-grid ${device.isMobile ? "mobile-mode" : "desktop-mode desktop-step-layout"}`}>
          <BPMCalculator
            brusherProfile={detectedBrusherProfile}
            actualBrusherProfile={actualBrusherProfile}
            ageUiProfile={ageUiProfile}
            brushingHand={brushingHand}
            brushType={brushType}
            rotatingStartEnabled={rotatingStartEnabled}
            rotatingStartPersistStatus={rotatingStartPersistStatus}
            onBrushingHandChange={setBrushingHand}
            onBrushTypeChange={setBrushType}
            onRotatingStartEnabledChange={handleRotatingStartEnabledChange}
            brushDurationOptions={BRUSH_DURATION_OPTIONS}
            onBrushDurationChange={handleBrushDurationChange}
            isBrushControlsLocked={brushingPhase === "running" || brushingPhase === "countdown" || brushingPhase === "paused"}
            values={values}
            onChange={updateValue}
            onContinueToMusic={() => setWorkflowStep("music")}
            bpmData={bpmData}
            brushDurationSeconds={brushDurationSeconds}
            loading={loading.bpm}
            isMobile={device.isMobile}
            showSimulationControls={ageSimulationAvailable && showAgeExperienceLab}
            simulation={ageSimulation}
            onSimulationToggle={handleSimulationToggle}
            onSimulationChange={handleSimulationChange}
            onSimulationReset={handleSimulationReset}
            overlayThemeChoice={overlayThemeChoice}
            overlayThemeOptions={overlayThemeOptions}
            onOverlayThemeChange={handleOverlayThemeChange}
          />
          {showAgeExperienceLab && ageSimulation.active && simulationPreviewDashboard && (
            <div className="simulation-dashboard-shell">
              <ProgressDashboardPanel
                t={t}
                dashboard={simulationPreviewDashboard}
                activeUserName={t("settings.experienceSimulator.previewUser", { label: detectedBrusherProfile.label })}
                filters={progressDashboardFilters}
                onFilterChange={handleProgressDashboardFilterChange}
                onLogActivity={() => {}}
                readOnly
                previewLabel={t("settings.experienceSimulator.previewBadge")}
              />
            </div>
          )}
        </section>
      )}

      {workflowStep === "music" && (
        <section className={`layout-grid ${device.isMobile ? "mobile-mode" : "desktop-mode desktop-step-layout"}`}>
          {storageConsent === "granted" && (lastSession?.song || favoriteSongs.length > 0) && (
            <section className={`stored-picks-panel ${ageUiProfile.themeClassName}`} aria-live="polite">
              <strong>{t("music.favorites.title")}</strong>
              {lastSession?.song && (
                <div className="stored-pick-row">
                  <span>{t("music.favorites.lastSession", { title: lastSession.song.title, artist: lastSession.song.artist })}</span>
                  <button
                    type="button"
                    className={`action-btn secondary${queuedStoredSongKey === toSongKey(lastSession.song) ? " is-queued" : ""}`}
                    onClick={() => handleQueueStoredSong(lastSession.song, "lastSession")}
                  >
                    {queuedStoredSongKey === toSongKey(lastSession.song) ? t("common.buttons.queued") : t("common.buttons.queue")}
                  </button>
                </div>
              )}
              {favoriteSongs.slice(0, 8).map((song) => (
                <div key={`${song.title}-${song.artist}`} className="stored-pick-row">
                  <span>{song.title} - {song.artist}</span>
                  <div className="stored-pick-actions">
                    <button
                      type="button"
                      className={`action-btn secondary${queuedStoredSongKey === toSongKey(song) ? " is-queued" : ""}`}
                      onClick={() => handleQueueStoredSong(song, "favorites")}
                    >
                      {queuedStoredSongKey === toSongKey(song) ? t("common.buttons.queued") : t("common.buttons.queue")}
                    </button>
                    <button type="button" className="action-btn secondary" onClick={() => handleToggleFavoriteSong(song)}>{t("music.favorites.remove")}</button>
                  </div>
                </div>
              ))}
            </section>
          )}
          {songsDebugInfo?.queryUsed && (
            <section className="music-debug-chip" aria-live="polite">
              <strong>GetSongBPM + selection debug</strong>
              <p>
                selected={songsDebugInfo.selectedTitle || selectedSong?.title || "--"} | artist={songsDebugInfo.selectedArtist || selectedSong?.artist || "--"} | source={songsDebugInfo.selectionSource || "generated"}
              </p>
              <p>
                youtube match={songsDebugInfo.youtubeMatchedTitle || playerData?.title || "--"} | channel={songsDebugInfo.youtubeMatchedChannel || playerData?.channelTitle || "--"} | mode={songsDebugInfo.youtubeQueryMode || "direct-title-artist"}
              </p>
              <p>
                source={songsDebugInfo.source || "unknown"} | geo={songsDebugInfo.geoSource || "unknown"} | country={songsDebugInfo.contextUsed?.countryCode || "--"} | lang={songsDebugInfo.contextUsed?.browserLanguage || "--"} | age={songsDebugInfo.contextUsed?.ageBucket || "--"}
              </p>
              <p>
                q={songsDebugInfo.queryUsed}
              </p>
              <p>
                songs fetched={songsDebugInfo.fetchedCount ?? 0}, shown={songsDebugInfo.shownCount ?? 0}
              </p>
            </section>
          )}
          <SongList
            brusherProfile={detectedBrusherProfile}
            songs={songs}
            exhausted={isSongPoolExhausted}
            loading={loading.songs}
            tolerance={draftSongFilters.tolerance}
            danceability={draftSongFilters.danceability}
            acousticness={draftSongFilters.acousticness}
            keyword={keyword}
            isMobile={device.isMobile}
            onToleranceChange={(value) => updateDraftSongFilter("tolerance", value)}
            onDanceabilityChange={(value) => updateDraftSongFilter("danceability", value)}
            onAcousticnessChange={(value) => updateDraftSongFilter("acousticness", value)}
            onCommitTolerance={(value) => commitSongFilter("tolerance", value)}
            onCommitDanceability={(value) => commitSongFilter("danceability", value)}
            onCommitAcousticness={(value) => commitSongFilter("acousticness", value)}
            onKeywordChange={setKeyword}
            onSelectSong={handleSelectSong}
            onRegenerate={regenerateSongs}
            favorites={favoriteSongs}
            onToggleFavorite={handleToggleFavoriteSong}
          />
        </section>
      )}

      {workflowStep === "brush" && (
        <section ref={brushMapSectionRef} className={`layout-grid ${device.isMobile ? "mobile-mode" : "desktop-mode desktop-brush-layout"}`}>
          <section className={`card brush-actions-card ${ageUiProfile.themeClassName} ${device.isMobile ? "" : "desktop-step-card"}`.trim()}>
            <h2>{t("brushing.controlsTitle")}</h2>
            {selectedSong && (
              <>
                <p className="brush-selected-song">{t("brushing.selectedSong", { title: selectedSong.title, artist: selectedSong.artist })}</p>
                {queuedSongPreview && brushingPhase === "running" && (
                  <p className="brush-next-song">{t("brushing.upNext", { title: queuedSongPreview.title, artist: queuedSongPreview.artist })}</p>
                )}
              </>
            )}
            <WaterFlossingGuide
              toothCount={Number(values.top || 0) + Number(values.bottom || 0)}
              isMobile={device.isMobile}
            />
            {!device.isMobile && (
              <>
                {brushingPhase === "complete" && (
                  <section className="success-banner brush-success-banner" aria-live="polite">
                    <span className="sparkle-stars" aria-hidden="true">✦ ✧ ✦</span>
                    <p>{completionBannerMessage}</p>
                    <small>{t("app.successAgeGroups", { count: ageGroupCount })}</small>
                    <AchievementBadgeList
                      t={t}
                      achievements={recentUnlockedAchievements}
                      title={recentUnlockedAchievements.length > 0 ? t("app.achievements.unlockedTitle") : undefined}
                      compact
                    />
                  </section>
                )}
                <p className="timer-note">{t("brushing.timerNote")}</p>
              </>
            )}
          </section>

          <Player
            selectedSong={selectedSong}
            playerData={playerData}
            loading={loading.player}
            brushingPhase={brushingPhase}
            isMobile={device.isMobile}
            compactMobileFrame={device.isMobile && workflowStep === "brush"}
            showRestoredSessionBadge={device.isMobile && autoRestoredBrushView}
            autoplayToken={autoplayToken}
            playbackCommand={playerCommand}
            onPlaybackTick={handlePlaybackTick}
            onPlaybackDurationChange={handlePlaybackDurationChange}
            onSongEnded={handleSongEnded}
          >
            <>
              {device.isMobile && (
                <div className="session-actions compact-mobile-actions">
                  <button
                    type="button"
                    className="action-btn"
                    onClick={handlePrimaryBrushAction}
                  >
                    {primaryBrushActionLabel}
                  </button>
                  <button type="button" className="action-btn secondary" onClick={restartBrushing}>
                    {t("brushing.stop")}
                  </button>
                </div>
              )}
              <BrushingGuide
                key={`guide-embedded-${device.isMobile ? "mobile" : "desktop"}-${values.top}-${values.bottom}-${brushDurationSeconds}`}
                bpmData={bpmData}
                timer={timer}
                brushingPhase={brushingPhase}
                values={values}
                selectedBpm={selectedBrushBpm}
                isMobile={device.isMobile}
                playbackSeconds={playbackSeconds}
                brushingMusicElapsedSeconds={brushingMusicElapsedSeconds}
                startCountdownTotalMs={START_DELAY_SECONDS * 1000}
                startCountdownRemainingMs={countdownRemainingMs}
                sessionStartSegmentKey={sessionStartSegmentKey}
                brushingHand={brushingHand}
                brushType={brushType}
                hideIntro
                onCueChange={setBrushControlCue}
                completionMessage={completionMessage}
                brushControlCue={brushControlCue}
                primaryBrushActionLabel={primaryBrushActionLabel}
                onPrimaryBrushAction={handlePrimaryBrushAction}
                onRestartBrushing={restartBrushing}
                ageUiProfile={ageUiProfile}
                embedded
                showThemePanel={false}
              />
              {device.isMobile && brushingPhase === "complete" && (
                <section className="success-banner brush-success-banner" aria-live="polite">
                  <span className="sparkle-stars" aria-hidden="true">✦ ✧ ✦</span>
                  <p>{completionBannerMessage}</p>
                  <small>{t("app.successAgeGroups", { count: ageGroupCount })}</small>
                  <AchievementBadgeList
                    t={t}
                    achievements={recentUnlockedAchievements}
                    title={recentUnlockedAchievements.length > 0 ? t("app.achievements.unlockedTitle") : undefined}
                    compact
                  />
                </section>
              )}
            </>
          </Player>
        </section>
      )}
        </>
      )}

      <footer className="credit-strip" id="credit">
        <p>
          {t("footer.poweredBy")}
          <a href="https://getsongbpm.com" target="_blank" rel="noreferrer">
            GetSongBPM
          </a>
        </p>
        {analyticsAvailable && (
          <div className="privacy-controls">
            <span>{t("footer.analytics", { state: analyticsConsent === "granted" ? t("common.states.on") : t("common.states.off") })}</span>
            <button type="button" className="privacy-toggle" onClick={openPrivacyModal}>
              {t("common.buttons.privacyPolicy")}
            </button>
            {analyticsConsent === "granted" ? (
              <button type="button" className="privacy-toggle" onClick={handleDeclineAnalytics}>
                {t("common.buttons.turnOff")}
              </button>
            ) : (
              <button type="button" className="privacy-toggle" onClick={handleAcceptAnalytics}>
                {t("common.buttons.turnOn")}
              </button>
            )}
          </div>
        )}
        <div className="privacy-controls">
          <button
            type="button"
            className="privacy-toggle"
            onClick={() => setAppView((current) => (current === "artists" ? "brush" : "artists"))}
          >
            {appView === "artists" ? "Return to brushing flow" : "For Artists"}
          </button>
          <span>{t("footer.sessionStorage", { state: storageConsent === "granted" ? t("common.states.on") : t("common.states.off") })}</span>
          {storageConsent === "granted" ? (
            <button type="button" className="privacy-toggle" onClick={() => setStorageToggleRequest("disable")}>
              {t("common.buttons.turnOff")}
            </button>
          ) : (
            <button type="button" className="privacy-toggle" onClick={() => setStorageToggleRequest("enable")}>
              {t("common.buttons.turnOn")}
            </button>
          )}
          {storageConsent === "granted" && dbStatus.ready && householdProfile?.householdId && !householdOnboardingState?.completedAt && (
            <button type="button" className="privacy-toggle" onClick={handleReopenHouseholdSetup}>
              {t("common.buttons.householdSetup")}
            </button>
          )}
          <button type="button" className="privacy-toggle" onClick={openStorageInfoModal}>
            {t("common.buttons.storageNotice")}
          </button>
          <button type="button" className="privacy-toggle" onClick={() => setAppView("history")}>
            {t("common.buttons.versionHistory")}
          </button>
          <button
            type="button"
            className="privacy-toggle"
            onClick={() => setAppView((current) => (current === "story" ? "brush" : "story"))}
          >
            {appView === "story" ? "Return to brushing flow" : "About the Developer"}
          </button>
        </div>
        {storageToggleNotice && <p className="storage-toggle-notice" aria-live="polite">{storageToggleNotice}</p>}
      </footer>

      {storageToggleRequest && (
        <div className="privacy-modal-overlay" role="presentation" onClick={handleCancelStorageToggle}>
          <section
            className="privacy-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Session storage confirmation"
            onClick={(event) => event.stopPropagation()}
          >
            <h2>Confirm Session Storage Change</h2>
            {storageToggleRequest === "enable" ? (
              <>
                <p>
                  Turning this on stores your preferences, recent session, and favorite songs on this device so your experience can resume quickly.
                </p>
                <p>
                  This can include playback choices and profile-related settings used to personalize brushing flow.
                </p>
              </>
            ) : (
              <>
                <p>
                  Turning this off clears locally saved preferences, recent session data, and favorites for this browser.
                </p>
                <p>
                  You can still use BrushBeats, but personalization and restore features will be limited until storage is re-enabled.
                </p>
              </>
            )}
            <div className="privacy-modal-actions">
              <button type="button" className="action-btn secondary" onClick={handleCancelStorageToggle}>
                Cancel
              </button>
              <button type="button" className="action-btn" onClick={handleConfirmStorageToggle}>
                {storageToggleRequest === "enable" ? "Enable session storage" : "Disable session storage"}
              </button>
            </div>
          </section>
        </div>
      )}

      {activeModal && (
        <div className="privacy-modal-overlay" role="presentation" onClick={closePrivacyModal}>
          <section
            className="privacy-modal"
            role="dialog"
            aria-modal="true"
            aria-label={activeModal === "privacy" ? t("privacy.modalTitle") : t("privacy.storageModalTitle")}
            onClick={(event) => event.stopPropagation()}
          >
            <h2>{activeModal === "privacy" ? t("privacy.modalTitle") : t("privacy.storageModalTitle")}</h2>
            {activeModal === "privacy" ? (
              <>
                <p>{t("privacy.modalBody1")}</p>
                <p>{t("privacy.modalBody2")}</p>
                <p>{t("privacy.modalBody3")}</p>
                <p>{t("privacy.modalBody4")}</p>
              </>
            ) : (
              <>
                <p>{t("privacy.storageModalBody1")}</p>
                <p>{t("privacy.storageModalBody2")}</p>
                <p>{t("privacy.storageModalBody3")}</p>
                <p>{t("privacy.storageModalBody4")}</p>
              </>
            )}
            <div className="privacy-modal-actions">
              <button type="button" className="action-btn secondary" onClick={closePrivacyModal}>
                {t("common.buttons.close")}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

export default App;
