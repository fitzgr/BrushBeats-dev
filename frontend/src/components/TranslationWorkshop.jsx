import { useEffect, useMemo, useState } from "react";
import { getAdminLocale, saveAdminLocale } from "../api/client";
import { buildAgeEstimateFromActualAge } from "../lib/teethAge";

const ADMIN_SESSION_KEY = "brushbeats_workshop_password";
const ADMIN_WORKSHOP_STATE_COOKIE = "brushbeats_workshop_state";
const WORKFLOW_TABS = [
  { id: "teeth", label: "1. Teeth" },
  { id: "music", label: "2. Music" },
  { id: "brush", label: "3. Brush" }
];
const WORKFLOW_PREFIXES = {
  teeth: ["app.", "settings.", "age.", "privacy.", "errors.", "footer.", "common."],
  music: ["music.", "player.", "app.", "footer.", "common.", "errors."],
  brush: ["brushing.", "player.", "app.", "footer.", "common.", "privacy.", "errors."]
};
const ADMIN_PASSWORD_HINT = "Set ADMIN_WORKSHOP_PASSWORD in .env";

const SAMPLE_VALUES = {
  ageText: "About 6-8 years old",
  artist: "Dua Lipa",
  bpm: 120,
  bottom: 12,
  count: 24,
  description: "Mixed Dentition",
  duration: "2:00",
  fromJaw: "top",
  fromLabel: "Front Top Left",
  fromSide: "left",
  hand: "right",
  label: "Mixed Dentition",
  max: 8,
  min: 6,
  minutes: 2,
  motion: "Brush down away from the gums",
  name: "first molar",
  number: 14,
  position: 4,
  quadrant: "Top Left",
  requestedLanguage: "French",
  seconds: 3,
  secondsPerTooth: 3,
  size: 8,
  state: "Brushing in progress",
  title: "Levitating",
  toJaw: "bottom",
  toLabel: "Front Bottom Left",
  toothLabel: "Tooth 14: first molar",
  toSide: "right",
  top: 12,
  totalTeeth: 24,
  toothTime: 96,
  transitionSeconds: 2,
  transitionTime: 24,
  unit: "years",
  value: 7
};

const DEFAULT_WORKSHOP_AGE_SIMULATION = {
  enabled: false,
  value: 7,
  unit: "years"
};

function formatWorkshopAgeText(ageEstimate) {
  if (!ageEstimate) {
    return SAMPLE_VALUES.ageText;
  }

  if (ageEstimate.unit === "months") {
    return `${ageEstimate.exactAge} months old`;
  }

  return `${ageEstimate.exactAge} years old`;
}

function buildWorkshopSampleValues(ageSimulation) {
  const ageEstimate = ageSimulation?.enabled
    ? buildAgeEstimateFromActualAge(ageSimulation.value, ageSimulation.unit)
    : null;

  const phase = ageEstimate?.phase || "mixed";
  const presetByPhase = {
    infant: {
      ageText: formatWorkshopAgeText(ageEstimate),
      artist: "The Wiggles",
      bpm: 96,
      bottom: 3,
      count: 6,
      description: "Infant Teeth",
      label: "Infant Teeth",
      top: 3,
      totalTeeth: 6
    },
    toddler: {
      ageText: formatWorkshopAgeText(ageEstimate),
      artist: "Raffi",
      bpm: 104,
      bottom: 8,
      count: 16,
      description: "Toddler Teeth",
      label: "Toddler Teeth",
      top: 8,
      totalTeeth: 16
    },
    primary: {
      ageText: formatWorkshopAgeText(ageEstimate),
      artist: "Kidz Bop",
      bpm: 112,
      bottom: 10,
      count: 20,
      description: "Primary Teeth",
      label: "Primary Teeth",
      top: 10,
      totalTeeth: 20
    },
    mixed: {
      ageText: formatWorkshopAgeText(ageEstimate) || SAMPLE_VALUES.ageText,
      artist: "Dua Lipa",
      bpm: 120,
      bottom: 12,
      count: 24,
      description: "Mixed Dentition",
      label: "Mixed Dentition",
      top: 12,
      totalTeeth: 24
    },
    adult: {
      ageText: formatWorkshopAgeText(ageEstimate),
      artist: "Harry Styles",
      bpm: 128,
      bottom: 16,
      count: 32,
      description: "Full Adult Smile",
      label: "Full Adult Smile",
      top: 16,
      totalTeeth: 32
    }
  };

  const preset = presetByPhase[phase] || presetByPhase.mixed;

  return {
    ...SAMPLE_VALUES,
    ...preset,
    min: ageEstimate?.exactAge ?? SAMPLE_VALUES.min,
    max: ageEstimate?.exactAge ?? SAMPLE_VALUES.max,
    unit: ageEstimate?.unit || SAMPLE_VALUES.unit,
    value: ageEstimate?.exactAge ?? SAMPLE_VALUES.value,
    phase,
    simulationEnabled: Boolean(ageSimulation?.enabled)
  };
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function flattenTranslations(value, prefix = "", result = {}) {
  if (!isPlainObject(value)) {
    return result;
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    const nextPath = prefix ? `${prefix}.${key}` : key;
    if (typeof nestedValue === "string") {
      result[nextPath] = nestedValue;
    } else if (isPlainObject(nestedValue)) {
      flattenTranslations(nestedValue, nextPath, result);
    }
  }

  return result;
}

function expandTranslations(flattenedEntries) {
  const root = {};

  for (const [path, value] of Object.entries(flattenedEntries)) {
    const parts = path.split(".");
    let cursor = root;

    for (let index = 0; index < parts.length - 1; index += 1) {
      const part = parts[index];
      if (!isPlainObject(cursor[part])) {
        cursor[part] = {};
      }
      cursor = cursor[part];
    }

    cursor[parts[parts.length - 1]] = value;
  }

  return root;
}

function interpolateTemplate(template, sampleValues = SAMPLE_VALUES) {
  return String(template || "").replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, token) => {
    const trimmedToken = token.trim();
    return sampleValues[trimmedToken] ?? `{{${trimmedToken}}}`;
  });
}

