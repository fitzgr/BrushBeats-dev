function getStageLabel(t, stage) {
  const nestedKey = `age.stages.${stage || "unknown"}.label`;
  const nestedLabel = t(nestedKey);
  if (nestedLabel !== nestedKey) {
    return nestedLabel;
  }

  const directKey = `age.stages.${stage || "unknown"}`;
  const directLabel = t(directKey);
  if (directLabel !== directKey) {
    return directLabel;
  }

  return t("age.stages.unknown.label");
}

export default function HouseholdOverviewPanel({ t, overview, onSwitchUser }) {
  if (!overview?.household) {
    return null;
  }

  return (
    <section className="household-overview-panel" aria-label={t("app.householdOverview.ariaLabel")}>
      <div className="household-overview-header">
        <div>
          <p className="household-overview-eyebrow">{t("app.householdOverview.eyebrow")}</p>
          <h2>{overview.household.householdName}</h2>
          <p>{t("app.householdOverview.summary", { count: overview.members.length })}</p>
        </div>
      </div>
      <div className="household-overview-members">
        {overview.members.map((member) => (
          <button
            key={member.userId}
            type="button"
            className={`household-member-chip${member.userId === overview.activeUserId ? " active" : ""}`}
            onClick={() => onSwitchUser(member.userId)}
          >
            <strong>{member.name}</strong>
            <span>{t("app.householdOverview.memberStage", { stage: getStageLabel(t, member.toothStage) })}</span>
          </button>
        ))}
      </div>
      <div className="household-overview-cards">
        {overview.members.map((member) => (
          <article key={`${member.userId}-summary`} className={`household-member-summary${member.userId === overview.activeUserId ? " active" : ""}`}>
            <div className="household-member-summary-header">
              <strong>{member.name}</strong>
              {member.userId === overview.activeUserId && <span>{t("app.householdOverview.active")}</span>}
            </div>
            <p>{t("app.householdOverview.sessions", { count: member.totalSessions })}</p>
            <p>
              {member.lastActivityAt
                ? t("app.householdOverview.lastActivity", { date: String(member.lastActivityAt).slice(0, 10) })
                : t("app.householdOverview.noActivity")}
            </p>
            {member.lastSongTitle && <p>{t("app.householdOverview.lastSong", { title: member.lastSongTitle })}</p>}
          </article>
        ))}
      </div>
    </section>
  );
}