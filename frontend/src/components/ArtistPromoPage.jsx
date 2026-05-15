import { useMemo, useState } from "react";
import { searchYoutubeVideos } from "../api/client";

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
  const [youtubeInput, setYoutubeInput] = useState("");
  const [videoTitle, setVideoTitle] = useState("");
  const [generatedVideoId, setGeneratedVideoId] = useState("");
  const [shareLink, setShareLink] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [copyMessage, setCopyMessage] = useState("");

  const personalizationLabel = useMemo(() => {
    if (activeUserName && profileLabel) {
      return `${activeUserName} · ${profileLabel}`;
    }

    if (activeUserName) {
      return activeUserName;
    }

    return profileLabel || "Current BrushBeats user";
  }, [activeUserName, profileLabel]);

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
    setSearchMessage("");
    setErrorMessage("");

    try {
      const response = await searchYoutubeVideos({ query, maxResults: 8 });
      const nextResults = Array.isArray(response?.items) ? response.items : [];
      setSearchResults(nextResults);

      if (!nextResults.length) {
        setSearchMessage("No matching videos found. Try a different title, artist, or spelling.");
      }
    } catch (error) {
      setSearchResults([]);
      setSearchMessage(error?.message || "Search failed. Please try again.");
    } finally {
      setSearchLoading(false);
    }
  }

  function handleSelectSearchResult(result) {
    const selectedVideoId = normalizeYoutubeVideoId(result?.videoId);
    if (!selectedVideoId) {
      return;
    }

    const selectedTitle = String(result?.title || "").trim();
    const selectedYoutubeUrl = result?.youtubeUrl || `https://www.youtube.com/watch?v=${selectedVideoId}`;
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
        {searchResults.length > 0 && (
          <div className="artist-search-results" aria-label="YouTube search results">
            {searchResults.map((result) => (
              <button
                key={result.videoId}
                type="button"
                className="artist-search-result"
                onClick={() => handleSelectSearchResult(result)}
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
