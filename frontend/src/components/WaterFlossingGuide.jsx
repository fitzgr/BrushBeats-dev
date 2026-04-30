import { useEffect, useMemo, useRef, useState } from "react";
import { getWaterFlossingAgeProfile, startWaterFlossingSession } from "../lib/waterFlossing";

const WATER_FLOSSING_DURATION_OPTIONS = [60, 120, 180];

function formatDurationLabel(seconds) {
  return `${Math.round(seconds / 60)} minute${seconds === 60 ? "" : "s"}`;
}

function formatRemaining(seconds) {
  const safe = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(safe / 60);
  const remainder = safe % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function WaterFlossingGuide({ toothCount, isMobile = false }) {
  const profile = useMemo(() => getWaterFlossingAgeProfile(toothCount), [toothCount]);
  const [durationSeconds, setDurationSeconds] = useState(120);
  const [running, setRunning] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(120);
  const [lastPrompt, setLastPrompt] = useState("");
  const sessionRef = useRef(null);
  const tickerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (sessionRef.current) {
        sessionRef.current.stop();
        sessionRef.current = null;
      }
      if (tickerRef.current) {
        window.clearInterval(tickerRef.current);
        tickerRef.current = null;
      }
    };
  }, []);

  function stopSession() {
    if (sessionRef.current) {
      sessionRef.current.stop();
      sessionRef.current = null;
    }

    if (tickerRef.current) {
      window.clearInterval(tickerRef.current);
      tickerRef.current = null;
    }

    setRunning(false);
    setRemainingSeconds(durationSeconds);
  }

  function startSession() {
    stopSession();
    setLastPrompt("");
    setRemainingSeconds(durationSeconds);
    setRunning(true);

    const startedAt = Date.now();
    sessionRef.current = startWaterFlossingSession({
      toothCount,
      durationSeconds,
      onPrompt: ({ text, category }) => {
        setLastPrompt(`${category}: ${text}`);
      }
    });

    tickerRef.current = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      const nextRemaining = Math.max(0, durationSeconds - elapsed);
      setRemainingSeconds(nextRemaining);

      if (nextRemaining <= 0) {
        stopSession();
      }
    }, 250);
  }

  return (
    <section className={`water-flossing-card${isMobile ? " compact" : ""}`.trim()} aria-live="polite">
      <strong className="water-flossing-title">Water Floss Voice Guide</strong>
      <p className="water-flossing-meta">Tooth count: {toothCount} | Group: {profile.group} | Approx age: {profile.ageRangeLabel}</p>
      <p className="water-flossing-meta">Mode: {profile.caregiverLed ? "Caregiver-led" : "Self-guided"}</p>

      <label className="water-flossing-duration">
        <span className="profile-summary-label">Water floss duration</span>
        <select
          value={durationSeconds}
          onChange={(event) => {
            const next = Number(event.target.value);
            setDurationSeconds(next);
            setRemainingSeconds(next);
          }}
          disabled={running}
        >
          {WATER_FLOSSING_DURATION_OPTIONS.map((option) => (
            <option key={option} value={option}>{formatDurationLabel(option)}</option>
          ))}
        </select>
      </label>

      <div className="water-flossing-controls">
        <button type="button" className="action-btn" onClick={startSession} disabled={running}>Start water flossing</button>
        <button type="button" className="action-btn secondary" onClick={stopSession} disabled={!running}>Stop</button>
      </div>

      <p className="water-flossing-status">{running ? `Voice session running • ${formatRemaining(remainingSeconds)} left` : `Ready • ${formatRemaining(remainingSeconds)}`}</p>
      {lastPrompt && <p className="water-flossing-last">Last prompt: {lastPrompt}</p>}
      <p className="water-flossing-note">Voice prompts are short and spoken over your music so you can stay focused at the sink.</p>
    </section>
  );
}

export default WaterFlossingGuide;
