import { useMemo, useState } from "react";
import { searchYoutubeVideos } from "../api/client";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:4000";

const YOUTUBE_VIDEO_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;

function normalizeYoutubeVideoId(value) {
  const candidate = String(value || "").trim();
  return YOUTUBE_VIDEO_ID_REGEX.test(candidate) ? candidate : null;
}

function extractYoutubeVideoId(input) {
  const rawInput = String(input || "").trim();
  if (!rawInput) {
    return null;
  }

  const directVideoId = normalizeYoutubeVideoId(rawInput);
  if (directVideoId) {
    return directVideoId;
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(rawInput);
  } catch {
    return null;
  }

  const hostname = parsedUrl.hostname.replace(/^www\./, "").toLowerCase();

  if (hostname === "youtu.be") {
    return normalizeYoutubeVideoId(parsedUrl.pathname.split("/").filter(Boolean)[0]);
  }

  if (hostname !== "youtube.com" && hostname !== "m.youtube.com" && hostname !== "music.youtube.com") {
    return null;
  }

  const queryVideoId = parsedUrl.searchParams.get("v");
  if (queryVideoId) {
    return normalizeYoutubeVideoId(queryVideoId);
  }

  const pathSegments = parsedUrl.pathname.split("/").filter(Boolean);
  if (pathSegments.length >= 2 && ["embed", "shorts", "live"].includes(pathSegments[0])) {
    return normalizeYoutubeVideoId(pathSegments[1]);
  }

  return null;
}

function buildShareableLink(videoId, videoTitle) {
  if (typeof window === "undefined") {
    return "";
  }

  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("videoId", videoId);

  const trimmedTitle = String(videoTitle || "").trim();
  if (trimmedTitle) {
    url.searchParams.set("videoTitle", trimmedTitle);
  }

  return url.toString();
}

