README - Skippy

Skippy is a mobile-first web app for boating in South Devon UK. It shows:

- the best days to go boating over the next week
- daily details (wind, waves, visibility, tides)
- a Boating Score (0-100) and recommended boating windows

Skippy is designed to support location-specific tide access rules per user (for
example: "block X hours around High Water and Low Water"). These rules will be
configured in Settings and used to calculate recommended windows.

LIVE URLS

- Frontend (GitHub Pages): https://mollyjames2.github.io/skippy/
- API (Cloudflare Worker): https://skippy-api.moja-e44.workers.dev

API ENDPOINTS

- GET /api/week
- GET /api/day?day_iso=YYYY-MM-DD

ARCHITECTURE (FREE HOSTING) Skippy uses a fully free hosting setup:

- Static frontend hosted on GitHub Pages (repo /docs folder)
- Serverless backend API hosted on Cloudflare Workers (free tier)

The Worker caches responses at the edge for 1 hour so the app updates
effectively hourly without needing background jobs.

REPOSITORY LAYOUT Production code lives here:

Frontend (GitHub Pages):

- docs/index.html
- docs/day.html
- docs/settings.html
- docs/styles.css
- docs/config.js (defines SKIPPY_API_BASE)
- docs/app.js
- docs/day.js
- docs/settings.js

Backend (Cloudflare Worker):

- worker/worker.js
- worker/wrangler.toml

Legacy:

- legacy/app (or similar) may exist from an earlier FastAPI prototype and is not
  used in production.

CONFIGURATION Frontend API base URL is defined in:

- docs/config.js

Example: var SKIPPY_API_BASE = "https://skippy-api.moja-e44.workers.dev";

IMPORTANT:

- This URL is not shown in the UI.
- It is not secret (it will appear in browser network requests).

DEPLOYMENT

FRONTEND DEPLOY (GITHUB PAGES) Trigger:

- Push commits to main that change anything under docs/

GitHub Pages settings:

- Repo Settings -> Pages
- Source: Deploy from a branch
- Branch: main
- Folder: /docs

After pushing, the site updates automatically (may take 1-2 minutes).

WORKER DEPLOY (CLOUDFLARE AUTO-DEPLOY FROM GITHUB) Trigger:

- Push commits to main that change anything under worker/**

Cloudflare Worker build configuration:

- Connected repo: mollyjames2/skippy
- Production branch: main
- Root directory: worker
- Deploy command: npx wrangler deploy
- Watch paths: worker/**

Worker config file:

- worker/wrangler.toml must exist and be committed.

To confirm deployment:

- Cloudflare dashboard -> Workers & Pages -> skippy-api -> Deployments

LOCAL DEVELOPMENT

FRONTEND LOCAL RUN From repo root: python -m http.server 8000

Open: http://127.0.0.1:8000/docs/

This avoids browser file:// restrictions and lets fetch() work normally.

WORKER LOCAL TESTING For most changes, deploy and test against the live Worker
endpoints. Local wrangler dev can be added later if needed.

SMOKE TESTS

API Open:

- https://skippy-api.moja-e44.workers.dev/api/week Expected: JSON with keys like
  location, best_day, days[].

Open:

- https://skippy-api.moja-e44.workers.dev/api/day?day_iso=2026-01-16 Expected:
  JSON with keys like summary, tiles, tides, recommended, hours.

FRONTEND Open:

- https://mollyjames2.github.io/skippy/

Expected:

- Best day card populates
- 7-day list populates
- Clicking a day opens daily details
- Settings shows only user-facing settings (no API URL field)

DEBUGGING

FRONTEND STUCK ON "LOADING..." Open DevTools:

- Network tab: confirm config.js and app.js load (status 200)
- Console tab: check for JS errors
- Network tab: confirm a request to /api/week is made

Common issues:

- "SKIPPY_API_BASE is not defined" Fix: ensure index.html loads config.js before
  app.js

- "Cannot set properties of null" Fix: JS is referencing an element id that does
  not exist in HTML

- "Failed to fetch" or CORS issues Fix: confirm Worker endpoint works and CORS
  headers exist

WORKER ERRORS Check:

- Cloudflare dashboard -> Worker -> Deployments for build/deploy failures
- Open the endpoint directly in a browser to see the error

Common causes:

- wrangler.toml missing or incorrect
- syntax error in worker.js
- upstream fetch failures (once real data is added)

CURRENT STATE

- Frontend renders data from the Worker.
- Worker currently serves mocked data to prove end-to-end functionality.
- Worker responses are cached for 1 hour.
