
# Skippy

https://mollyjames2.github.io/skippy/

Skippy is a small, fast **boating conditions web app** designed to answer one simple question quickly:

> **“Is it a good time to go out on the water?”**

It runs entirely in the browser, with an optional Cloudflare Worker API as a fallback data source. There’s no framework, no build step, and very little magic.

---

## What Skippy does

Skippy helps boaters check upcoming conditions for familiar coastal locations.

### At a glance

* **Weekly overview** of marine and weather conditions for a selected location
* **Daily detail view** with a deeper breakdown for a specific date
* **Quick location switching** using predefined marine / coastal spots
* **User settings** to tailor how conditions are interpreted
* **Fast loading** thanks to frontend-first data handling and aggressive caching

---

## The Boating Score

Skippy combines wind, waves, precipitation, visibility and (optionally) temperature into a **0–100 score**:

- **90+** Excellent
- **60+** Good
- **40+** OK
- **20+** Poor
- **<20** Avoid

### Hard safety gates (“Avoid” overrides)

In addition to the numeric score, Skippy applies **hard safety gates**.

If any hard gate triggers, the hour is forced to **Avoid (score 0)** regardless of the normal scoring model. Daily scores derived from those hours will also reflect this.

Hard gate thresholds are **tunable in source** in `docs/common/score.js` (not exposed in the UI).

---

## Environment: Coastal vs Estuary/Sheltered

Skippy includes a Settings toggle for **Environment**:

- **Coastal (default)** — interpret the model as “open water”.
- **Estuary/Sheltered** — interpret the model as “upriver / sheltered intent”.

Why this exists: the underlying weather/marine model is relatively coarse and can’t reliably represent how sheltered conditions upriver can differ from open water.

### What changes in Estuary mode

Estuary mode affects **both hourly and daily** scoring:

1. **Hard gate thresholds** are relaxed (especially wave-related) so you don’t get blocked unnecessarily.
2. **Wave-driven inputs are dampened** before scoring hazards, to better reflect sheltered upriver trips when offshore swell looks worse than the river actually is.

All environment behaviour is tunable in `docs/common/score.js`.

---

## Settings that affect scoring

Settings are stored locally in the browser.

- **Scoring style:** Safety / Standard / Opportunity  
  Controls how conservative the score is (weights/tolerance).
- **Daily score hours:** All hours / Daylight  
  Controls how the **daily** score is computed (week tiles + day header score).
- **Environment:** Coastal / Estuary/Sheltered  
  Controls hard gates + wave-dampening in scoring.
- **Minimum recommended window hours:**  
  Recommended windows must be at least N contiguous hours.

Note: The Day page has a local “All hours / Daylight” toggle for viewing; leaving the page returns to the Settings preference.

## Mooring no-access windows

Skippy can also highlight times when your mooring cannot be accessed due to tidal constraints. This makes it easy to see at a glance when access is not possible, without affecting recommended boating windows or hourly scoring.

### How it works
For each tide event (High or Low), Skippy can apply a **user-defined buffer** either side of the tide time.  
During this window, the mooring is considered **not accessible**.

Example:
- High tide at **10:03**
- High-water buffer set to **1.5 hours**
- No-access window shown as **08:33–11:33 (High)**

These windows are:
- Calculated independently for **High water** and **Low water**
- Automatically clipped to the current day
- Displayed alongside tide times for quick reference

### Configuration
Mooring access settings are available in **Settings → Mooring access**:

Buffers are optional and can be set independently.  
If both values are set to `0`, no mooring access restrictions are shown.

---

## How the app works

Skippy is intentionally simple in how data flows through the app:

1. The **static frontend** (HTML, CSS, vanilla JS) is hosted on GitHub Pages
2. The frontend requests raw weather + marine data
3. A **Cloudflare Worker API** acts as a fallback and cache layer
4. Data ultimately comes from **Open-Meteo** (no accounts or API keys required)

The Worker:

* Fetches weather + marine data from Open-Meteo
* Returns **raw, unopinionated JSON**
* Caches responses at the edge for 1 hour

All interpretation, display logic, and user preferences live in the frontend.

---

## Pages & features

* **Home / Week view**

  * Overview of the next 7 days for a location
  * Clear visual indicators for conditions
  * Includes a best recommended time window per day (tiered)

* **Day view**

  * Detailed breakdown for a single day
  * Hourly score row + recommended windows

* **Location picker**

  * Uses a shared, predefined list of coastal locations
  * One source of truth across frontend and Worker

* **Settings**

  * Customize how conditions are evaluated
  * Saved locally in the browser

---

## Design goals

Skippy is intentionally opinionated about simplicity:

* **No framework**
* **No build step**
* **Minimal abstraction**
* **Explicit data flow**
* **Frontend-first loading** with API fallback
* **UI decoupled from the data source**
* **Easy to inspect, debug, and extend**

---

## Project structure

* `docs/` - Static frontend (HTML, CSS, JS)
* `worker/` - Cloudflare Worker API
* `docs/shared/` - Shared specs and location data used by both frontend and Worker
* `docs/common/` - Boating score and recomended window logic
* `docs/assets/` - Skippy logo
 
---

## Running locally

You can open the frontend directly:

```bash
# from the repo root
open docs/index.html
````

For the API:

```bash
cd worker
wrangler dev
```

Then point the frontend config at your local Worker if needed.

---

## Philosophy

Skippy exists to give boaters a fast, at-a-glance sense of whether conditions are worth thinking about further.

It’s not trying to replace forecasts, charts, or local knowledge. Instead, it’s meant to answer the first, most common question:

“Is this even worth considering today?”

The app is designed for quick checks — on a phone, before loading the car, or while scanning options — without digging through dense weather tools.

To support that goal, Skippy favours:

* Clear signals over exhaustive detail
* Familiar locations over free-form searching
* Sensible defaults with optional customization
* Speed and clarity over completeness

Under the hood, the same philosophy applies:

* Readable code over clever code
* Fewer moving parts over heavy abstractions
* Shipping something genuinely useful over building a platform

If Skippy helps you decide whether to go deeper elsewhere, it’s doing its job.


