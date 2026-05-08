import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

const YOUTUBE_VIDEO_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;

function normalizeVideoId(value) {
  const candidate = String(value || "").trim();
  return YOUTUBE_VIDEO_ID_REGEX.test(candidate) ? candidate : null;
}

function parseVideoId(playerData) {
  if (playerData?.videoId) {
    return normalizeVideoId(playerData.videoId);
  }

  if (!playerData?.embedUrl) {
    return null;
  }

  try {
    const url = new URL(playerData.embedUrl);
    return normalizeVideoId(url.pathname.split("/").pop());
  } catch {
    return null;
  }
}

function Player({
  selectedSong,
  playerData,
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
  const onPlaybackTickRef = useRef(onPlaybackTick);
  const onPlaybackDurationChangeRef = useRef(onPlaybackDurationChange);
  const onSongEndedRef = useRef(onSongEnded);
  const [apiReady, setApiReady] = useState(Boolean(window.YT?.Player));
  const [playerError, setPlayerError] = useState("");
  const videoId = useMemo(() => parseVideoId(playerData), [playerData]);

  useEffect(() => {
    onPlaybackTickRef.current = onPlaybackTick;
  }, [onPlaybackTick]);

  useEffect(() => {
    onSongEndedRef.current = onSongEnded;
  }, [onSongEnded]);

  useEffect(() => {
    onPlaybackDurationChangeRef.current = onPlaybackDurationChange;
  }, [onPlaybackDurationChange]);

  const stopTickTimer = useEffectEvent(() => {
    if (tickTimerRef.current) {
      window.clearInterval(tickTimerRef.current);
      tickTimerRef.current = null;
    }
  });

  const startTickTimer = useEffectEvent(() => {
    stopTickTimer();
    tickTimerRef.current = window.setInterval(() => {
      const seconds = playerRef.current?.getCurrentTime?.() ?? 0;
      onPlaybackTickRef.current?.(seconds);
    }, 250);
  });

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
    if (!apiReady || !videoId || !hostRef.current) {
      return;
    }

    setPlayerError("");

    hostRef.current.replaceChildren();

    if (playerRef.current) {
      playerRef.current.destroy();
      playerRef.current = null;
    }

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

    return () => {
      stopTickTimer();
      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
      }
    };
  }, [apiReady, videoId]);

  useEffect(() => {
    if (!autoplayToken || !playerRef.current) {
      return;
    }

    playerRef.current.playVideo?.();
  }, [autoplayToken]);

  useEffect(() => {
    if (!playbackCommand?.nonce || !playerRef.current) {
      return;
    }

    if (playbackCommand.type === "play") {
      playerRef.current.playVideo?.();
      return;
    }

    if (playbackCommand.type === "pause") {
      playerRef.current.pauseVideo?.();
      stopTickTimer();
      onPlaybackTickRef.current?.(playerRef.current?.getCurrentTime?.() ?? 0);
      return;
    }

    if (playbackCommand.type === "restart") {
      stopTickTimer();
      playerRef.current.seekTo?.(0, true);
      playerRef.current.playVideo?.();
      onPlaybackTickRef.current?.(0);
      return;
    }

    if (playbackCommand.type === "reset") {
      if (videoId && playerRef.current.cueVideoById) {
        playerRef.current.cueVideoById(videoId, 0);
      } else {
        playerRef.current.pauseVideo?.();
        playerRef.current.seekTo?.(0, true);
      }
      stopTickTimer();
      onPlaybackTickRef.current?.(0);
    }
  }, [playbackCommand, stopTickTimer, videoId]);

  const playerClassName = `card player${compactMobileFrame ? " compact-mobile-frame" : ""}`;
  const frameMinHeight = isMobile ? "0px" : "200px";

  return (
    <section className={playerClassName}>
      <h2>{isMobile ? t("player.titleMobile") : t("player.titleDesktop")}</h2>
      <p>{isMobile ? t("player.introMobile") : t("player.introDesktop")}</p>

      {loading && <p>{t("player.matchingYoutube")}</p>}

      {!loading && !selectedSong && <p>{t("player.selectSong")}</p>}

      {!loading && selectedSong && !playerData?.embedUrl && (
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
          <div className="player-frame-shell" style={{ minHeight: frameMinHeight }}>
            <div
              key={videoId || "player-host"}
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
    </section>
  );
}

export default Player;
