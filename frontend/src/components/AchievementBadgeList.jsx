export default function AchievementBadgeList({ t, achievements, title, compact = false }) {
  const visibleAchievements = Array.isArray(achievements)
    ? achievements.filter((achievement) => achievement.achievementType !== "routine-mix")
    : [];
  if (visibleAchievements.length === 0) {
    return null;
  }

  return (
    <section className={`achievement-badge-list${compact ? " compact" : ""}`} aria-label={title || t("app.achievements.ariaLabel")}>
      {title && <strong>{title}</strong>}
      <div className="achievement-badge-grid">
        {visibleAchievements.map((achievement) => (
          <article key={achievement.achievementId || achievement.achievementType} className={`achievement-badge-card tier-${achievement.tier || "bronze"}`}>
            <span className="achievement-badge-icon" aria-hidden="true">★</span>
            <div>
              <strong>{t(`app.achievements.types.${achievement.achievementType}.title`)}</strong>
              <small>{t(`app.achievements.tiers.${achievement.tier || "bronze"}`)} · +{achievement.pointsAwarded || achievement.progressValue || 0}</small>
              <span>{t(`app.achievements.types.${achievement.achievementType}.description`)}</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}