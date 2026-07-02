# BrushBeats

BrushBeats is a full-stack web app that calculates your brushing tempo (BPM), finds songs near that BPM, and embeds playable YouTube videos without leaving the app.

## Stack

- Frontend: React + Vite
- Backend: Node.js + Express
- Integrations:
  - GetSongBPM API (song BPM lookup)
  - YouTube Data API v3 (video matching)

## Project Structure

- frontend: React UI
- backend: Express API and integrations
- .env.example: required environment variables

## Features Implemented

- BPM calculator with configurable:
  - top teeth (8-16)
  - bottom teeth (8-16)
  - section duration (15s or 30s)
- BPM outputs:
  - Raw BPM
  - Search/Music BPM (raw BPM doubled)
- Song discovery endpoint and UI with:
  - BPM tolerance slider
  - keyword filter
- YouTube matching endpoint and embedded iframe player
- Caching for:
  - song BPM queries
  - YouTube lookup results
- Basic API quota and failure handling with graceful fallback
- Bonus: 2-minute brushing timer button

## API Endpoints

- GET /api/bpm?top=16&bottom=16&sectionSeconds=30
- GET /api/songs?bpm=128&tolerance=5&q=dua
- GET /api/youtube?title=Levitating&artist=Dua%20Lipa

## Environment Variables

Copy .env.example to .env at the project root and fill values:

- GETSONGBPM_API_KEY
- GETSONGBPM_BASE_URL (default: https://api.getsongbpm.com)
- YOUTUBE_API_KEY
- PORT (default: 4000)
- ADMIN_WORKSHOP_PASSWORD
- DATABASE_URL
- CLOUD_SYNC_ALLOWED_HOUSEHOLD_IDS (comma-separated list of household ids allowed to use cloud sync/readback)
- VITE_GA_MEASUREMENT_ID

## Run Locally

1. Install dependencies (already installed if you followed scaffold steps):

```bash
npm install
npm install --prefix backend
npm install --prefix frontend
```

2. Start backend + frontend together:

```bash
npm run dev
```

This starts the backend API on `http://localhost:4000` and the Vite frontend on `http://localhost:5173`.
Because the frontend base path is `/BrushBeats/`, local development should be opened at `http://localhost:5173/BrushBeats/` while the dev server is running.

3. Open:

- Frontend: http://localhost:5173/BrushBeats/
- Backend health: http://localhost:4000/api/health

If `http://localhost:5173/BrushBeats/` does not load, the dev server is not running yet or the combined `npm run dev` process failed to start.

## Translation Workshop

- Open the desktop app and switch into the translation workshop from the header.
- Set `ADMIN_WORKSHOP_PASSWORD` in your local `.env`. The example file uses `brush4you!`.
- Saving locale edits back into the project requires the backend to be running, because write-back is handled by the local Express API.

## Notes

- If API keys are missing or rate limited, song discovery falls back to a local sample list.
- YouTube endpoint returns a warning when YOUTUBE_API_KEY is not configured.

## GitHub Hosting and GetSongBPM URLs

This repo includes a GitHub Pages workflow at [.github/workflows/deploy-frontend.yml](.github/workflows/deploy-frontend.yml).

After pushing to main and enabling Pages (Source: GitHub Actions), your public website URL will be:

- Website URL: https://fitzgr.github.io/BrushBeats/
- Roadmap JSON: https://fitzgr.github.io/BrushBeats/roadmap.json
- Roadmap Markdown: https://fitzgr.github.io/BrushBeats/roadmap.md

BrushBeats includes a visible GetSongBPM attribution/footer link in the app. Use this as your backlink URL for GetSongBPM registration:

- Backlink URL: https://fitzgr.github.io/BrushBeats/#credit

## Deploy Steps (GitHub)

1. Push your code to main.
2. In GitHub repo settings, open Pages and make sure deployment source is GitHub Actions.
3. Wait for the Deploy Frontend to GitHub Pages workflow to complete.
4. Open https://fitzgr.github.io/BrushBeats/ and verify footer attribution is visible.

## Development and Production Environments (GitHub)

This repo supports a two-branch flow:

- `develop`: development/staging branch
- `main`: production branch

### Branch Flow

1. Create feature branches from `develop`.
2. Open PRs into `develop` for integration testing.
3. Promote to production by opening a PR from `develop` into `main`.

### GitHub Actions

- CI workflow: `.github/workflows/ci.yml`
  - Runs backend tests and frontend build on pushes/PRs to `develop` and `main`.
- Development build workflow: `.github/workflows/build-frontend-dev.yml`
  - Runs on pushes to `develop`.
  - Uses the GitHub `development` environment and uploads a frontend build artifact.
- Production deploy workflow: `.github/workflows/deploy-frontend.yml`
  - Runs on pushes to `main`.
  - Builds with `VITE_BASE_PATH=/${repo-name}/` and deploys to GitHub Pages.

### GitHub Secrets / Environments

Add this repository secret in GitHub repo settings:

- `VITE_API_BASE` (example: https://your-backend-domain.example)

Development and CI workflows default to `http://localhost:4000` for frontend builds.

### Local Environment Templates

Use these templates as a starting point:

- `.env.development.example`
- `.env.production.example`

For local development, copy `.env.example` to `.env` and adjust values.

## Production Backend Note

GitHub Pages can host the React frontend but not the Express backend. For production API routes, deploy backend separately (Render, Railway, Fly.io, or similar), then set frontend env:

- VITE_API_BASE=https://your-backend-domain.example

## Cloud Sync Gate

BrushBeats now supports an allowlist-based backend gate for household cloud sync and cloud hydration.

- Free/local households stay local-only in the frontend.
- The backend independently enforces cloud access using `CLOUD_SYNC_ALLOWED_HOUSEHOLD_IDS`.
- If a household id is not in that comma-separated allowlist, `/api/households/:householdId` and `/api/households/:householdId/sync` return `403`.

Example:

- `CLOUD_SYNC_ALLOWED_HOUSEHOLD_IDS=household_10b22295-2bca-430c-8c68-3bf1fedc6946`

## Google Analytics Reporting

BrushBeats relies on GA4 client-side tracking and can use GA-native report sharing/scheduling.

1. Set `VITE_GA_MEASUREMENT_ID` in your frontend environment.
2. Ensure users grant analytics consent in-app.
3. In GA4 (or Looker Studio connected to GA4), build reports for page loads (`page_view`), geography (`country`), and brushing completions (`brushing_completed`).
4. Use GA/Looker Studio scheduling to email those reports daily at your preferred time.
