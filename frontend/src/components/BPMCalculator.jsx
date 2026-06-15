import { useTranslation } from "react-i18next";
import AgeThemePanel from "./AgeThemePanel";
import AchievementBadgeList from "./AchievementBadgeList";
import { teethToAgeFullChart } from "../lib/teethAge";

function buildSimulationPreviewAchievements(phase) {
  const setsByPhase = {
    infant: [
      { achievementId: "simulation-first-session", achievementType: "first-session", tier: "bronze", pointsAwarded: 15 },
      { achievementId: "simulation-streak-3", achievementType: "streak-3", tier: "silver", pointsAwarded: 40 }
    ],
    toddler: [
      { achievementId: "simulation-first-session", achievementType: "first-session", tier: "bronze", pointsAwarded: 15 },
      { achievementId: "simulation-routine-mix", achievementType: "routine-mix", tier: "silver", pointsAwarded: 45 }
    ],
    primary: [
      { achievementId: "simulation-streak-3", achievementType: "streak-3", tier: "bronze", pointsAwarded: 30 },
      { achievementId: "simulation-ten-sessions", achievementType: "ten-sessions", tier: "silver", pointsAwarded: 60 }
    ],
    mixed: [
      { achievementId: "simulation-streak-7", achievementType: "streak-7", tier: "silver", pointsAwarded: 70 },
      { achievementId: "simulation-routine-mix", achievementType: "routine-mix", tier: "gold", pointsAwarded: 90 }
    ],
    adult: [
      { achievementId: "simulation-ten-sessions", achievementType: "ten-sessions", tier: "silver", pointsAwarded: 60 },
      { achievementId: "simulation-stage-transition", achievementType: "stage-transition", tier: "gold", pointsAwarded: 100 }
    ]
  };

  return setsByPhase[phase] || setsByPhase.adult;
}

