import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { parsePlayerVideoId } from "../lib/playerVideoId";

function Player({
  selectedSong,
  playerData,
  silentMode = false,
  loading,
  brushingPhase,
  isMobile,
  compactMobileFrame = false,
  showRestoredSessionBadge = false,
  autoplayToken,
  playbackCommand,
  onPlaybackTick,
  onPlaybackDurationChange,
  onSongEnded,
  children
}) {
  const { t } = useTranslation();
  const hostRef = useRef(null);
  const playerRef = useRef(null);
  const tickTimerRef = useRef(null);
  const pendingCommandRef = useRef(null);
  const onPlaybackTickRef = useRef(onPlaybackTick);
  const onPlaybackDurationChangeRef = useRef(onPlaybackDurationChange);
  const onSongEndedRef = useRef(onSongEnded);
  const [apiReady, setApiReady] = useState(Boolean(window.YT?.Player));
  const [playerError, setPlayerError] = useState("");
  const videoId = useMemo(() => parsePlayerVideoId(playerData), [playerData]);

  useEffect(() => {
    onPlaybackTickRef.current = onPlaybackTick;
  }, [onPlaybackTick]);

  useEffect(() => {
    onSongEndedRef.current = onSongEnded;
  }, [onSongEnded]);

  useEffect(() => {
    onPlaybackDurationChangeRef.current = onPlaybackDurationChange;
  }, [onPlaybackDurationChange]);

  const stopTickTimer = useCallback(() => {
    if (tickTimerRef.current) {
      window.clearInterval(tickTimerRef.current);
      tickTimerRef.current = null;
    }
  }, []);

  const startTickTimer = useCallback(() => {
    if (tickTimerRef.current) {
      window.clearInterval(tickTimerRef.current);
      tickTimerRef.current = null;
    }
    tickTimerRef.current = window.setInterval(() => {
      const seconds = playerRef.current?.getCurrentTime?.() ?? 0;
      onPlaybackTickRef.current?.(seconds);
    }, 250);
  }, []);

  const destroyPlayer = useCallback(() => {
    if (!playerRef.current) {
      return;
    }

    try {
      playerRef.current.destroy();
    } catch (error) {
      // Some mobile browsers can throw if the iframe node was already detached.
      console.warn("Failed to destroy YouTube player safely", error);
    } finally {
      playerRef.current = null;
    }
  }, []);

  const applyPlayerCommand = useCallback((command) => {
    if (!command || !playerRef.current) {
      return false;
    }

    if (command.type === "play") {
      playerRef.current.playVideo?.();
      return true;
    }

    if (command.type === "pause") {
      playerRef.current.pauseVideo?.();
      stopTickTimer();
      onPlaybackTickRef.current?.(playerRef.current?.getCurrentTime?.() ?? 0);
      return true;
    }

    if (command.type === "restart") {
      stopTickTimer();
      playerRef.current.seekTo?.(0, true);
      playerRef.current.playVideo?.();
      onPlaybackTickRef.current?.(0);
      return true;
    }

    if (command.type === "reset") {
      if (videoId && playerRef.current.cueVideoById) {
        playerRef.current.cueVideoById(videoId, 0);
      } else {
        playerRef.current.pauseVideo?.();
        playerRef.current.seekTo?.(0, true);
      }
      stopTickTimer();
      onPlaybackTickRef.current?.(0);
      return true;
    }

    return false;
  }, [stopTickTimer, videoId]);

  useEffect(() => {
    if (window.YT?.Player) {
      return;
    }

    const existingScript = document.querySelector('script[src="https://www.youtube.com/iframe_api"]');

    if (!existingScript) {
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      document.body.appendChild(script);
    }

    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (typeof previous === "function") {
        previous();
      }
      setApiReady(true);
    };

    return () => {
      window.onYouTubeIframeAPIReady = previous;
    };
  }, []);

  useEffect(() => {
    if (!apiReady || !hostRef.current || playerRef.current || !videoId) {
      return;
    }

    try {
      playerRef.current = new window.YT.Player(hostRef.current, {
      width: "100%",
      height: "100%",
      host: "https://www.youtube-nocookie.com",
      videoId,
      playerVars: {
        rel: 0,
        autoplay: 0,
        playsinline: 1,
        modestbranding: 1,
        controls: 1,
        fs: 1,
        enablejsapi: 1,
        origin: window.location.origin
      },
      events: {
        onReady: () => {
          onPlaybackDurationChangeRef.current?.(playerRef.current?.getDuration?.() ?? 0);
          onPlaybackTickRef.current?.(playerRef.current?.getCurrentTime?.() ?? 0);
          if (pendingCommandRef.current) {
            const pending = pendingCommandRef.current;
            pendingCommandRef.current = null;
            applyPlayerCommand(pending);
          }
        },
        onError: (event) => {
          stopTickTimer();
          setPlayerError(t("player.noEmbed", { title: selectedSong?.title || "" }));
          console.error("YouTube player error", event?.data, { videoId });
        },
        onStateChange: (event) => {
          if (event.data === window.YT?.PlayerState?.PLAYING) {
            startTickTimer();
          }

          if (event.data === window.YT?.PlayerState?.PAUSED || event.data === window.YT?.PlayerState?.BUFFERING) {
            stopTickTimer();
          }

          if (event.data === window.YT?.PlayerState?.ENDED) {
            stopTickTimer();
            onSongEndedRef.current?.();
          }
        }
      }
      });
    } catch (error) {
      // The external IFrame API may reject a video or fail during initialization.
      // Keep the app usable and let the user choose another song.
      console.warn("YouTube player could not start", error);
      playerRef.current = null;
      setPlayerError(t("player.noEmbed", { title: selectedSong?.title || "" }));
    }

    return () => {
      stopTickTimer();
      destroyPlayer();
    };
  }, [apiReady, applyPlayerCommand, destroyPlayer, selectedSong?.title, startTickTimer, stopTickTimer, t, videoId]);

  useEffect(() => {
    if (!playerRef.current || !videoId) {
      return;
    }

    setPlayerError("");
    stopTickTimer();
    try {
      playerRef.current.cueVideoById?.(videoId, 0);
      onPlaybackTickRef.current?.(0);
    } catch (error) {
      console.warn("Could not cue YouTube video", error);
      setPlayerError(t("player.noEmbed", { title: selectedSong?.title || "" }));
    }
  }, [videoId, stopTickTimer, selectedSong?.title, t]);

  useEffect(() => {
    if (!autoplayToken || !playerRef.current) {
      return;
    }

    playerRef.current.playVideo?.();
  }, [autoplayToken]);

  useEffect(() => {
    if (!playbackCommand?.nonce) {
      return;
    }

    pendingCommandRef.current = playbackCommand;

    if (applyPlayerCommand(playbackCommand)) {
      pendingCommandRef.current = null;
    }
  }, [applyPlayerCommand, playbackCommand]);

  const playerClassName = `card player${compactMobileFrame ? " compact-mobile-frame" : ""}`;
  const frameMinHeight = isMobile ? "0px" : "200px";

  return (
    <section className={playerClassName}>
      <h2>{silentMode ? "Free brushing timer" : (isMobile ? t("player.titleMobile") : t("player.titleDesktop"))}</h2>
      <p>{silentMode ? "Brush with the timer and tooth-by-tooth guide. Music is optional." : (isMobile ? t("player.introMobile") : t("player.introDesktop"))}</p>

      {loading && <p>{t("player.matchingYoutube")}</p>}

      {!loading && !selectedSong && !silentMode && <p>{t("player.selectSong")}</p>}

      {!loading && selectedSong && !videoId && (
        <p>{t("player.noEmbed", { title: selectedSong.title })}</p>
      )}

      {!loading && playerError && <p>{playerError}</p>}

      {brushingPhase === "running" && (
        <p className="player-status">{t("player.runningStatus")}</p>
      )}

      {selectedSong && (
        <>
          {showRestoredSessionBadge && (
            <div className="player-meta-row">
              <span className="player-restored-chip">{t("player.restoredSession")}</span>
            </div>
          )}
          <h3>
            {selectedSong.title} - {selectedSong.artist}
          </h3>
          <details className="player-disclaimer">
            <summary>{t("player.artistRightsSummary")}</summary>
            <p>{t("player.artistRightsBody")}</p>
          </details>
          <div className="player-frame-shell" style={{ minHeight: frameMinHeight }}>
            <div
              ref={hostRef}
              className="player-frame"
              aria-label={t("player.frameAria", { title: selectedSong.title, artist: selectedSong.artist })}
              style={{ opacity: playerData?.embedUrl ? 1 : 0.4 }}
            />
            {loading && (
              <div className="player-loading-overlay">
                {t("player.loadingVideo")}
              </div>
            )}
          </div>
          {children}
        </>
      )}
      {!selectedSong && silentMode && children}
    </section>
  );
}

export default Player;
