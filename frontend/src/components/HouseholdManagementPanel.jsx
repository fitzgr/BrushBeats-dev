import { useState } from "react";

function createNumericDraftValue(value, fallback) {
  const numericValue = Number(value);
  return String(Number.isFinite(numericValue) ? numericValue : fallback);
}

function parseIntegerInput(value, fallback, min, max) {
  const trimmedValue = String(value ?? "").trim();
  const numericValue = Number(trimmedValue);
  if (!trimmedValue || !Number.isFinite(numericValue)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.round(numericValue)));
}

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

function formatSyncStatus(status) {
  switch (String(status || "local-only")) {
    case "connected":
      return "Connected";
    case "server-gated":
      return "Server gated";
    case "sync-error":
      return "Sync error";
    case "subscriber-required":
      return "Subscriber required";
    case "local-only":
    default:
      return "Local only";
  }
}

function formatSyncTimestamp(value) {
  if (!value) {
    return "Not synced yet";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "Not synced yet";
  }

  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(parsed);
}

function buildRewardSettingsDraft(rewardSettings = {}) {
  return {
    levelBasePoints: createNumericDraftValue(rewardSettings.levelBasePoints, 100),
    levelStepPoints: createNumericDraftValue(rewardSettings.levelStepPoints, 120),
    levelGrowthPoints: createNumericDraftValue(rewardSettings.levelGrowthPoints, 20),
    brushingSessionPoints: createNumericDraftValue(rewardSettings.brushingSessionPoints, 12),
    toothMilestonePoints: createNumericDraftValue(rewardSettings.toothMilestonePoints, 18)
  };
}

function buildGoalSettingsDraft(goalSettings = {}) {
  return {
    weeklyBrushingSessions: createNumericDraftValue(goalSettings.weeklyBrushingSessions, 14)
  };
}

function buildEmptyMemberDraft() {
  return {
    name: "",
    topTeethCount: "16",
    bottomTeethCount: "16",
    preferredLanguage: "en",
    brushingHand: "right",
    brushType: "manual",
    brushDurationSeconds: "120",
    keyword: ""
  };
}

function buildMemberDraft(member) {
  return {
    name: member.name || "",
    topTeethCount: createNumericDraftValue(member.topTeethCount, 0),
    bottomTeethCount: createNumericDraftValue(member.bottomTeethCount, 0),
    preferredLanguage: member.preferredLanguage || "en",
    brushingHand: member.brushingHand || "right",
    brushType: member.brushType || "manual",
    brushDurationSeconds: createNumericDraftValue(member.brushDurationSeconds, 120),
    keyword: member.keyword || ""
  };
}

