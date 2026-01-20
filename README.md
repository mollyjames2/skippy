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
* **User settings & presets** to tailor how conditions are interpreted
* **Fast loading** thanks to frontend-first data handling and aggressive caching

---

## How it works

Skippy is intentionally simple in how data flows through the app:

1. The **static frontend** (HTML, CSS, vanilla JS) is hosted on GitHub Pages
2. The frontend requests raw weather + marine data
3. A **Cloudflare Worker API** acts as a fallback and cache layer
4. Data ultimately comes from **Open‑Meteo** (no accounts or API keys required)

The Worker:

* Fetches weather + marine data from Open‑Meteo
* Returns **raw, unopinionated JSON**
* Caches responses at the edge for 1 hour

All interpretation, display logic, and user preferences live in the frontend.

---

## Pages & features

* **Home / Week view**

  * Overview of the next 7 days for a location
  * Clear visual indicators for conditions

* **Day view**

  * Detailed breakdown for a single day
  * Designed for quick decision‑making

* **Location picker**

  * Uses a shared, predefined list of coastal locations
  * One source of truth across frontend and Worker

* **Settings**

  * Customize how conditions are evaluated
  * Saved locally in the browser

* **Presets**

  * Quickly switch between different condition preferences

---

## Design goals

Skippy is intentionally opinionated about simplicity:

* **No framework**
* **No build step**
* **Minimal abstraction**
* **Explicit data flow**
* **Frontend‑first loading** with API fallback
* **UI decoupled from the data source**
* **Easy to inspect, debug, and extend**

---

## Project structure

* `docs/` – Static frontend (HTML, CSS, JS)
* `worker/` – Cloudflare Worker API
* `docs/shared/` – Shared specs and location data used by both frontend and Worker
* `legacy/` – Older experiments and retired code

---

## Running locally

You can open the frontend directly:

```bash
# from the repo root
open docs/index.html
```

For the API:

```bash
cd worker
wrangler dev
```

Then point the frontend config at your local Worker if needed.

---

## Philosophy

Skippy exists to give boaters a fast, at‑a‑glance sense of whether conditions are worth thinking about further.

It’s not trying to replace forecasts, charts, or local knowledge. Instead, it’s meant to answer the first, most common question:

“Is this even worth considering today?”

The app is designed for quick checks — on a phone, before loading the car, or while scanning options — without digging through dense weather tools.

To support that goal, Skippy favors:

-Clear signals over exhaustive detail

-Familiar locations over free‑form searching

-Sensible defaults with optional customization

-Speed and clarity over completeness

-Under the hood, the same philosophy applies:

-Readable code over clever code

-Fewer moving parts over heavy abstractions

-Shipping something genuinely useful over building a platform

If Skippy helps you decide whether to go deeper elsewhere, it’s doing its job.


---



