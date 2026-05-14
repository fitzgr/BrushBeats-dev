import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import RoadmapSection from "./RoadmapSection";
import versionHistory from "../generated/versionHistory.json";

function cleanHistoryText(value) {
  return String(value || "").trim();
}

function formatHistoryDate(value) {
  if (!value) {
    return "";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium"
  }).format(new Date(value));
}

function buildApproximateVersion(index, total) {
  if (total <= 1) {
    return "v1.0.0";
  }

  if (index === total - 1) {
    return "v1.0.0";
  }

  return `v0.${index + 1}.0`;
}

function normalizeHistoryEntries(historyData) {
  const normalizeEntry = (entry, index) => {
    const sha = cleanHistoryText(entry?.sha);
    const shortSha = cleanHistoryText(entry?.shortSha) || sha.slice(0, 7);
    const timestamp = cleanHistoryText(entry?.timestamp);
    const date = cleanHistoryText(entry?.date) || timestamp.slice(0, 10);
    const subject = cleanHistoryText(entry?.subject);

    if (!timestamp || !date || !subject) {
      return null;
    }

    return {
      ...entry,
      id: cleanHistoryText(entry?.id) || sha || `history-entry-${index}`,
      sha,
      shortSha,
      timestamp,
      date,
      author: cleanHistoryText(entry?.author) || "BrushBeats",
      subject,
      body: cleanHistoryText(entry?.body),
      tags: Array.isArray(entry?.tags)
        ? entry.tags.map((tag) => cleanHistoryText(tag)).filter(Boolean)
        : []
    };
  };

  if (Array.isArray(historyData)) {
    return historyData.map(normalizeEntry).filter(Boolean);
  }

  if (Array.isArray(historyData?.developmentActivity)) {
    return historyData.developmentActivity.map(normalizeEntry).filter(Boolean);
  }

  return [];
}

function summarizeReleaseNotes(items) {
  const bodyBullets = items.flatMap((item) =>
    String(item?.body || "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => line.replace(/^[-*]\s+/, ""))
  );

  if (bodyBullets.length > 0) {
    return bodyBullets.slice(0, 4);
  }

  return items.slice(0, 4).map((item) => item.subject);
}

function buildReleaseHistory(entries, t) {
  const taggedReleases = entries
    .flatMap((entry) =>
      (entry?.tags || []).map((tagName) => ({
        id: `tag-${tagName}`,
        version: tagName,
        releasedAt: entry?.timestamp || entry?.date,
        notes: summarizeReleaseNotes([entry])
      }))
    )
    .filter((release) => release.version && release.releasedAt)
    .sort((left, right) => String(right.releasedAt).localeCompare(String(left.releasedAt)));

  if (taggedReleases.length > 0) {
    const seen = new Set();
    return taggedReleases.filter((release) => {
      if (seen.has(release.version)) {
        return false;
      }

      seen.add(release.version);
      return true;
    });
  }

  const groupedByDate = new Map();

  entries.forEach((entry) => {
    const dateKey = entry?.date || String(entry?.timestamp || "").slice(0, 10);
    if (!dateKey) {
      return;
    }

    if (!groupedByDate.has(dateKey)) {
      groupedByDate.set(dateKey, []);
    }

    groupedByDate.get(dateKey).push(entry);
  });

  const datedGroups = [...groupedByDate.entries()].sort(([leftDate], [rightDate]) => leftDate.localeCompare(rightDate));

  const releases = datedGroups.map(([dateKey, items], index) => {
    const releaseVersion = buildApproximateVersion(index, datedGroups.length);

    return {
      id: dateKey,
      version: releaseVersion,
      releasedAt: items[0]?.timestamp || dateKey,
      notes: summarizeReleaseNotes(items)
    };
  });

  return releases.reverse();
}

function VersionHistory({ onExit, onOpenStory }) {
  const { t } = useTranslation();
  const entries = useMemo(() => normalizeHistoryEntries(versionHistory), []);
  const releaseHistory = useMemo(() => buildReleaseHistory(entries, t), [entries, t]);
  const developmentActivity = useMemo(() => entries, [entries]);

  return (
    <section className="version-history-view card">
      <div className="version-history-header">
        <div>
          <p className="eyebrow">{t("history.eyebrow")}</p>
          <h2>{t("history.title")}</h2>
          <p>{t("history.intro")}</p>
        </div>
        <div className="version-history-header-actions">
          <button type="button" className="action-btn secondary" onClick={onOpenStory}>
            About the Developer
          </button>
          <button type="button" className="action-btn secondary" onClick={onExit}>
            {t("history.backToApp")}
          </button>
        </div>
      </div>

      <div className="version-history-grid">
        <section className="version-history-column">
          <h3>{t("history.releaseHistory")}</h3>
          <div className="timeline-list">
            {releaseHistory.length > 0 ? (
              releaseHistory.map((release) => (
                <article key={release.id} className="timeline-item">
                  <div className="timeline-item-header">
                    <span className="timeline-item-title">{release.version}</span>
                    <span className="timeline-item-meta">{formatHistoryDate(release.releasedAt)}</span>
                  </div>
                  {release.notes.map((note) => (
                    <p key={`${release.id}-${note}`} className="timeline-note">- {note}</p>
                  ))}
                </article>
              ))
            ) : (
              <p className="timeline-empty">{t("history.noReleaseHistory")}</p>
            )}
          </div>
        </section>

        <section className="version-history-column">
          <h3>{t("history.developmentActivity")}</h3>
          <p className="timeline-help">{t("history.developmentIntro")}</p>
          <div className="timeline-list">
            {developmentActivity.length > 0 ? (
              developmentActivity.map((entry) => (
                <article key={entry.id || entry.sha} className="timeline-item">
                  <div className="timeline-item-header">
                    <span className="timeline-item-title">{entry.subject}</span>
                    <span className="timeline-item-meta">{formatHistoryDate(entry.timestamp || entry.date)}</span>
                  </div>
                  <p className="timeline-item-meta">{entry.author || "BrushBeats"} · #{entry.shortSha}</p>
                </article>
              ))
            ) : (
              <p className="timeline-empty">{t("history.noDevelopmentActivity")}</p>
            )}
          </div>
        </section>
      </div>

      <RoadmapSection />
    </section>
  );
}

export default VersionHistory;