function MemberEditor({ t, member, saving, activeUserId, onSave, onArchive, onRestore, onRemove, onActivate }) {
  const [draft, setDraft] = useState(() => buildMemberDraft(member));

  function updateDraft(key, value) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  return (
    <article className={`household-member-editor${member.userId === activeUserId ? " active" : ""}`}>
      <div className="household-member-editor-header">
        <div>
          <strong>{member.name}</strong>
          <span>{t("app.householdManagement.memberSummary", { stage: getStageLabel(t, member.toothStage) })}</span>
        </div>
        <div className="household-member-editor-actions">
          {member.userId !== activeUserId && !member.isArchived && (
            <button type="button" className="action-btn secondary" onClick={() => onActivate(member.userId)}>
              {t("app.householdManagement.activate")}
            </button>
          )}
          {!member.isArchived ? (
            <button type="button" className="action-btn secondary" onClick={() => onArchive(member.userId)}>
              {t("app.householdManagement.archive")}
            </button>
          ) : (
            <button type="button" className="action-btn secondary" onClick={() => onRestore(member.userId)}>
              {t("app.householdManagement.restore")}
            </button>
          )}
          <button type="button" className="action-btn secondary" onClick={() => onRemove(member.userId)}>
            {t("common.buttons.remove")}
          </button>
        </div>
      </div>
      <div className="household-management-grid">
        <label>
          <span>{t("app.householdManagement.fields.memberName")}</span>
          <input value={draft.name} onChange={(event) => updateDraft("name", event.target.value)} />
        </label>
        <label>
          <span>{t("app.householdManagement.fields.topTeeth")}</span>
          <input type="number" inputMode="numeric" min="0" max="16" value={draft.topTeethCount} onChange={(event) => updateDraft("topTeethCount", event.target.value)} />
        </label>
        <label>
          <span>{t("app.householdManagement.fields.bottomTeeth")}</span>
          <input type="number" inputMode="numeric" min="0" max="16" value={draft.bottomTeethCount} onChange={(event) => updateDraft("bottomTeethCount", event.target.value)} />
        </label>
        <label>
          <span>{t("app.householdManagement.fields.language")}</span>
          <select value={draft.preferredLanguage} onChange={(event) => updateDraft("preferredLanguage", event.target.value)}>
            <option value="en">English</option>
            <option value="es">Espanol</option>
            <option value="tr">Turkce</option>
          </select>
        </label>
        <label>
          <span>{t("app.householdManagement.fields.brushingHand")}</span>
          <select value={draft.brushingHand} onChange={(event) => updateDraft("brushingHand", event.target.value)}>
            <option value="right">{t("common.hands.right")}</option>
            <option value="left">{t("common.hands.left")}</option>
          </select>
        </label>
        <label>
          <span>{t("app.householdManagement.fields.brushType")}</span>
          <select value={draft.brushType} onChange={(event) => updateDraft("brushType", event.target.value)}>
            <option value="manual">{t("brushing.brushTypeManual")}</option>
            <option value="electric">{t("brushing.brushTypeElectric")}</option>
          </select>
        </label>
        <label>
          <span>{t("app.householdManagement.fields.duration")}</span>
          <input type="number" inputMode="numeric" min="30" step="30" value={draft.brushDurationSeconds} onChange={(event) => updateDraft("brushDurationSeconds", event.target.value)} />
        </label>
        <label>
          <span>{t("app.householdManagement.fields.keyword")}</span>
          <input value={draft.keyword} onChange={(event) => updateDraft("keyword", event.target.value)} />
        </label>
      </div>
      <div className="household-management-inline-actions">
        <button
          type="button"
          className="action-btn"
          disabled={saving}
          onClick={() => onSave(member.userId, {
            ...draft,
            topTeethCount: parseIntegerInput(draft.topTeethCount, Number(member.topTeethCount || 0), 0, 16),
            bottomTeethCount: parseIntegerInput(draft.bottomTeethCount, Number(member.bottomTeethCount || 0), 0, 16),
            brushDurationSeconds: parseIntegerInput(draft.brushDurationSeconds, Number(member.brushDurationSeconds || 120), 30, 600)
          })}
        >
          {saving ? t("app.householdManagement.saving") : t("common.buttons.save")}
        </button>
      </div>
    </article>
  );
}