export default function ArtistPromoPage({
  onExit,
  onPreviewVideo,
  profileLabel,
  activeUserName
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [searchMessage, setSearchMessage] = useState("");
  const [selectedResultVideoId, setSelectedResultVideoId] = useState("");
  const [youtubeInput, setYoutubeInput] = useState("");
  const [videoTitle, setVideoTitle] = useState("");
  const [generatedVideoId, setGeneratedVideoId] = useState("");
  const [shareLink, setShareLink] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [copyMessage, setCopyMessage] = useState("");
  const [debugOpen, setDebugOpen] = useState(false);
  const [debugLog, setDebugLog] = useState([]);
  const [debugCopied, setDebugCopied] = useState(false);

  const personalizationLabel = useMemo(() => {
    if (activeUserName && profileLabel) {
      return `${activeUserName} · ${profileLabel}`;
    }

    if (activeUserName) {
      return activeUserName;
    }

    return profileLabel || "Current BrushBeats user";
  }, [activeUserName, profileLabel]);

  const apiBaseWarning = useMemo(() => {
    const rawApiBase = String(API_BASE || "").trim();

    if (!rawApiBase) {
      return "VITE_API_BASE is empty. Set it to your deployed backend URL.";
    }

    let parsedApiBase;
    try {
      parsedApiBase = new URL(rawApiBase);
    } catch {
      return "VITE_API_BASE is not a valid URL. Use a full URL like https://your-backend.onrender.com.";
    }

    const host = parsedApiBase.hostname.toLowerCase();

    if (host.includes("github.com") || host.includes("github.io")) {
      return "VITE_API_BASE points to GitHub, not your backend API. Use your backend service URL.";
    }

    if (typeof window !== "undefined" && window.location.hostname.includes("github.io") && host === "localhost") {
      return "VITE_API_BASE points to localhost while this page is hosted on GitHub Pages. Use your deployed backend URL.";
    }

    if (parsedApiBase.protocol !== "https:" && parsedApiBase.protocol !== "http:") {
      return "VITE_API_BASE must start with http:// or https://.";
    }

    return "";
  }, []);

  function handleOpenYoutubeSearch() {
    const query = String(searchQuery || "").trim();
    if (!query || typeof window === "undefined") {
      return;
    }

    const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
    window.open(searchUrl, "_blank", "noopener,noreferrer");
  }

  async function handleSearchInPage() {
    const query = String(searchQuery || "").trim();
    if (!query) {
      setSearchResults([]);
      setSearchMessage("Enter search terms to find a YouTube video.");
      return;
    }

    setSearchLoading(true);
    setSearchMessage("Searching YouTube via BrushBeats backend (YouTube Data API) — may take a moment on first use.");
    setErrorMessage("");

    const startMs = Date.now();
    const debugEntry = {
      time: new Date().toISOString(),
      query,
      apiBase: API_BASE,
      endpoint: `${API_BASE}/api/youtube/search?q=${encodeURIComponent(query)}&maxResults=8`,
      status: "pending",
      durationMs: null,
      resultCount: null,
      error: null,
    };

    try {
      const response = await searchYoutubeVideos({ query, maxResults: 8 });
      const nextResults = Array.isArray(response?.items) ? response.items : [];
      debugEntry.status = "ok";
      debugEntry.durationMs = Date.now() - startMs;
      debugEntry.resultCount = nextResults.length;
      setSearchResults(nextResults);

      if (!nextResults.length) {
        setSearchMessage("No matching videos found. Try a different title, artist, or spelling.");
      } else {
        setSearchMessage("");
      }
    } catch (error) {
      debugEntry.status = "error";
      debugEntry.durationMs = Date.now() - startMs;
      debugEntry.error = error?.message || String(error);
      setSearchResults([]);
      setSearchMessage(error?.message || "Search failed. The backend may still be starting up — wait a few seconds and try again.");
    } finally {
      setSearchLoading(false);
      setDebugLog((prev) => [debugEntry, ...prev].slice(0, 10));
    }
  }

  function handleSelectSearchResult(result) {
    const selectedVideoId = normalizeYoutubeVideoId(result?.videoId);
    if (!selectedVideoId) {
      return;
    }

    const selectedTitle = String(result?.title || "").trim();
    const selectedYoutubeUrl = result?.youtubeUrl || `https://www.youtube.com/watch?v=${selectedVideoId}`;
    setSelectedResultVideoId(selectedVideoId);
    setYoutubeInput(selectedYoutubeUrl);
    setVideoTitle((current) => (String(current || "").trim() ? current : selectedTitle));
    setGeneratedVideoId(selectedVideoId);
    setShareLink(buildShareableLink(selectedVideoId, selectedTitle || videoTitle));
    setErrorMessage("");
    setCopyMessage("");
  }

  function handleGenerateLink() {
    const nextVideoId = extractYoutubeVideoId(youtubeInput);
    if (!nextVideoId) {
      setGeneratedVideoId("");
      setShareLink("");
      setErrorMessage("Please paste a valid YouTube video URL or 11-character video ID.");
      setCopyMessage("");
      return;
    }

    const nextShareLink = buildShareableLink(nextVideoId, videoTitle);
    setGeneratedVideoId(nextVideoId);
    setShareLink(nextShareLink);
    setErrorMessage("");
    setCopyMessage("");
  }

  async function handleCopyLink() {
    if (!shareLink) {
      return;
    }

    try {
      await navigator.clipboard.writeText(shareLink);
      setCopyMessage("Copied: share this link to let users preview your video in BrushBeats.");
    } catch {
      setCopyMessage("Copy failed on this browser. You can still copy the link manually.");
    }
  }

  function handlePreviewInApp() {
    if (!generatedVideoId) {
      return;
    }

    onPreviewVideo?.({
      videoId: generatedVideoId,
      title: String(videoTitle || "").trim() || "Artist Spotlight Video"
    });
  }

  return (
    <section className="artist-promo-page card" aria-label="Artist promotion tools">
      <div className="artist-promo-header">
        <p className="story-eyebrow">For Artists</p>
        <h2>Promote Your YouTube Video Inside BrushBeats</h2>
        <p>
          Build a shareable BrushBeats link from your YouTube video so users can preload it, preview it, and choose to brush in sync.
        </p>
        <p className="artist-promo-personalization">
          Personalization target: <strong>{personalizationLabel}</strong>
        </p>
      </div>

      <div className="artist-promo-section">
        <h3>1) Find Your Video</h3>
        <p>Search YouTube in this page, then click a result to auto-fill the video field below.</p>
        <div className="artist-promo-row">
          <input
            className="artist-promo-input"
            type="text"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void handleSearchInPage();
              }
            }}
            placeholder="Search terms (artist + track)"
            aria-label="YouTube search query"
          />
          <button type="button" className="action-btn" onClick={handleSearchInPage} disabled={searchLoading}>
            {searchLoading ? "Searching..." : "Search In Page"}
          </button>
          <button type="button" className="action-btn secondary" onClick={handleOpenYoutubeSearch}>
            Open YouTube Search
          </button>
        </div>
        {searchMessage && <p className="artist-promo-search-message">{searchMessage}</p>}
        <div className="artist-debug-panel">
          <button
            type="button"
            className="artist-debug-toggle"
            onClick={() => setDebugOpen((v) => !v)}
            aria-expanded={debugOpen}
          >
            {debugOpen ? "▲ Hide debug info" : "▼ Show debug info"}
          </button>
          {debugOpen && (
            <div className="artist-debug-body">
              {apiBaseWarning && (
                <p className="artist-debug-warning" role="alert">
                  Config warning: {apiBaseWarning}
                </p>
              )}
              <dl className="artist-debug-env">
                <dt>Backend URL</dt>
                <dd><code>{API_BASE}</code></dd>
                <dt>Search endpoint</dt>
                <dd><code>{API_BASE}/api/youtube/search</code></dd>
                <dt>Page origin</dt>
                <dd><code>{typeof window !== "undefined" ? window.location.origin : "—"}</code></dd>
              </dl>
              {debugLog.length === 0 ? (
                <p className="artist-debug-empty">No searches yet. Run a search to capture timing &amp; status.</p>
              ) : (
                <>
                  <button
                    type="button"
                    className="artist-debug-copy-btn"
                    onClick={async () => {
                      const text = [
                        `Backend: ${API_BASE}`,
                        `Origin: ${window.location.origin}`,
                        `Config warning: ${apiBaseWarning || "none"}`,
                        `Searches:`,
                        ...debugLog.map((e) =>
                          `  [${e.time}] "${e.query}" → ${e.status} (${e.durationMs ?? "?"}ms)${e.resultCount != null ? ` · ${e.resultCount} results` : ""}${e.error ? ` · ERROR: ${e.error}` : ""}`
                        ),
                      ].join("\n");
                      try {
                        await navigator.clipboard.writeText(text);
                        setDebugCopied(true);
                        setTimeout(() => setDebugCopied(false), 3000);
                      } catch {
                        setDebugCopied(false);
                      }
                    }}
                  >
                    {debugCopied ? "Copied!" : "Copy debug info"}
                  </button>
                  <ul className="artist-debug-log">
                    {debugLog.map((entry, i) => (
                      <li key={i} className={`artist-debug-entry ${entry.status}`}>
                        <span className="artist-debug-status">{entry.status.toUpperCase()}</span>
                        <span className="artist-debug-query">"{entry.query}"</span>
                        <span className="artist-debug-duration">{entry.durationMs != null ? `${entry.durationMs}ms` : "pending"}</span>
                        {entry.resultCount != null && <span className="artist-debug-count">{entry.resultCount} results</span>}
                        {entry.error && <span className="artist-debug-error">{entry.error}</span>}
                        <span className="artist-debug-time">{entry.time}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
        </div>
        {searchResults.length > 0 && (
          <div className="artist-search-results" aria-label="YouTube search results">
            {searchResults.map((result) => (
              <button
                key={result.videoId}
                type="button"
                className={`artist-search-result${selectedResultVideoId === result.videoId ? " selected" : ""}`}
                onClick={() => handleSelectSearchResult(result)}
                aria-pressed={selectedResultVideoId === result.videoId}
              >
                {result.thumbnailUrl && <img src={result.thumbnailUrl} alt="YouTube thumbnail" loading="lazy" />}
                <span>
                  <strong>{result.title || "Untitled Video"}</strong>
                  <small>{result.channelTitle || "Unknown channel"}</small>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="artist-promo-section">
        <h3>2) Generate a Share Link</h3>
        <label className="artist-promo-field">
          <span>YouTube URL or Video ID</span>
          <input
            className="artist-promo-input"
            type="text"
            value={youtubeInput}
            onChange={(event) => setYoutubeInput(event.target.value)}
            placeholder="https://www.youtube.com/watch?v=..."
          />
        </label>
        <label className="artist-promo-field">
          <span>Optional display title in BrushBeats</span>
          <input
            className="artist-promo-input"
            type="text"
            value={videoTitle}
            onChange={(event) => setVideoTitle(event.target.value)}
            placeholder="My New Single"
          />
        </label>
        <div className="artist-promo-row">
          <button type="button" className="action-btn" onClick={handleGenerateLink}>
            Generate Artist Link
          </button>
          <button type="button" className="action-btn secondary" onClick={handlePreviewInApp} disabled={!generatedVideoId}>
            Preview In BrushBeats
          </button>
        </div>
        {errorMessage && <p className="artist-promo-error">{errorMessage}</p>}
      </div>

      {shareLink && (
        <div className="artist-promo-section artist-promo-result">
          <h3>3) Share</h3>
          <p>Video ID: <strong>{generatedVideoId}</strong></p>
          <a href={shareLink} target="_blank" rel="noreferrer" className="artist-promo-link">
            {shareLink}
          </a>
          <div className="artist-promo-row">
            <button type="button" className="action-btn" onClick={handleCopyLink}>
              Copy Link
            </button>
          </div>
          {copyMessage && <p className="artist-promo-copy-message">{copyMessage}</p>}
        </div>
      )}

      <div className="story-actions">
        <button type="button" className="action-btn secondary" onClick={onExit}>
          Return to brushing flow
        </button>
      </div>
    </section>
  );
}