function BPMCalculator({
  brusherProfile,
  actualBrusherProfile,
  ageUiProfile,
  brushingHand,
  brushType,
  rotatingStartEnabled,
  onBrushingHandChange,
  onBrushTypeChange,
  onRotatingStartEnabledChange,
  brushDurationOptions,
  onBrushDurationChange,
  isBrushControlsLocked,
  values,
  onChange,
  onContinueToMusic,
  bpmData,
  brushDurationSeconds,
  loading,
  isMobile,
  showSimulationControls,
  simulation,
  onSimulationToggle,
  onSimulationChange,
  onSimulationReset,
  overlayThemeChoice,
  overlayThemeOptions,
  onOverlayThemeChange,
}) {
  const { t } = useTranslation();
  const toothRange = { min: 0, max: 16, hint: t("settings.toothRangeHint") };
  const rangeMarks = Array.from({ length: toothRange.max - toothRange.min + 1 }, (_, index) => toothRange.min + index);
  const totalTeeth = Number(values.top || 0) + Number(values.bottom || 0);
  const perRowMarkers = [0, 2, 4, 6, 8, 10, 12, 14, 16];
  const linearMarkers = [0, 4, 8, 12, 16, 20, 24, 28, 32];
  const ageTimelineMarkers = [...teethToAgeFullChart].sort((left, right) => left.max - right.max);
  const selectedEstimate = brusherProfile?.estimate;
  const simulationPreviewAchievements = buildSimulationPreviewAchievements(brusherProfile?.estimate?.phase);
  const simulationMode = simulation?.mode || "exact";
  const themeOptions = Array.isArray(overlayThemeOptions) ? overlayThemeOptions : [];
  const overlayThemesAvailable = themeOptions.length > 0;

  function formatApproximateAge(estimate) {
    if (!estimate) {
      return "";
    }

    if (estimate.simulated && Number.isFinite(Number(estimate.exactAge))) {
      return estimate.unit === "months"
        ? t("age.descriptions.monthExact", { value: estimate.exactAge })
        : t("age.descriptions.yearExact", { value: estimate.exactAge });
    }

    const unit = t(`age.units.${estimate.unit}`);
    return estimate.maxAge >= 99
      ? t("settings.approximateAge.plus", { min: estimate.minAge, unit })
      : t("settings.approximateAge.range", { min: estimate.minAge, max: estimate.maxAge, unit });
  }

  return (
    <section className="card calculator">
      <h2>{isMobile ? t("settings.resultsTitleMobile") : t("settings.resultsTitle")}</h2>
      <p>
        {isMobile
          ? t("settings.topBottomIntroMobile")
          : t("settings.topBottomIntroDesktop")}
      </p>

      <div className="calculator-overview">
        <div className="profile-summary" aria-live="polite">
          <span className="profile-summary-label">{t("settings.detectedStage")}</span>
          <strong>{brusherProfile?.label || t("age.stages.adultSmile")}</strong>
          <span>{brusherProfile?.description || t("age.descriptions.yearsPlus", { min: 18 })}</span>
          {brusherProfile?.estimate && (
            <span className="profile-summary-age">
              {formatApproximateAge(brusherProfile.estimate)}
            </span>
          )}
          {simulation?.active && actualBrusherProfile?.label && (
            <span className="profile-summary-note">
              {t("settings.experienceSimulator.actualStage", { label: actualBrusherProfile.label })}
            </span>
          )}
        </div>

        <div className="bpm-pill" data-loading={loading}>
          <span className="label">{t("settings.searchBpm")}</span>
          <strong>{bpmData?.searchBpm ?? bpmData?.musicBpm ?? "--"}</strong>
          <span className="sub">
            {bpmData
              ? t("settings.searchBpmDetails", {
                  secondsPerTooth: bpmData.secondsPerTooth,
                  transitions: bpmData.totalTransitions,
                  transitionSeconds: bpmData.transitionBufferSeconds
                })
              : t("settings.searchBpmFallback", {
                  minutes: Math.round((brushDurationSeconds || 120) / 60 * 10) / 10
                })}
          </span>
          {isMobile && bpmData && (
            <span className="bpm-debug-line">
              Debug: {bpmData.totalToothActions} faces | {bpmData.totalToothTimeSeconds}s tooth time | (60 x {bpmData.beatsPerTooth}) / {bpmData.secondsPerTooth} = {bpmData.baseBpm} BPM
            </span>
          )}
        </div>
      </div>

      <AgeThemePanel profile={ageUiProfile} variant="spotlight" className="calculator-age-spotlight" />

      {showSimulationControls && (
        <section className={`experience-simulator-card${simulation?.active ? " active" : ""}`} aria-label={t("settings.experienceSimulator.ariaLabel")}>
          <div className="experience-simulator-header">
            <div>
              <span className="profile-summary-label">{t("settings.experienceSimulator.label")}</span>
              <strong>{t("settings.experienceSimulator.title")}</strong>
              <p>{t("settings.experienceSimulator.hint")}</p>
            </div>
            <label className="experience-simulator-toggle">
              <span>{t("settings.experienceSimulator.toggle")}</span>
              <input
                type="checkbox"
                checked={Boolean(simulation?.active)}
                onChange={(event) => onSimulationToggle?.(event.target.checked)}
              />
            </label>
          </div>

          <div className="experience-simulator-controls">
            <label>
              <span>{t("settings.experienceSimulator.previewMode")}</span>
              <select
                value={simulationMode}
                onChange={(event) => onSimulationChange?.("mode", event.target.value)}
                disabled={!simulation?.active}
              >
                <option value="exact">{t("settings.experienceSimulator.modes.exact")}</option>
                <option value="phase">{t("settings.experienceSimulator.modes.phase")}</option>
              </select>
            </label>
            <label>
              <span>{t("settings.experienceSimulator.ageGroup")}</span>
              <select
                value={simulation?.phase || "primary"}
                onChange={(event) => onSimulationChange?.("phase", event.target.value)}
                disabled={!simulation?.active}
              >
                <option value="infant">{t("age.stages.infant")}</option>
                <option value="toddler">{t("age.stages.toddler")}</option>
                <option value="primary">{t("age.stages.primary")}</option>
                <option value="mixed">{t("age.stages.mixed")}</option>
                <option value="adult">{t("age.stages.adultSmile")}</option>
              </select>
            </label>
            <label>
              <span>{t("settings.experienceSimulator.overlayTheme")}</span>
              <select
                value={overlayThemeChoice || "auto"}
                onChange={(event) => onOverlayThemeChange?.(event.target.value)}
                disabled={!overlayThemesAvailable}
              >
                <option value="auto">{t("settings.experienceSimulator.overlayThemeAuto")}</option>
                {themeOptions.map((theme) => (
                  <option key={theme.id} value={theme.id}>{theme.label}</option>
                ))}
              </select>
            </label>
            <label>
              <span>{t("settings.experienceSimulator.ageValue")}</span>
              <input
                type="number"
                min="0"
                max={simulation?.unit === "months" ? "216" : "99"}
                value={simulation?.value ?? ""}
                onChange={(event) => onSimulationChange?.("value", Number(event.target.value))}
                disabled={!simulation?.active || simulationMode === "phase"}
              />
            </label>
            <label>
              <span>{t("settings.experienceSimulator.ageUnit")}</span>
              <select
                value={simulation?.unit || "years"}
                onChange={(event) => onSimulationChange?.("unit", event.target.value)}
                disabled={!simulation?.active || simulationMode === "phase"}
              >
                <option value="months">{t("age.units.months")}</option>
                <option value="years">{t("age.units.years")}</option>
              </select>
            </label>
            <button type="button" className="action-btn secondary" onClick={onSimulationReset} disabled={!simulation?.active}>
              {t("settings.experienceSimulator.reset")}
            </button>
          </div>

          <p className="experience-simulator-theme-note">
            {overlayThemesAvailable
              ? t("settings.experienceSimulator.overlayThemeHint", { label: ageUiProfile?.overlayThemeLabel || themeOptions[0]?.label || "" })
              : t("settings.experienceSimulator.overlayThemeUnavailable")}
          </p>

          {simulation?.active && selectedEstimate && (
            <div className="experience-simulator-preview">
              <div className="experience-simulator-preview-copy">
                <strong>{t("settings.experienceSimulator.previewTitle", { label: brusherProfile?.label || t("age.stages.adultSmile") })}</strong>
                <span>{t("settings.experienceSimulator.previewBody", { age: formatApproximateAge(selectedEstimate) })}</span>
                {simulationMode === "phase" && (
                  <span className="experience-simulator-phase-note">{t("settings.experienceSimulator.phasePreviewNote")}</span>
                )}
              </div>
              <AchievementBadgeList
                t={t}
                achievements={simulationPreviewAchievements}
                title={t("settings.experienceSimulator.badgesTitle")}
                compact
              />
            </div>
          )}
        </section>
      )}

      <section className="brush-controls-in-calculator" aria-label={t("brushing.controlsTitle")}>
        <h3>{t("brushing.controlsTitle")}</h3>
        <p>{t("brushing.controlsIntro")}</p>

        <div className="brush-type-picker" role="group" aria-label={t("brushing.brushType")}>
          <span className="profile-summary-label">{t("brushing.brushType")}</span>
          <div className="brush-hand-actions">
            <button
              type="button"
              className={`brush-hand-btn${brushType === "manual" ? " active" : ""}`}
              onClick={() => onBrushTypeChange?.("manual")}
              disabled={isBrushControlsLocked}
            >
              {t("brushing.brushTypeManual")}
            </button>
            <button
              type="button"
              className={`brush-hand-btn${brushType === "electric" ? " active" : ""}`}
              onClick={() => onBrushTypeChange?.("electric")}
              disabled={isBrushControlsLocked}
            >
              {t("brushing.brushTypeElectric")}
            </button>
          </div>
        </div>

        <div className="brush-hand-picker" role="group" aria-label={t("brushing.handPreference")}>
          <span className="profile-summary-label">{t("brushing.handPreference")}</span>
          <div className="brush-hand-actions">
            <button
              type="button"
              className={`brush-hand-btn${brushingHand === "left" ? " active" : ""}`}
              onClick={() => onBrushingHandChange?.("left")}
              disabled={isBrushControlsLocked}
            >
              {t("common.buttons.leftHand")}
            </button>
            <button
              type="button"
              className={`brush-hand-btn${brushingHand === "right" ? " active" : ""}`}
              onClick={() => onBrushingHandChange?.("right")}
              disabled={isBrushControlsLocked}
            >
              {t("common.buttons.rightHand")}
            </button>
          </div>
        </div>

        <label className="brush-start-rotation-toggle">
          <span className="profile-summary-label">{t("brushing.rotatingStartToggle.label")}</span>
          <span className="brush-start-rotation-toggle-row">
            <input
              type="checkbox"
              checked={Boolean(rotatingStartEnabled)}
              onChange={(event) => onRotatingStartEnabledChange?.(event.target.checked)}
              disabled={isBrushControlsLocked}
            />
            <span>{t("brushing.rotatingStartToggle.option")}</span>
          </span>
          <span className="brush-duration-hint">{t("brushing.rotatingStartToggle.hint")}</span>
        </label>

        <label className="brush-duration-picker">
          <span className="profile-summary-label">{t("brushing.duration")}</span>
          <select
            value={brushDurationSeconds}
            onChange={(event) => onBrushDurationChange?.(Number(event.target.value))}
            disabled={isBrushControlsLocked}
          >
            {(brushDurationOptions || []).map((option) => (
              <option key={option} value={option}>
                {Math.floor(option / 60)}:{String(option % 60).padStart(2, "0")}
              </option>
            ))}
          </select>
          <span className="brush-duration-hint">{t("brushing.durationHint")}</span>
        </label>
      </section>

      <div className="controls-grid">
        <label className="tooth-count-control">
          <span className="slider-label-row">
            <span>{t("settings.topTeeth")}</span>
            <strong className="slider-value-badge">{values.top}</strong>
          </span>
          <span className="tooth-range-shell">
            <input
              className="tooth-range-input"
              type="range"
              min={toothRange.min}
              max={toothRange.max}
              step="1"
              value={values.top}
              onChange={(event) => onChange("top", Number(event.target.value))}
            />
            <span className="tooth-range-ticks" aria-hidden="true">
              {rangeMarks.map((mark) => (
                <span
                  key={`top-${mark}`}
                  className="tooth-range-tick"
                  style={{ left: `${((mark - toothRange.min) / Math.max(1, toothRange.max - toothRange.min)) * 100}%` }}
                />
              ))}
            </span>
          </span>
          <span className="tooth-range-scale" aria-hidden="true">
            {perRowMarkers.map((marker) => (
              <span
                key={`top-scale-${marker}`}
                className="tooth-range-scale-label"
                style={{ left: `${(marker / toothRange.max) * 100}%` }}
              >
                {marker}
              </span>
            ))}
          </span>
          <span className="tooth-range-scale-caption">{t("settings.teethCount")}</span>
          <span className="slider-range-hint">{toothRange.hint}</span>
        </label>

        <label className="tooth-count-control">
          <span className="slider-label-row">
            <span>{t("settings.bottomTeeth")}</span>
            <strong className="slider-value-badge">{values.bottom}</strong>
          </span>
          <span className="tooth-range-shell">
            <input
              className="tooth-range-input"
              type="range"
              min={toothRange.min}
              max={toothRange.max}
              step="1"
              value={values.bottom}
              onChange={(event) => onChange("bottom", Number(event.target.value))}
            />
            <span className="tooth-range-ticks" aria-hidden="true">
              {rangeMarks.map((mark) => (
                <span
                  key={`bottom-${mark}`}
                  className="tooth-range-tick"
                  style={{ left: `${((mark - toothRange.min) / Math.max(1, toothRange.max - toothRange.min)) * 100}%` }}
                />
              ))}
            </span>
          </span>
          <span className="tooth-range-scale" aria-hidden="true">
            {perRowMarkers.map((marker) => (
              <span
                key={`bottom-scale-${marker}`}
                className="tooth-range-scale-label"
                style={{ left: `${(marker / toothRange.max) * 100}%` }}
              >
                {marker}
              </span>
            ))}
          </span>
        </label>
      </div>

      <div className="teeth-growth-scale" aria-label="Total teeth to age scale">
        <div className="teeth-growth-header">
          <div>
            <span className="profile-summary-label">{t("settings.totalTeethSelected")}</span>
            <strong>{t("settings.totalTeethValue", { count: totalTeeth })}</strong>
          </div>
          {selectedEstimate && (
            <span className="teeth-growth-age-caption">{formatApproximateAge(selectedEstimate)}</span>
          )}
        </div>
        <div className="teeth-growth-track">
          <span className="teeth-growth-fill" style={{ width: `${(totalTeeth / 32) * 100}%` }} />
          <span className="teeth-growth-indicator" style={{ left: `${(totalTeeth / 32) * 100}%` }} />
          {linearMarkers.map((marker) => (
            <span
              key={`teeth-marker-${marker}`}
              className="teeth-growth-marker"
              style={{ left: `${(marker / 32) * 100}%` }}
              aria-hidden="true"
            />
          ))}
        </div>
        <div className="teeth-growth-labels" aria-hidden="true">
          {linearMarkers.map((marker) => (
            <span key={`teeth-label-${marker}`}>{marker}</span>
          ))}
        </div>
        <div className="teeth-age-band-list">
          {ageTimelineMarkers.map((marker) => (
            <span key={`${marker.min}-${marker.max}`} className="teeth-age-band">
              <strong>{marker.min}-{marker.max}</strong>
              <span>{t(`age.phases.${marker.phase}`)}</span>
              <small>{formatApproximateAge(marker)}</small>
            </span>
          ))}
        </div>
      </div>

      <p className="form-note">{t("settings.formNote")}</p>

      <p className="headline">
        {bpmData
          ? t("settings.headlineCalculated", {
              totalTeeth: bpmData.totalTeeth,
              toothTime: bpmData.totalToothTimeSeconds,
              transitionTime: bpmData.totalTransitionSeconds,
              minutes: Math.round((bpmData.totalBrushingSeconds / 60) * 10) / 10
            })
          : t("settings.headlineEmpty")}
      </p>

      <div className="next-step-card">
        <strong>{t("settings.nextStepTitle")}</strong>
        <span>{t("settings.nextStepDescription")}</span>
        <button type="button" className="action-btn secondary next-step-btn" onClick={onContinueToMusic} disabled={totalTeeth <= 0}>
          {t("common.buttons.continueToMusic")}
        </button>
      </div>
    </section>
  );
}

export default BPMCalculator;
