import { useTranslation } from "react-i18next";

function SongList({
  songs,
  exhausted,
  loading,
  tolerance,
  danceability,
  acousticness,
  keyword,
  isMobile,
  onToleranceChange,
  onDanceabilityChange,
  onAcousticnessChange,
  onCommitTolerance,
  onCommitDanceability,
  onCommitAcousticness,
  onKeywordChange,
  onSelectSong,
  onRegenerate,
  favorites = [],
  onToggleFavorite
}) {
  const { t } = useTranslation();

  function toSongKey(song) {
    return `${(song?.title || "").trim().toLowerCase()}::${(song?.artist || "").trim().toLowerCase()}`;
  }

  const favoriteKeySet = new Set((favorites || []).map((song) => toSongKey(song)));

  function handleRangeCommit(commitHandler) {
    return (event) => {
      commitHandler(Number(event.currentTarget.value));
    };
  }

  return (
    <section className="card songs">
      <h2>{isMobile ? t("music.resultsTitleMobile") : t("music.resultsTitle")}</h2>
      <p>{isMobile ? t("music.introMobile") : t("music.introDesktop")}</p>
      <p className="song-note">{isMobile ? t("music.noteMobile") : t("music.noteDesktop")}</p>
      <p className="song-note">{t("music.randomFiltersNote")}</p>

      <div className="song-filters">
        <label>
          {t("music.tolerance", { value: tolerance })}
          <input
            type="range"
            min="1"
            max="20"
            value={tolerance}
            onChange={(event) => onToleranceChange(Number(event.target.value))}
            onPointerUp={handleRangeCommit(onCommitTolerance)}
            onBlur={handleRangeCommit(onCommitTolerance)}
          />
        </label>

        <label>
          {t("music.danceability", { value: danceability })}
          <input
            type="range"
            min="0"
            max="100"
            value={danceability}
            onChange={(event) => onDanceabilityChange(Number(event.target.value))}
            onPointerUp={handleRangeCommit(onCommitDanceability)}
            onBlur={handleRangeCommit(onCommitDanceability)}
          />
        </label>

        <label>
          {t("music.acousticness", { value: acousticness })}
          <input
            type="range"
            min="0"
            max="100"
            value={acousticness}
            onChange={(event) => onAcousticnessChange(Number(event.target.value))}
            onPointerUp={handleRangeCommit(onCommitAcousticness)}
            onBlur={handleRangeCommit(onCommitAcousticness)}
          />
        </label>

        <label>
          {t("music.searchBy")}
          <input
            type="text"
            value={keyword}
            placeholder={t("music.searchPlaceholder")}
            onChange={(event) => onKeywordChange(event.target.value)}
          />
        </label>

        <button type="button" className="action-btn regen" onClick={onRegenerate} disabled={loading}>
          {loading ? t("common.buttons.refreshing") : isMobile ? t("common.buttons.regenerateSongs") : t("common.buttons.regenerateArtistsSongs")}
        </button>
      </div>

      {loading && <p>{t("music.loading")}</p>}
      {!loading && songs.length === 0 && <p>{t("music.empty")}</p>}
      {!loading && exhausted && (
        <p>{t("music.exhausted")}</p>
      )}

      <ul className="song-list">
        {songs.map((song, index) => (
          <li key={`${song.title}-${song.artist}-${index}`}>
            <div>
              <strong>{song.title}</strong>
              <span>{song.artist}</span>
            </div>
            <div>
              <span className="song-bpm">{t("music.songBpm", { bpm: song.bpm })}</span>
              <button
                type="button"
                className={`favorite-btn${favoriteKeySet.has(toSongKey(song)) ? " active" : ""}`}
                onClick={() => onToggleFavorite?.(song)}
              >
                {favoriteKeySet.has(toSongKey(song)) ? t("music.favorites.saved") : t("music.favorites.save")}
              </button>
              <button type="button" onClick={() => onSelectSong(song)}>
                {t("common.buttons.queue")}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default SongList;
