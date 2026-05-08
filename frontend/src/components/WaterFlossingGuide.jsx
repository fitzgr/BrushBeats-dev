import { useEffect, useMemo, useRef, useState } from "react";
import {
  DURATION_OPTIONS,
  DEFAULT_WATER_FLOSSING_SETTINGS,
  GUIDANCE_DETAIL_OPTIONS,
  MUSIC_DUCKING_OPTIONS,
  PROMPT_FREQUENCY_PRESETS,
  USER_FOCUS_OPTIONS,
  VOICE_STYLE_PRESETS,
  WATER_PRESSURE_OPTIONS,
  getWaterFlossingAgeProfile,
  getWaterFlossingVoiceOptions,
  loadWaterFlossingSettings,
  saveWaterFlossingSettings,
  startWaterFlossingVoiceSession,
  stopWaterFlossingVoiceSession,
  testWaterFlossingVoice
} from "../lib/waterFlossing";

function formatDurationLabel(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function formatRemaining(seconds) {
  const safe = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(safe / 60);
  const remainder = safe % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function prettyLabel(value) {
  return String(value || "")
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function WaterFlossingGuide({ toothCount, isMobile = false }) {
  const profile = useMemo(() => getWaterFlossingAgeProfile(toothCount), [toothCount]);
  const [settings, setSettings] = useState(() => loadWaterFlossingSettings());
  const [running, setRunning] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(() => loadWaterFlossingSettings().durationSeconds || 120);
  const [lastPrompt, setLastPrompt] = useState("");
  const [availableVoices, setAvailableVoices] = useState(() => getWaterFlossingVoiceOptions());
  const [voicePreviewState, setVoicePreviewState] = useState("idle");
  const startedAtRef = useRef(0);
  const tickerRef = useRef(null);
  const sessionRef = useRef(null);

  useEffect(() => {
    function refreshVoices() {
      const voices = getWaterFlossingVoiceOptions();
      setAvailableVoices(voices);
    }

    refreshVoices();
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = refreshVoices;
    }

    return () => {
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.onvoiceschanged = null;
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      if (tickerRef.current) {
        window.clearInterval(tickerRef.current);
        tickerRef.current = null;
      }
      stopWaterFlossingVoiceSession();
    };
  }, []);

  function updateSettings(patch) {
    setSettings((current) => {
      const next = { ...current, ...patch };
      saveWaterFlossingSettings(next);
      return next;
    });
  }

  function stopSession() {
    if (tickerRef.current) {
      window.clearInterval(tickerRef.current);
      tickerRef.current = null;
    }

    sessionRef.current?.stop?.();
    sessionRef.current = null;
    stopWaterFlossingVoiceSession();
    setRunning(false);
    setRemainingSeconds(settings.durationSeconds || DEFAULT_WATER_FLOSSING_SETTINGS.durationSeconds);
  }

  function startSession() {
    stopSession();
    setLastPrompt("");
    setRunning(true);
    startedAtRef.current = Date.now();
    setRemainingSeconds(settings.durationSeconds || DEFAULT_WATER_FLOSSING_SETTINGS.durationSeconds);

    sessionRef.current = startWaterFlossingVoiceSession({
      toothCount,
      durationSeconds: settings.durationSeconds,
      settings,
      onPrompt: ({ category, text }) => {
        setLastPrompt(`${category}: ${text}`);
      }
    });

    tickerRef.current = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAtRef.current) / 1000);
      const nextRemaining = Math.max(0, Number(settings.durationSeconds || 120) - elapsed);
      setRemainingSeconds(nextRemaining);
      if (nextRemaining <= 0) {
        stopSession();
      }
    }, 250);
  }

  function handleVoicePreview() {
    setVoicePreviewState("playing");
    testWaterFlossingVoice(settings);
    window.setTimeout(() => {
      setVoicePreviewState("idle");
    }, 1600);
  }

  const voiceStyleOptions = Object.values(VOICE_STYLE_PRESETS);
  const frequencyOptions = Object.values(PROMPT_FREQUENCY_PRESETS);

  return (
    <section className={`water-flossing-card${isMobile ? " compact" : ""}`.trim()} aria-live="polite">
      <strong className="water-flossing-title">Water Floss Voice Guidance</strong>
      <p className="water-flossing-meta">Tooth count: {toothCount} | Group: {profile.group} | Approx age: {profile.ageRangeLabel}</p>
      <p className="water-flossing-meta">Mode: {profile.caregiverLed ? "Caregiver mode active" : "Direct user coaching"}</p>

      <div className="water-flossing-settings-grid">
        <label className="water-flossing-duration">
          <span className="profile-summary-label">Session duration</span>
          <select
            value={settings.durationSeconds}
            onChange={(event) => {
              const nextDuration = Number(event.target.value);
              updateSettings({ durationSeconds: nextDuration });
              setRemainingSeconds(nextDuration);
            }}
            disabled={running}
          >
            {DURATION_OPTIONS.map((option) => (
              <option key={option} value={option}>{formatDurationLabel(option)}</option>
            ))}
          </select>
        </label>

        <label className="water-flossing-duration">
          <span className="profile-summary-label">Voice</span>
          <select
            value={settings.voiceURI}
            onChange={(event) => {
              const voiceURI = event.target.value;
              const selected = availableVoices.find((voice) => voice.voiceURI === voiceURI);
              updateSettings({
                voiceURI,
                voiceName: selected?.name || ""
              });
            }}
            disabled={running}
          >
            <option value="">System default</option>
            {availableVoices.map((voice) => (
              <option key={voice.voiceURI} value={voice.voiceURI}>
                {`${voice.name} (${voice.lang})${voice.default ? " - default" : ""}`}
              </option>
            ))}
          </select>
        </label>

        <div className="water-flossing-inline-action">
          <button
            type="button"
            className="action-btn secondary"
            onClick={handleVoicePreview}
            disabled={running || voicePreviewState === "playing"}
          >
            {voicePreviewState === "playing" ? "Testing voice..." : "Test Voice"}
          </button>
        </div>

        <label className="water-flossing-duration">
          <span className="profile-summary-label">Voice style / tone</span>
          <select
            value={settings.voiceStyle}
            onChange={(event) => updateSettings({ voiceStyle: event.target.value })}
            disabled={running}
          >
            {voiceStyleOptions.map((option) => (
              <option key={option.key} value={option.key}>{option.label}</option>
            ))}
          </select>
        </label>

        <label className="water-flossing-duration">
          <span className="profile-summary-label">Prompt frequency</span>
          <select
            value={settings.promptFrequency}
            onChange={(event) => updateSettings({ promptFrequency: event.target.value })}
            disabled={running}
          >
            {frequencyOptions.map((option) => (
              <option key={option.key} value={option.key}>{option.label}</option>
            ))}
          </select>
        </label>

        <label className="water-flossing-duration">
          <span className="profile-summary-label">Water pressure comfort</span>
          <select
            value={settings.waterPressureComfort}
            onChange={(event) => updateSettings({ waterPressureComfort: event.target.value })}
            disabled={running}
          >
            {WATER_PRESSURE_OPTIONS.map((option) => (
              <option key={option} value={option}>{prettyLabel(option)}</option>
            ))}
          </select>
        </label>

        <label className="water-flossing-duration">
          <span className="profile-summary-label">User focus</span>
          <select
            value={settings.userFocus}
            onChange={(event) => updateSettings({ userFocus: event.target.value })}
            disabled={running}
          >
            {USER_FOCUS_OPTIONS.map((option) => (
              <option key={option} value={option}>{prettyLabel(option)}</option>
            ))}
          </select>
        </label>

        <label className="water-flossing-duration">
          <span className="profile-summary-label">Guidance detail</span>
          <select
            value={settings.guidanceDetail}
            onChange={(event) => updateSettings({ guidanceDetail: event.target.value })}
            disabled={running}
          >
            {GUIDANCE_DETAIL_OPTIONS.map((option) => (
              <option key={option} value={option}>{prettyLabel(option)}</option>
            ))}
          </select>
        </label>

        <label className="water-flossing-duration">
          <span className="profile-summary-label">Music ducking preference</span>
          <select
            value={settings.musicDucking}
            onChange={(event) => updateSettings({ musicDucking: event.target.value })}
            disabled={running}
          >
            {MUSIC_DUCKING_OPTIONS.map((option) => (
              <option key={option} value={option}>{prettyLabel(option)}</option>
            ))}
          </select>
          <span className="profile-summary-label">Music vs TTS volume</span>
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            value={settings.ttsMusicBalance}
            onChange={(event) => updateSettings({ ttsMusicBalance: Number(event.target.value) })}
            disabled={running}
          />
          <span className="water-flossing-balance-caption">
            {`Music louder ${100 - Number(settings.ttsMusicBalance || 0)}% / Voice louder ${Number(settings.ttsMusicBalance || 0)}%`}
          </span>
        </label>
      </div>

      <div className="water-flossing-controls">
        <button type="button" className="action-btn" onClick={startSession} disabled={running}>Start</button>
        <button type="button" className="action-btn secondary" onClick={stopSession} disabled={!running}>Stop</button>
      </div>

      <p className="water-flossing-status">{running ? `Voice session running • ${formatRemaining(remainingSeconds)} left` : `Ready • ${formatRemaining(remainingSeconds)}`}</p>
      {lastPrompt && <p className="water-flossing-last">Last prompt: {lastPrompt}</p>}
      <p className="water-flossing-note">Music ducking setting is saved for future audio-mixing support. Water flossing guidance is general coaching only. Use a comfortable pressure and follow your dental professional's advice.</p>
    </section>
  );
}

export default WaterFlossingGuide;
