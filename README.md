

# Skippy 

Skippy is a lightweight **boating conditions web app** built with:
- a **static frontend** hosted on GitHub Pages
- a **Cloudflare Worker API** used as a fallback data source

The app helps boaters quickly assess conditions by showing:
- a **weekly overview** of boating conditions for a selected location
- a **daily detail view** for a specific date
- a simple **location picker** backed by predefined coastal / marine locations
The core design goal is:
> **Frontend-first data loading**, with **Worker fallback**, and **minimal moving parts**.

---

## High-level architecture

```

Browser (GitHub Pages)
│
├── Fetch Open-Meteo APIs directly (primary)
│   ├── Weather API
│   └── Marine API
│
├── Cache computed results in localStorage (1 hour TTL)
│
└── Fallback to Cloudflare Worker
└── Worker fetches Open-Meteo and returns same JSON schema

```

The UI does **not** care where data comes from — browser or Worker — because the JSON contract is the same.

---

## Repository structure

```

.
├── docs/                  # Static frontend (GitHub Pages root)
│   ├── index.html          # Home / week view
│   ├── day.html            # Day detail view
│   ├── location.html       # Location picker
│   │
│   ├── app.js              # Week view logic (ES module)
│   ├── day.js              # Day view logic (ES module)
│   ├── location.js         # Location picker logic (ES module)
│   ├── presets.js          # Location presets UI
│   ├── data.js             # Frontend data layer (Open-Meteo + cache + fallback)
│   │
│   ├── config.js           # Runtime configuration (API base, defaults)
│   │
│   └── common/
│       └── core.js         # Shared browser-only helpers
│
├── shared/
│   └── places.js           # Single source of truth for locations (lat/lon)
│
└── worker/
└── worker.js           # Cloudflare Worker API (fallback data source)

```

---

## Key concepts

### 1. Locations (single source of truth)

All locations live in **one file**:

```

shared/places.js

````

Each place defines:
- `slug`
- `name`
- `lat`
- `lon`

This file is imported by:
- the frontend (for data loading)
- the Worker (for fallback fetching)

There is **no duplication** of location data.

---

### 2. Frontend-first data loading (`docs/data.js`)

The frontend uses a small data layer that hides all complexity from the UI.

Public API:

```js
getWeekData(slug)
getDayData(slug, dayIso)
````

What happens internally:

1. **Cache check**

   * Uses `localStorage`
   * TTL = **1 hour**
   * If fresh data exists → return immediately

2. **Direct Open-Meteo fetch**

   * Weather API
   * Marine API
   * Data is mapped into the same JSON shape the UI already expects

3. **Worker fallback**

   * If Open-Meteo fails (network, rate limit, etc.)
   * Calls existing Worker endpoints
   * Worker JSON contract is unchanged

The UI never needs to know which path was used.

---

### 3. Cloudflare Worker (fallback only)

The Worker:

* fetches Open-Meteo weather + marine data
* computes scores
* returns JSON for:

  * `/week`
  * `/day`

Important:

* The Worker API contract is **unchanged**
* The Worker is no longer the primary data source
* It exists purely for resilience and backward compatibility

---

### 4. Frontend modules and shared helpers

All main frontend scripts are ES modules.

Shared browser-only helpers live in:

```
docs/common/core.js
```

This includes:

* `pillClass(score)` – maps scores to CSS classes
* `requireLocationOrRedirect()` – ensures a location is selected

These helpers:

* use browser APIs (`window`, `localStorage`)
* are shared across pages
* are intentionally **not** placed in `shared/`

---

### 5. Configuration

Runtime configuration lives in:

```
docs/config.js
```

This file defines globals such as:

* `SKIPPY_API_BASE`
* default location settings

Because the main scripts are ES modules, config values are accessed via:

```js
window.SKIPPY_API_BASE
```

---

## Data flow summary

### Week view (`index.html`)

1. Load selected location from storage
2. Call `getWeekData(slug)`
3. Render weekly cards
4. Each day links to `day.html?date=YYYY-MM-DD`

### Day view (`day.html`)

1. Load selected location
2. Read date from URL
3. Call `getDayData(slug, date)`
4. Render detailed conditions for the day

---

## Caching behavior

* Cache keys include:

  * view type (`week` / `day`)
  * location slug
  * date (for day view)
* TTL = **1 hour**
* Cache is automatically refreshed after expiry
* Cache is updated even when data comes from the Worker

---

## Development

### Frontend

Serve the `docs/` directory locally, e.g.:

```bash
python -m http.server
```

### Worker

Use Cloudflare Wrangler:

```bash
wrangler dev
```

You can point `SKIPPY_API_BASE` in `config.js` to:

* local Worker (for development)
* deployed Worker (for production)

---

## Design principles

* No framework
* No build step
* Minimal abstraction
* Explicit data flow
* One source of truth for locations
* UI decoupled from data source

---