export default function HouseholdManagementPanel({
  t,
  management,
  activeUserId,
  saving,
  saveNotice,
  onSaveHousehold,
  onSaveMember,
  onArchiveMember,
  onRestoreMember,
  onRemoveMember,
  onActivateMember
}) {
  const [householdName, setHouseholdName] = useState(() => management?.household?.householdName || "");
  const [rewardSettings, setRewardSettings] = useState(() => buildRewardSettingsDraft(management?.household?.rewardSettings));
  const [goalSettings, setGoalSettings] = useState(() => buildGoalSettingsDraft(management?.household?.goalSettings));
  const [newMemberDraft, setNewMemberDraft] = useState(buildEmptyMemberDraft());

  if (!management?.household) {
    return null;
  }

  return (
    <section className="household-management-panel" aria-label={t("app.householdManagement.ariaLabel")}>
      <div className="household-management-header">
        <div>
          <p className="household-management-eyebrow">{t("app.householdManagement.eyebrow")}</p>
          <h2>{t("app.householdManagement.title")}</h2>
          <p>{t("app.householdManagement.subtitle")}</p>
        </div>
      </div>

      {saveNotice && <p className="info-banner household-management-save-notice">{saveNotice}</p>}

      <section className="household-management-section">
        <div className="household-management-section-header">
          <strong>{t("app.householdManagement.householdSettingsTitle")}</strong>
          <span>{t("app.householdManagement.householdSettingsSummary")}</span>
        </div>
        <div className="household-management-grid">
          <label>
            <span>{t("app.householdManagement.fields.householdName")}</span>
            <input value={householdName} onChange={(event) => setHouseholdName(event.target.value)} />
          </label>
          <div className="household-management-readonly">
            <span>{t("app.householdManagement.fields.subscriptionTier")}</span>
            <strong>{management.household.subscriptionTier || "free"}</strong>
          </div>
          <div className="household-management-readonly">
            <span>{t("app.householdManagement.fields.syncStatus")}</span>
            <strong>{formatSyncStatus(management.household.syncStatus)}</strong>
            <small>{formatSyncTimestamp(management.household.lastSyncedAt)}</small>
          </div>
          <label>
            <span>{t("app.householdManagement.fields.levelBasePoints")}</span>
            <input type="number" inputMode="numeric" min="40" step="10" value={rewardSettings.levelBasePoints} onChange={(event) => setRewardSettings((current) => ({ ...current, levelBasePoints: event.target.value }))} />
          </label>
          <label>
            <span>{t("app.householdManagement.fields.levelStepPoints")}</span>
            <input type="number" inputMode="numeric" min="40" step="10" value={rewardSettings.levelStepPoints} onChange={(event) => setRewardSettings((current) => ({ ...current, levelStepPoints: event.target.value }))} />
          </label>
          <label>
            <span>{t("app.householdManagement.fields.levelGrowthPoints")}</span>
            <input type="number" inputMode="numeric" min="0" step="5" value={rewardSettings.levelGrowthPoints} onChange={(event) => setRewardSettings((current) => ({ ...current, levelGrowthPoints: event.target.value }))} />
          </label>
          <label>
            <span>{t("app.householdManagement.fields.brushingSessionPoints")}</span>
            <input type="number" inputMode="numeric" min="1" step="1" value={rewardSettings.brushingSessionPoints} onChange={(event) => setRewardSettings((current) => ({ ...current, brushingSessionPoints: event.target.value }))} />
          </label>
          <label>
            <span>{t("app.householdManagement.fields.toothMilestonePoints")}</span>
            <input type="number" inputMode="numeric" min="1" step="1" value={rewardSettings.toothMilestonePoints} onChange={(event) => setRewardSettings((current) => ({ ...current, toothMilestonePoints: event.target.value }))} />
          </label>
          <label>
            <span>{t("app.householdManagement.fields.weeklyBrushingSessions")}</span>
            <input type="number" inputMode="numeric" min="1" step="1" value={goalSettings.weeklyBrushingSessions} onChange={(event) => setGoalSettings((current) => ({ ...current, weeklyBrushingSessions: event.target.value }))} />
          </label>
        </div>
        <p className="household-management-helper-copy">{t("app.householdManagement.rewardSettingsSummary")}</p>
        <div className="household-management-inline-actions">
          <button
            type="button"
            className="action-btn"
            disabled={saving}
            onClick={() => onSaveHousehold({
              householdName,
              rewardSettings: {
                levelBasePoints: parseIntegerInput(rewardSettings.levelBasePoints, 100, 40, 500),
                levelStepPoints: parseIntegerInput(rewardSettings.levelStepPoints, 120, 40, 500),
                levelGrowthPoints: parseIntegerInput(rewardSettings.levelGrowthPoints, 20, 0, 120),
                brushingSessionPoints: parseIntegerInput(rewardSettings.brushingSessionPoints, 12, 1, 100),

                toothMilestonePoints: parseIntegerInput(rewardSettings.toothMilestonePoints, 18, 1, 120)

              },
              goalSettings: {
                weeklyBrushingSessions: parseIntegerInput(goalSettings.weeklyBrushingSessions, 14, 1, 40)

              }
            })}
          >
            {saving ? t("app.householdManagement.saving") : t("common.buttons.save")}
          </button>
        </div>
      </section>

      <section className="household-management-section">
        <div className="household-management-section-header">
          <strong>{t("app.householdManagement.membersTitle")}</strong>
          <span>{t("app.householdManagement.membersSummary", { count: management.members.length })}</span>
        </div>
        <div className="household-management-list">
          {management.members.map((member) => (
            <MemberEditor
              key={`${member.userId}:${member.updatedAt || "active"}:${member.isArchived ? "archived" : "live"}`}
              t={t}
              member={member}
              saving={saving}
              activeUserId={activeUserId}
              onSave={onSaveMember}
              onArchive={onArchiveMember}
              onRestore={onRestoreMember}
              onRemove={onRemoveMember}
              onActivate={onActivateMember}
            />
          ))}
        </div>
      </section>

      <section className="household-management-section">
        <div className="household-management-section-header">
          <strong>{t("app.householdManagement.addMemberTitle")}</strong>
          <span>{t("app.householdManagement.addMemberSummary")}</span>
        </div>
        <div className="household-management-grid">
          <label>
            <span>{t("app.householdManagement.fields.memberName")}</span>
            <input value={newMemberDraft.name} onChange={(event) => setNewMemberDraft((current) => ({ ...current, name: event.target.value }))} />
          </label>
          <label>
            <span>{t("app.householdManagement.fields.topTeeth")}</span>
            <input type="number" inputMode="numeric" min="0" max="16" value={newMemberDraft.topTeethCount} onChange={(event) => setNewMemberDraft((current) => ({ ...current, topTeethCount: event.target.value }))} />
          </label>
          <label>
            <span>{t("app.householdManagement.fields.bottomTeeth")}</span>
            <input type="number" inputMode="numeric" min="0" max="16" value={newMemberDraft.bottomTeethCount} onChange={(event) => setNewMemberDraft((current) => ({ ...current, bottomTeethCount: event.target.value }))} />
          </label>
          <label>
            <span>{t("app.householdManagement.fields.language")}</span>
            <select value={newMemberDraft.preferredLanguage} onChange={(event) => setNewMemberDraft((current) => ({ ...current, preferredLanguage: event.target.value }))}>
              <option value="en">English</option>
              <option value="es">Espanol</option>
              <option value="tr">Turkce</option>
            </select>
          </label>
        </div>
        <div className="household-management-inline-actions">
          <button
            type="button"
            className="action-btn"
            disabled={saving || !newMemberDraft.name.trim()}
            onClick={async () => {
              await onSaveMember(null, {
                ...newMemberDraft,
                topTeethCount: parseIntegerInput(newMemberDraft.topTeethCount, 16, 0, 16),
                bottomTeethCount: parseIntegerInput(newMemberDraft.bottomTeethCount, 16, 0, 16),
                brushDurationSeconds: parseIntegerInput(newMemberDraft.brushDurationSeconds, 120, 30, 600)
              });
              setNewMemberDraft(buildEmptyMemberDraft());
            }}
          >
            {saving ? t("app.householdManagement.saving") : t("common.buttons.addMember")}
          </button>
        </div>
      </section>

      {management.archivedMembers.length > 0 && (
        <section className="household-management-section">
          <div className="household-management-section-header">
            <strong>{t("app.householdManagement.archivedTitle")}</strong>
            <span>{t("app.householdManagement.archivedSummary", { count: management.archivedMembers.length })}</span>
          </div>
          <div className="household-management-list">
            {management.archivedMembers.map((member) => (
              <MemberEditor
                key={`${member.userId}:${member.updatedAt || "archived"}:archived`}
                t={t}
                member={member}
                saving={saving}
                activeUserId={activeUserId}
                onSave={onSaveMember}
                onArchive={onArchiveMember}
                onRestore={onRestoreMember}
                onRemove={onRemoveMember}
                onActivate={onActivateMember}
              />
            ))}
          </div>
        </section>
      )}

      <section className="household-management-section household-management-caregiver-note">
        <div className="household-management-section-header">
          <strong>{t("app.householdManagement.caregiverTitle")}</strong>
          <span>{t("app.householdManagement.caregiverSummary")}</span>
        </div>
        <p>{t("app.householdManagement.caregiverNote")}</p>
      </section>
    </section>
  );
}