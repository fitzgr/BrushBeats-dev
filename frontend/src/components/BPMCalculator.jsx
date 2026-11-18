import { useTranslation } from "react-i18next";

function BPMCalculator({
  brushingHand,
  brushType,
  rotatingStartEnabled,
  rotatingStartPersistStatus,
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
}) {
  const { t } = useTranslation();
  const toothRange = { min: 0, max: 16, hint: t("settings.toothRangeHint") };
  const rangeMarks = Array.from({ length: toothRange.max - toothRange.min + 1 }, (_, index) => toothRange.min + index);
  const totalTeeth = Number(values.top || 0) + Number(values.bottom || 0);
  const perRowMarkers = [0, 2, 4, 6, 8, 10, 12, 14, 16];
  return (
    <section className="card calculator">
      <h2>{isMobile ? t("settings.resultsTitleMobile") : t("settings.resultsTitle")}</h2>
      <p>
        {isMobile
          ? t("settings.topBottomIntroMobile")
          : t("settings.topBottomIntroDesktop")}
      </p>

      <div className="calculator-overview">
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
        </div>
      </div>

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
            {rotatingStartPersistStatus !== "idle" && (
              <span className={`brush-start-rotation-status ${rotatingStartPersistStatus}`}>
                {rotatingStartPersistStatus === "saved"
                  ? t("brushing.rotatingStartToggle.statusSaved")
                  : rotatingStartPersistStatus === "saving"
                    ? t("brushing.rotatingStartToggle.statusSaving")
                    : rotatingStartPersistStatus === "storage-off"
                      ? t("brushing.rotatingStartToggle.statusStorageOff")
                      : t("brushing.rotatingStartToggle.statusError")}
              </span>
            )}
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