function downloadJson(filename, text) {
  const blob = new Blob([text], { type: "application/json" });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}

function readStoredPassword() {
  try {
    return typeof window !== "undefined" ? window.sessionStorage.getItem(ADMIN_SESSION_KEY) || "" : "";
  } catch {
    return "";
  }
}

function storePassword(password) {
  try {
    if (typeof window === "undefined") {
      return;
    }

    if (password) {
      window.sessionStorage.setItem(ADMIN_SESSION_KEY, password);
    } else {
      window.sessionStorage.removeItem(ADMIN_SESSION_KEY);
    }
  } catch {
    // Ignore session storage failures.
  }
}

function readCookie(name) {
  if (typeof document === "undefined") {
    return "";
  }

  const prefix = `${name}=`;
  const parts = document.cookie.split(";").map((value) => value.trim());
  const match = parts.find((part) => part.startsWith(prefix));
  return match ? decodeURIComponent(match.slice(prefix.length)) : "";
}

function writeCookie(name, value, maxAgeSeconds = 60 * 60 * 24 * 30) {
  if (typeof document === "undefined") {
    return;
  }

  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAgeSeconds}; SameSite=Lax`;
}

function deleteCookie(name) {
  if (typeof document === "undefined") {
    return;
  }

  document.cookie = `${name}=; path=/; max-age=0; SameSite=Lax`;
}

function readStoredWorkshopState() {
  try {
    const rawValue = readCookie(ADMIN_WORKSHOP_STATE_COOKIE);
    return rawValue ? JSON.parse(rawValue) : {};
  } catch {
    return {};
  }
}

function writeStoredWorkshopState(state) {
  writeCookie(ADMIN_WORKSHOP_STATE_COOKIE, JSON.stringify(state));
}

function formatSectionLabel(section) {
  return section
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^[a-z]/, (match) => match.toUpperCase());
}

function formatTimestamp(timestamp) {
  if (!timestamp) {
    return "Not saved yet";
  }

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return "Not saved yet";
  }

  return date.toLocaleString();
}

function matchesWorkflow(path, workflow) {
  return WORKFLOW_PREFIXES[workflow].some((prefix) => path.startsWith(prefix));
}

function matchesSearch(path, englishValue, targetValue, normalizedSearch) {
  if (!normalizedSearch) {
    return true;
  }

  return `${path}\n${englishValue}\n${targetValue}`.toLowerCase().includes(normalizedSearch);
}

function labelForLanguage(language, languageOptions) {
  return languageOptions.find((option) => option.value === language)?.label || language.toUpperCase();
}

function buildPreviewReader(entries, fallbackEntries, sampleValues) {
  return (path) => interpolateTemplate(entries[path] || fallbackEntries[path] || path, sampleValues);
}

function CopyText({
  path,
  read,
  onSelect,
  selectedPath,
  interactive = true,
  as = "span",
  textClassName = "",
  wrapperClassName = "",
  title
}) {
  const Component = as;
  const activeClassName = selectedPath === path ? " active" : "";
  const readOnlyClassName = interactive ? "" : " readonly";

  return (
    <button
      type="button"
      className={`workshop-copy-hit${activeClassName}${readOnlyClassName}${wrapperClassName ? ` ${wrapperClassName}` : ""}`}
      onClick={interactive ? () => onSelect(path) : undefined}
      disabled={!interactive}
      title={title || path}
    >
      <Component className={textClassName}>{read(path)}</Component>
    </button>
  );
}

function CopyAction({ path, read, onSelect, selectedPath, className, title, interactive = true }) {
  const activeClassName = selectedPath === path ? " active" : "";
  const readOnlyClassName = interactive ? "" : " readonly";

  return (
    <button
      type="button"
      className={`workshop-copy-hit workshop-copy-action ${className}${activeClassName}${readOnlyClassName}`}
      onClick={interactive ? () => onSelect(path) : undefined}
      disabled={!interactive}
      title={title || path}
    >
      {read(path)}
    </button>
  );
}

function WorkflowTabs({ activeWorkflow, onSelect, className = "translation-workflow-tabs", tabClassName = "translation-workflow-tab", interactive = true }) {
  return (
    <nav className={className} aria-label="Workshop workflow tabs">
      {WORKFLOW_TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={`${tabClassName}${activeWorkflow === tab.id ? " active" : ""}`}
          onClick={interactive ? () => onSelect(tab.id) : undefined}
          disabled={!interactive}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}

function TeethScreen({ read, selectedPath, onSelectPath, interactive, sampleValues }) {
  return (
    <>
      <section className="workshop-phone-hero">
        <CopyText path="app.eyebrow" read={read} onSelect={onSelectPath} selectedPath={selectedPath} interactive={interactive} textClassName="workshop-phone-eyebrow" wrapperClassName="inline-hit" />
        <CopyText path="app.title.mobile" read={read} onSelect={onSelectPath} selectedPath={selectedPath} interactive={interactive} as="h3" />
        <CopyText path="app.subtitle.withBpm" read={read} onSelect={onSelectPath} selectedPath={selectedPath} interactive={interactive} as="p" />
        <CopyText path="app.status.label" read={read} onSelect={onSelectPath} selectedPath={selectedPath} interactive={interactive} textClassName="workshop-phone-status-chip" wrapperClassName="inline-hit" />
      </section>

      <section className="workshop-preview-card workshop-preview-routine">
        <CopyText path="app.routine.title" read={read} onSelect={onSelectPath} selectedPath={selectedPath} interactive={interactive} as="strong" />
        <div className="workshop-preview-routine-grid">
          <article className="workshop-preview-routine-item active">
            <CopyText path="app.routine.available" read={read} onSelect={onSelectPath} selectedPath={selectedPath} interactive={interactive} as="span" />
            <CopyText path="app.routine.brushing.title" read={read} onSelect={onSelectPath} selectedPath={selectedPath} interactive={interactive} as="strong" />
          </article>
          <article className="workshop-preview-routine-item">
            <CopyText path="app.routine.comingSoon" read={read} onSelect={onSelectPath} selectedPath={selectedPath} interactive={interactive} as="span" />
            <CopyText path="app.routine.flossing.title" read={read} onSelect={onSelectPath} selectedPath={selectedPath} interactive={interactive} as="strong" />
          </article>
          <article className="workshop-preview-routine-item">
            <CopyText path="app.routine.comingSoon" read={read} onSelect={onSelectPath} selectedPath={selectedPath} interactive={interactive} as="span" />
            <CopyText path="app.routine.waterPicking.title" read={read} onSelect={onSelectPath} selectedPath={selectedPath} interactive={interactive} as="strong" />
          </article>
        </div>
      </section>

      <section className="workshop-preview-notice fallback">
        <CopyText path="app.languageFallbackNotice" read={read} onSelect={onSelectPath} selectedPath={selectedPath} interactive={interactive} as="strong" />
        <CopyText path="settings.supportedLanguage.hint" read={read} onSelect={onSelectPath} selectedPath={selectedPath} interactive={interactive} as="p" />
      </section>

      <section className="workshop-preview-notice storage">
        <CopyText path="common.buttons.allowStorage" read={read} onSelect={onSelectPath} selectedPath={selectedPath} interactive={interactive} as="strong" />
        <div className="workshop-preview-pill-row">
          <CopyAction path="common.buttons.allowStorage" read={read} onSelect={onSelectPath} selectedPath={selectedPath} interactive={interactive} className="workshop-preview-secondary" />
          <CopyAction path="common.buttons.dismiss" read={read} onSelect={onSelectPath} selectedPath={selectedPath} interactive={interactive} className="workshop-preview-secondary" />
        </div>
      </section>

      <section className="workshop-preview-notice analytics">
        <CopyText path="common.buttons.allowAnalytics" read={read} onSelect={onSelectPath} selectedPath={selectedPath} as="strong" />
        <div className="workshop-preview-pill-row">
          <CopyAction path="common.buttons.allowAnalytics" read={read} onSelect={onSelectPath} selectedPath={selectedPath} className="workshop-preview-secondary" />
          <CopyAction path="common.buttons.decline" read={read} onSelect={onSelectPath} selectedPath={selectedPath} className="workshop-preview-secondary" />
        </div>
      </section>

      <section className="workshop-preview-card workshop-preview-inputs">
        <CopyText path="settings.resultsTitleMobile" read={read} onSelect={onSelectPath} selectedPath={selectedPath} as="strong" />
        <CopyText path="settings.topBottomIntroMobile" read={read} onSelect={onSelectPath} selectedPath={selectedPath} as="p" />
        {sampleValues?.simulationEnabled && (
          <section className="workshop-preview-notice info workshop-preview-age-lab">
            <CopyText path="settings.experienceSimulator.previewTitle" read={read} onSelect={onSelectPath} selectedPath={selectedPath} as="strong" />
            <CopyText path="settings.experienceSimulator.previewBody" read={read} onSelect={onSelectPath} selectedPath={selectedPath} as="p" />
          </section>
        )}
        <CopyText path="settings.topTeeth" read={read} onSelect={onSelectPath} selectedPath={selectedPath} as="strong" />
        <div className="workshop-preview-slider" />
        <CopyText path="settings.bottomTeeth" read={read} onSelect={onSelectPath} selectedPath={selectedPath} as="strong" />
        <div className="workshop-preview-slider soft" />
        <CopyText path="settings.headlineCalculated" read={read} onSelect={onSelectPath} selectedPath={selectedPath} as="p" />
        <CopyText path="settings.formNote" read={read} onSelect={onSelectPath} selectedPath={selectedPath} as="small" />
        <div className="workshop-preview-next-step">
          <CopyText path="settings.nextStepTitle" read={read} onSelect={onSelectPath} selectedPath={selectedPath} as="strong" />
          <CopyText path="settings.nextStepDescription" read={read} onSelect={onSelectPath} selectedPath={selectedPath} as="span" />
          <CopyAction path="common.buttons.continueToMusic" read={read} onSelect={onSelectPath} selectedPath={selectedPath} className="workshop-preview-primary full-width" />
        </div>
      </section>

      <section className="workshop-preview-footer compact">
        <CopyText path="footer.poweredBy" read={read} onSelect={onSelectPath} selectedPath={selectedPath} as="p" title="footer.poweredBy" />
      </section>
    </>
  );
}

function MusicScreen({ read, selectedPath, onSelectPath, sampleValues }) {
  return (
    <>
      <section className="workshop-phone-hero compact-hero">
        <CopyText path="app.eyebrow" read={read} onSelect={onSelectPath} selectedPath={selectedPath} textClassName="workshop-phone-eyebrow" wrapperClassName="inline-hit" />
        <CopyText path="music.resultsTitleMobile" read={read} onSelect={onSelectPath} selectedPath={selectedPath} as="h3" />
        <CopyText path="music.introMobile" read={read} onSelect={onSelectPath} selectedPath={selectedPath} as="p" />
      </section>

      <section className="workshop-preview-notice session">
        <CopyText path="app.lastSession.summary" read={read} onSelect={onSelectPath} selectedPath={selectedPath} as="p" />
        <CopyAction path="common.buttons.repeatLastSession" read={read} onSelect={onSelectPath} selectedPath={selectedPath} className="workshop-preview-secondary full-width" />
      </section>

      <section className="workshop-preview-notice info">
        <CopyText path="app.backendStatus.waking" read={read} onSelect={onSelectPath} selectedPath={selectedPath} as="p" />
      </section>

      <section className="workshop-preview-card workshop-preview-music">
        <CopyText path="music.resultsTitleMobile" read={read} onSelect={onSelectPath} selectedPath={selectedPath} as="strong" />
        <CopyText path="music.introMobile" read={read} onSelect={onSelectPath} selectedPath={selectedPath} as="p" />
        <CopyText path="music.noteMobile" read={read} onSelect={onSelectPath} selectedPath={selectedPath} as="small" />
        {sampleValues?.simulationEnabled && (
          <CopyText path="settings.experienceSimulator.headerChip" read={read} onSelect={onSelectPath} selectedPath={selectedPath} as="span" textClassName="workshop-preview-age-chip" wrapperClassName="inline-hit" />
        )}
        <div className="workshop-preview-metric-grid">
          <CopyText path="music.tolerance" read={read} onSelect={onSelectPath} selectedPath={selectedPath} as="span" wrapperClassName="metric-hit" />
          <CopyText path="music.danceability" read={read} onSelect={onSelectPath} selectedPath={selectedPath} as="span" wrapperClassName="metric-hit" />
          <CopyText path="music.acousticness" read={read} onSelect={onSelectPath} selectedPath={selectedPath} as="span" wrapperClassName="metric-hit" />
        </div>
        <div className="workshop-preview-search">
          <CopyText path="music.searchBy" read={read} onSelect={onSelectPath} selectedPath={selectedPath} as="span" />
          <CopyText path="music.searchPlaceholder" read={read} onSelect={onSelectPath} selectedPath={selectedPath} as="span" wrapperClassName="workshop-copy-input" />
        </div>
        <div className="workshop-preview-song">
          <div>
            <span>{SAMPLE_VALUES.title}</span>
            <small>{SAMPLE_VALUES.artist}</small>
          </div>
          <CopyAction path="common.buttons.queue" read={read} onSelect={onSelectPath} selectedPath={selectedPath} className="workshop-preview-primary" />
        </div>
        <CopyAction path="common.buttons.regenerateSongs" read={read} onSelect={onSelectPath} selectedPath={selectedPath} className="workshop-preview-secondary full-width" />
      </section>

      <section className="workshop-preview-card workshop-preview-player">
        <CopyText path="player.titleMobile" read={read} onSelect={onSelectPath} selectedPath={selectedPath} as="strong" />
        <CopyText path="player.introMobile" read={read} onSelect={onSelectPath} selectedPath={selectedPath} as="p" />
        <div className="workshop-preview-video-frame">{SAMPLE_VALUES.title} · {SAMPLE_VALUES.artist}</div>
        <CopyText path="player.runningStatus" read={read} onSelect={onSelectPath} selectedPath={selectedPath} as="small" />
      </section>

      <section className="workshop-preview-footer compact">
        <CopyText path="footer.poweredBy" read={read} onSelect={onSelectPath} selectedPath={selectedPath} as="p" title="footer.poweredBy" />
      </section>
    </>
  );
}

function BrushScreen({ read, selectedPath, onSelectPath, sampleValues }) {
  return (
    <>
      <section className="workshop-phone-hero compact-hero">
        <CopyText path="app.eyebrow" read={read} onSelect={onSelectPath} selectedPath={selectedPath} textClassName="workshop-phone-eyebrow" wrapperClassName="inline-hit" />
        <CopyText path="brushing.controlsTitle" read={read} onSelect={onSelectPath} selectedPath={selectedPath} as="h3" />
        <CopyText path="brushing.controlsIntro" read={read} onSelect={onSelectPath} selectedPath={selectedPath} as="p" />
        <CopyText path="app.status.label" read={read} onSelect={onSelectPath} selectedPath={selectedPath} textClassName="workshop-phone-status-chip" wrapperClassName="inline-hit" />
      </section>

      <section className="workshop-preview-card workshop-preview-player">
        <CopyText path="player.titleMobile" read={read} onSelect={onSelectPath} selectedPath={selectedPath} as="strong" />
        <div className="workshop-preview-video-frame">{SAMPLE_VALUES.title} · {SAMPLE_VALUES.artist}</div>
        <CopyText path="player.runningStatus" read={read} onSelect={onSelectPath} selectedPath={selectedPath} as="small" />
      </section>

      <section className="workshop-preview-card workshop-preview-brush">
        <CopyText path="brushing.controlsTitle" read={read} onSelect={onSelectPath} selectedPath={selectedPath} as="strong" />
        {sampleValues?.simulationEnabled && (
          <CopyText path="settings.experienceSimulator.headerChip" read={read} onSelect={onSelectPath} selectedPath={selectedPath} as="span" textClassName="workshop-preview-age-chip" wrapperClassName="inline-hit" />
        )}
        <CopyText path="brushing.selectedSong" read={read} onSelect={onSelectPath} selectedPath={selectedPath} as="span" textClassName="workshop-preview-selected-song" />
        <div className="workshop-preview-option-grid">
          <CopyText path="brushing.handPreference" read={read} onSelect={onSelectPath} selectedPath={selectedPath} as="span" wrapperClassName="option-hit" />
          <CopyText path="brushing.duration" read={read} onSelect={onSelectPath} selectedPath={selectedPath} as="span" wrapperClassName="option-hit" />
        </div>
        <div className="workshop-preview-cue">
          <CopyText path="brushing.readyTitle" read={read} onSelect={onSelectPath} selectedPath={selectedPath} as="strong" />
          <CopyText path="brushing.readyDetail" read={read} onSelect={onSelectPath} selectedPath={selectedPath} as="p" />
        </div>
        <CopyAction path="brushing.start" read={read} onSelect={onSelectPath} selectedPath={selectedPath} className="workshop-preview-primary" />
        <CopyAction path="brushing.stop" read={read} onSelect={onSelectPath} selectedPath={selectedPath} className="workshop-preview-secondary" />
        <CopyText path="brushing.timerNote" read={read} onSelect={onSelectPath} selectedPath={selectedPath} as="small" />
      </section>

      <section className="workshop-preview-card workshop-preview-guide">
        <CopyText path="brushing.guide.title" read={read} onSelect={onSelectPath} selectedPath={selectedPath} as="strong" />
        <CopyText path="brushing.guide.introMobile" read={read} onSelect={onSelectPath} selectedPath={selectedPath} as="p" />
        <div className="workshop-preview-guide-board">
          <div className="workshop-preview-mouth" />
          <div className="workshop-preview-guide-legend">
            <CopyText path="brushing.guide.legendFront" read={read} onSelect={onSelectPath} selectedPath={selectedPath} as="span" wrapperClassName="legend-hit" />
            <CopyText path="brushing.guide.legendBack" read={read} onSelect={onSelectPath} selectedPath={selectedPath} as="span" wrapperClassName="legend-hit" />
          </div>
        </div>
        <CopyText path="brushing.guide.handOrientation" read={read} onSelect={onSelectPath} selectedPath={selectedPath} as="span" textClassName="workshop-preview-orientation" />
        <CopyText path="brushing.guide.activeOrientation" read={read} onSelect={onSelectPath} selectedPath={selectedPath} as="small" />
        <div className="workshop-preview-cue brushing">
          <CopyText path="brushing.cue.activeTitle" read={read} onSelect={onSelectPath} selectedPath={selectedPath} as="strong" />
          <CopyText path="brushing.cue.activeDetail" read={read} onSelect={onSelectPath} selectedPath={selectedPath} as="p" />
        </div>
        <CopyText path="brushing.guide.activeToothName" read={read} onSelect={onSelectPath} selectedPath={selectedPath} as="p" />
        <CopyText path="brushing.guide.activeCalloutMobile" read={read} onSelect={onSelectPath} selectedPath={selectedPath} as="small" />
      </section>

      <CopyText path="app.success" read={read} onSelect={onSelectPath} selectedPath={selectedPath} as="section" textClassName="workshop-preview-success" wrapperClassName="block-hit no-frame" />

      <section className="workshop-modal-preview">
        <CopyText path="privacy.storageModalTitle" read={read} onSelect={onSelectPath} selectedPath={selectedPath} as="strong" />
        <CopyText path="privacy.storageModalBody1" read={read} onSelect={onSelectPath} selectedPath={selectedPath} as="p" />
        <CopyText path="privacy.storageModalBody2" read={read} onSelect={onSelectPath} selectedPath={selectedPath} as="p" />
      </section>
    </>
  );
}

function WorkshopPhone({
  languageLabel,
  entries,
  fallbackEntries,
  selectedPath,
  onSelectPath,
  activeWorkflow,
  onSelectWorkflow,
  interactive = true,
  helperLabel = "Click any string",
  sampleValues = SAMPLE_VALUES
}) {
  const read = useMemo(() => buildPreviewReader(entries, fallbackEntries, sampleValues), [entries, fallbackEntries, sampleValues]);

  return (
    <article className={`workshop-phone-card${interactive ? "" : " readonly-preview"}`}>
      <header className="workshop-phone-meta">
        <strong>{languageLabel}</strong>
        <span>{helperLabel}</span>
      </header>
      <WorkflowTabs
        activeWorkflow={activeWorkflow}
        onSelect={onSelectWorkflow}
        className="workshop-phone-tabs"
        tabClassName="workshop-phone-tab"
        interactive={interactive}
      />
      <div className="workshop-phone-shell expanded">
        <div className="workshop-phone-notch" />
        <div className={`workshop-phone-screen phase-${sampleValues.phase || "mixed"}${sampleValues.simulationEnabled ? " simulated-age" : ""}`}>
          {activeWorkflow === "teeth" && <TeethScreen read={read} selectedPath={selectedPath} onSelectPath={onSelectPath} interactive={interactive} sampleValues={sampleValues} />}
          {activeWorkflow === "music" && <MusicScreen read={read} selectedPath={selectedPath} onSelectPath={onSelectPath} interactive={interactive} sampleValues={sampleValues} />}
          {activeWorkflow === "brush" && <BrushScreen read={read} selectedPath={selectedPath} onSelectPath={onSelectPath} interactive={interactive} sampleValues={sampleValues} />}
        </div>
      </div>
    </article>
  );
}

function TranslationWorkshop({ initialTargetLanguage, languageOptions, onExit }) {
  const storedWorkshopState = useMemo(() => readStoredWorkshopState(), []);
  const editableLanguageOptions = useMemo(() => languageOptions.filter((option) => option.value !== "en"), [languageOptions]);
  const [password, setPassword] = useState(() => readStoredPassword());
  const [isUnlocked, setIsUnlocked] = useState(() => Boolean(readStoredPassword()));
  const [targetLanguage, setTargetLanguage] = useState(
    () => {
      const requestedLanguage = storedWorkshopState.targetLanguage || initialTargetLanguage;
      return editableLanguageOptions.find((option) => option.value === requestedLanguage)?.value || editableLanguageOptions[0]?.value || "es";
    }
  );
  const [activeWorkflow, setActiveWorkflow] = useState(() => storedWorkshopState.activeWorkflow || "teeth");
  const [selectedPath, setSelectedPath] = useState(() => storedWorkshopState.selectedPath || "");
  const [englishEntries, setEnglishEntries] = useState({});
  const [draftEntries, setDraftEntries] = useState({});
  const [loadedTargetEntries, setLoadedTargetEntries] = useState({});
  const [searchTerm, setSearchTerm] = useState(() => storedWorkshopState.searchTerm || "");
  const [ageSimulation, setAgeSimulation] = useState(() => ({
    enabled: Boolean(storedWorkshopState.ageSimulationEnabled),
    value: Number.isFinite(Number(storedWorkshopState.ageSimulationValue)) ? Number(storedWorkshopState.ageSimulationValue) : DEFAULT_WORKSHOP_AGE_SIMULATION.value,
    unit: storedWorkshopState.ageSimulationUnit === "months" ? "months" : DEFAULT_WORKSHOP_AGE_SIMULATION.unit
  }));
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [savedAt, setSavedAt] = useState("");

  useEffect(() => {
    if (!isUnlocked || !password) {
      return;
    }

    let cancelled = false;

    async function loadLocales() {
      setLoading(true);
      setError("");
      setStatusMessage("");

      try {
        const [englishResponse, targetResponse] = await Promise.all([
          getAdminLocale("en", password),
          getAdminLocale(targetLanguage, password)
        ]);
        if (cancelled) {
          return;
        }

        const nextEnglishEntries = flattenTranslations(englishResponse.translation || {});
        const nextTargetEntries = flattenTranslations(targetResponse.translation || {});
        setEnglishEntries(nextEnglishEntries);
        setLoadedTargetEntries(nextTargetEntries);
        setDraftEntries(nextTargetEntries);
        setSavedAt(targetResponse.updatedAt || "");
      } catch (loadError) {
        if (!cancelled) {
          const message = loadError.message || "Unable to load locale files for the workshop.";
          setError(message);
          if (message.toLowerCase().includes("unauthorized")) {
            setIsUnlocked(false);
            storePassword("");
          }
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadLocales();
    return () => {
      cancelled = true;
    };
  }, [isUnlocked, password, targetLanguage]);

  const workflowRows = useMemo(() => {
    const allPaths = Array.from(new Set([...Object.keys(englishEntries), ...Object.keys(draftEntries)])).sort((left, right) => left.localeCompare(right));
    return allPaths.filter((path) => matchesWorkflow(path, activeWorkflow));
  }, [activeWorkflow, draftEntries, englishEntries]);

  const matchingRows = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    return workflowRows.filter((path) => matchesSearch(path, englishEntries[path] || "", draftEntries[path] || "", normalizedSearch));
  }, [draftEntries, englishEntries, searchTerm, workflowRows]);

  useEffect(() => {
    if (!matchingRows.length) {
      if (selectedPath) {
        setSelectedPath("");
      }
      return;
    }

    if (!selectedPath || !matchingRows.includes(selectedPath)) {
      setSelectedPath(matchingRows[0]);
    }
  }, [matchingRows, selectedPath]);

  const selectedIndex = matchingRows.indexOf(selectedPath);
  const selectedEnglish = selectedPath ? englishEntries[selectedPath] || "" : "";
  const selectedTarget = selectedPath ? draftEntries[selectedPath] || "" : "";
  const selectedPreview = interpolateTemplate(selectedTarget || selectedEnglish);
  const selectedNumber = selectedIndex >= 0 ? selectedIndex + 1 : 0;
  const changedCount = useMemo(
    () => Object.keys(draftEntries).filter((path) => draftEntries[path] !== (loadedTargetEntries[path] || "")).length,
    [draftEntries, loadedTargetEntries]
  );
  const totalStrings = Object.keys(englishEntries).length;
  const missingCount = useMemo(
    () => Object.keys(englishEntries).filter((path) => !draftEntries[path]?.trim()).length,
    [draftEntries, englishEntries]
  );
  const completedCount = Math.max(0, totalStrings - missingCount);
  const completionPercent = totalStrings ? Math.round((completedCount / totalStrings) * 100) : 0;
  const targetLabel = labelForLanguage(targetLanguage, languageOptions);
  const workshopSampleValues = useMemo(() => buildWorkshopSampleValues(ageSimulation), [ageSimulation]);

  useEffect(() => {
    if (!isUnlocked) {
      return;
    }

    writeStoredWorkshopState({
      activeWorkflow,
      searchTerm,
      selectedPath,
      targetLanguage,
      ageSimulationEnabled: ageSimulation.enabled,
      ageSimulationValue: ageSimulation.value,
      ageSimulationUnit: ageSimulation.unit
    });
  }, [activeWorkflow, ageSimulation.enabled, ageSimulation.unit, ageSimulation.value, isUnlocked, searchTerm, selectedPath, targetLanguage]);

  function handleAgeSimulationChange(field, value) {
    setAgeSimulation((current) => {
      if (field === "enabled") {
        return {
          ...current,
          enabled: Boolean(value)
        };
      }

      if (field === "unit") {
        return {
          ...current,
          unit: value === "months" ? "months" : "years"
        };
      }

      return {
        ...current,
        value: Number.isFinite(Number(value)) ? Number(value) : current.value
      };
    });
  }

  function updateEntry(path, value) {
    setDraftEntries((previous) => ({ ...previous, [path]: value }));
  }

  function resetDraft() {
    setDraftEntries(loadedTargetEntries);
    setStatusMessage("Draft reset to the locale currently stored in the app.");
  }

  function handleExport() {
    downloadJson(`translation.${targetLanguage}.reviewed.json`, JSON.stringify(expandTranslations(draftEntries), null, 2));
    setStatusMessage(`Downloaded translation.${targetLanguage}.reviewed.json.`);
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(expandTranslations(draftEntries), null, 2));
      setStatusMessage("Locale JSON copied to the clipboard.");
    } catch {
      setStatusMessage("Clipboard copy was blocked by the browser. Use Download JSON instead.");
    }
  }

  function handleImport(event) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      try {
        setDraftEntries(flattenTranslations(JSON.parse(String(reader.result || "{}"))));
        setStatusMessage(`Loaded ${file.name} into the current draft.`);
        setError("");
      } catch {
        setError("The selected file is not valid translation JSON.");
      }
    };
    reader.readAsText(file);
    event.target.value = "";
  }

  async function handleUnlock(event) {
    event.preventDefault();
    setError("");
    setStatusMessage("");

    const trimmedPassword = password.trim();
    if (!trimmedPassword) {
      setError("Enter the admin password from the root .env file to unlock the workshop.");
      setIsUnlocked(false);
      return;
    }

    try {
      await getAdminLocale("en", trimmedPassword);
      storePassword(trimmedPassword);
      setPassword(trimmedPassword);
      setIsUnlocked(true);
      setStatusMessage("Workshop unlocked.");
    } catch (unlockError) {
      setError(unlockError.message || "Invalid admin password.");
      setIsUnlocked(false);
    }
  }

  function handleLock() {
    setIsUnlocked(false);
    setPassword("");
    setSelectedPath("");
    setDraftEntries({});
    setLoadedTargetEntries({});
    setEnglishEntries({});
    storePassword("");
    deleteCookie(ADMIN_WORKSHOP_STATE_COOKIE);
    setStatusMessage("Workshop locked.");
  }

  async function handleSave() {
    setSaving(true);
    setError("");

    try {
      const response = await saveAdminLocale(targetLanguage, expandTranslations(draftEntries), password);
      setLoadedTargetEntries(draftEntries);
      setSavedAt(response.updatedAt || new Date().toISOString());
      setStatusMessage(`Saved ${targetLanguage} back into the app locale file.`);
    } catch (saveError) {
      setError(saveError.message || "Unable to save locale file.");
    } finally {
      setSaving(false);
    }
  }

  function selectPreviousPath() {
    if (selectedIndex > 0) {
      setSelectedPath(matchingRows[selectedIndex - 1]);
    }
  }

  function selectNextPath() {
    if (selectedIndex >= 0 && selectedIndex < matchingRows.length - 1) {
      setSelectedPath(matchingRows[selectedIndex + 1]);
    }
  }

  function handleSliderChange(event) {
    const nextIndex = Number(event.target.value) - 1;
    if (Number.isInteger(nextIndex) && nextIndex >= 0 && nextIndex < matchingRows.length) {
      setSelectedPath(matchingRows[nextIndex]);
    }
  }

  if (!isUnlocked) {
    return (
      <section className="translation-workshop" aria-label="Translation workshop">
        {(error || statusMessage) && <section className={`${error ? "error-banner" : "info-banner"}`}>{error || statusMessage}</section>}
        <form className="card translation-auth-card" onSubmit={handleUnlock}>
          <strong>Translation Workshop</strong>
          <p>Unlock the admin editor to load, compare, edit, and save locale files.</p>
          <label>
            <span className="profile-summary-label">Admin password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={ADMIN_PASSWORD_HINT}
              autoComplete="current-password"
            />
          </label>
          <div className="translation-editor-actions">
            <button type="submit" className="action-btn">Unlock workshop</button>
            <button type="button" className="action-btn secondary" onClick={onExit}>Return to brushing flow</button>
          </div>
        </form>
      </section>
    );
  }

  return (
    <section className="translation-workshop" aria-label="Translation workshop">
      <section className="translation-admin-bar card compact">
        <div className="translation-admin-left">
          <button type="button" className="action-btn secondary" onClick={onExit}>Return to brushing flow</button>
          <button type="button" className="action-btn secondary" onClick={handleLock}>Lock workshop</button>
        </div>
        <div className="translation-admin-center">
          <WorkflowTabs activeWorkflow={activeWorkflow} onSelect={setActiveWorkflow} />
        </div>
        <div className="translation-admin-right">
          <label className="translation-inline-control">
            <span>Language</span>
            <select value={targetLanguage} onChange={(event) => setTargetLanguage(event.target.value)}>
              {editableLanguageOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <div className="translation-save-meta">
            <strong>{changedCount} edited</strong>
            <span>Saved: {formatTimestamp(savedAt)}</span>
          </div>
        </div>
      </section>

      {(error || statusMessage) && <section className={`${error ? "error-banner" : "info-banner"}`}>{error || statusMessage}</section>}

      <section className="translation-workshop-status-row compact-row">
        <div className="translation-stat card compact"><strong>{totalStrings}</strong><span>Total strings</span></div>
        <div className="translation-stat card compact"><strong>{changedCount}</strong><span>Edited strings</span></div>
        <div className="translation-stat card compact"><strong>{missingCount}</strong><span>Blank or missing</span></div>
      </section>

      <section className="translation-workshop-age-lab card compact">
        <div className="translation-age-lab-copy">
          <strong>{englishEntries["settings.experienceSimulator.title"] || "Simulate age-based experience"}</strong>
          <span>{englishEntries["settings.experienceSimulator.hint"] || "Session-only preview controls for the workshop phone screens."}</span>
        </div>
        <label className="translation-age-lab-toggle">
          <span>{englishEntries["settings.experienceSimulator.toggle"] || "Use simulated age"}</span>
          <input
            type="checkbox"
            checked={ageSimulation.enabled}
            onChange={(event) => handleAgeSimulationChange("enabled", event.target.checked)}
          />
        </label>
        <label className="translation-inline-control">
          <span>{englishEntries["settings.experienceSimulator.ageValue"] || "Age value"}</span>
          <input
            type="number"
            min="0"
            max={ageSimulation.unit === "months" ? "216" : "99"}
            value={ageSimulation.value}
            onChange={(event) => handleAgeSimulationChange("value", Number(event.target.value))}
            disabled={!ageSimulation.enabled}
          />
        </label>
        <label className="translation-inline-control">
          <span>{englishEntries["settings.experienceSimulator.ageUnit"] || "Age unit"}</span>
          <select
            value={ageSimulation.unit}
            onChange={(event) => handleAgeSimulationChange("unit", event.target.value)}
            disabled={!ageSimulation.enabled}
          >
            <option value="months">months</option>
            <option value="years">years</option>
          </select>
        </label>
      </section>

      <section className="translation-tri-layout">
        <div className="translation-column preview-column">
          <WorkshopPhone
            languageLabel="English"
            entries={englishEntries}
            fallbackEntries={englishEntries}
            selectedPath={selectedPath}
            onSelectPath={setSelectedPath}
            activeWorkflow={activeWorkflow}
            onSelectWorkflow={setActiveWorkflow}
            helperLabel="English template"
            sampleValues={workshopSampleValues}
          />
        </div>

        <div className="translation-column preview-column">
          <WorkshopPhone
            languageLabel={targetLabel}
            entries={draftEntries}
            fallbackEntries={englishEntries}
            selectedPath={selectedPath}
            onSelectPath={setSelectedPath}
            activeWorkflow={activeWorkflow}
            onSelectWorkflow={setActiveWorkflow}
            helperLabel="Translated preview"
            sampleValues={workshopSampleValues}
          />
        </div>

        <article className="card translation-editor-panel full-height">
          <div className="translation-editor-controls single-column">
            <div className="translation-search-row">
              <label className="translation-search-input">
                <span className="profile-summary-label">Search</span>
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder={`Filter ${formatSectionLabel(activeWorkflow)} copy`}
                />
              </label>
              <div className="translation-selection-nav compact-nav">
                <button type="button" className="action-btn secondary" onClick={selectPreviousPath} disabled={selectedIndex <= 0}>Previous</button>
                <button type="button" className="action-btn secondary" onClick={selectNextPath} disabled={selectedIndex < 0 || selectedIndex >= matchingRows.length - 1}>Next</button>
              </div>
            </div>
            <div className="translation-selection-bar compact-meta">
              <small className="translation-selection-progress">
                {matchingRows.length
                  ? `String ${selectedNumber} of ${matchingRows.length} in ${formatSectionLabel(activeWorkflow)} · ${completionPercent}% complete overall`
                  : `${completionPercent}% complete overall`}
              </small>
              <label className="translation-position-slider">
                <input
                  type="range"
                  min={matchingRows.length ? 1 : 0}
                  max={matchingRows.length || 0}
                  step="1"
                  value={matchingRows.length ? selectedNumber : 0}
                  onChange={handleSliderChange}
                  disabled={!matchingRows.length}
                  aria-label="Selected string position"
                />
              </label>
            </div>
          </div>

          <div className="translation-editor-actions sticky-actions compact-actions">
            <button type="button" className="action-btn" onClick={handleSave} disabled={loading || saving}>{saving ? "Saving..." : "Save"}</button>
            <button type="button" className="action-btn secondary" onClick={handleExport} disabled={loading}>Download</button>
            <button type="button" className="action-btn secondary" onClick={handleCopy} disabled={loading}>Copy JSON</button>
            <button type="button" className="action-btn secondary" onClick={resetDraft} disabled={loading}>Reset</button>
            <label className="translation-import-btn action-btn secondary">Import<input type="file" accept="application/json" onChange={handleImport} /></label>
          </div>

          {selectedPath ? (
            <section className="translation-focus-card">
              <div className="translation-editor-section-header">
                <strong>{formatSectionLabel(activeWorkflow)}</strong>
                <span>{selectedPath}</span>
              </div>
              <div className="translation-entry-reference current-editing-reference">
                <span>Current English reference</span>
                <p>{selectedEnglish}</p>
              </div>
              <label className="translation-entry-editor">
                <span>{targetLabel} translation</span>
                <textarea
                  value={selectedTarget}
                  onChange={(event) => updateEntry(selectedPath, event.target.value)}
                  rows={Math.max(5, Math.ceil(((selectedTarget || selectedEnglish || "").length || 1) / 56))}
                />
              </label>
              <div className="translation-preview-raw">
                <span>Rendered preview</span>
                <p>{selectedPreview}</p>
              </div>
            </section>
          ) : (
            <section className="translation-focus-card empty-state">
              <p>No strings are available for this workflow yet.</p>
            </section>
          )}
        </article>
      </section>
    </section>
  );
}

export default TranslationWorkshop;
