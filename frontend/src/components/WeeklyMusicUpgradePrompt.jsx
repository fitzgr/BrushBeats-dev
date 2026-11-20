import { useEffect, useState } from "react";

/**
 * Show only when the server confirms that the just-finished brushing
 * session used a weekly free music allowance. This must never interrupt
 * a running brushing session or claim that checkout is already active.
 */
export default function WeeklyMusicUpgradePrompt({ sessionId, visible }) {
  const [dismissed, setDismissed] = useState(false);
  const [showPlans, setShowPlans] = useState(false);

  useEffect(() => {
    setDismissed(false);
    setShowPlans(false);
  }, [sessionId]);

  if (!visible || dismissed) return null;

  return (
    <section className="card weekly-music-upgrade-prompt" aria-label="Keep brushing to the beat">
      <h3>Enjoyed brushing to the beat?</h3>
      <p>Your free weekly music session is complete. You can keep brushing with the basic timer and guidance anytime, or choose a family plan to enjoy music every session.</p>
      {showPlans && (
        <div className="weekly-music-plan-details">
          <p><strong>Brush Beats Family — £14.99/year:</strong> 6 profiles and 5 registered devices.</p>
          <p><strong>Family Plus — £24.99/year:</strong> 12 profiles and 10 registered devices.</p>
          <small>Payments are not yet enabled. Your saved brushing history remains yours.</small>
        </div>
      )}
      <div className="household-auth-actions">
        <button type="button" className="action-btn" onClick={() => setShowPlans((value) => !value)}>
          {showPlans ? "Hide plans" : "See family subscriptions"}
        </button>
        <button type="button" className="action-btn secondary" onClick={() => setDismissed(true)}>
          Maybe later
        </button>
      </div>
    </section>
  );
}
