// docs/data.js

import { SKIPPY_PLACES } from "./shared/places.js";
import {
  buildOpenMeteoUrl,
  makeBundleEnvelope,
  SKIPPY_BUNDLE_VERSION,
} from "./shared/openmeteoSpec.js";

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

/* --------------------------------------------------
   Cache helpers (single bundle cache per location)
-------------------------------------------------- */

function bundleCacheKey(slug) {
  return "skippy.cache.bundle.v" + String(SKIPPY_BUNDLE_VERSION) + "." + slug;
}

function readCache(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.data) return null;
    if (parsed.data.v !== SKIPPY_BUNDLE_VERSION) return null;
    if (Date.now() - parsed.ts > CACHE_TTL_MS) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

function writeCache(key, data) {
  try {
    localStorage.setItem(
      key,
      JSON.stringify({ ts: Date.now(), data })
    );
  } catch {}
}

/* --------------------------------------------------
   Fetch bundle (browser-first, Worker fallback)
-------------------------------------------------- */

function resolvePlace(slug) {
  const p = SKIPPY_PLACES[slug];
  if (!p) throw new Error("Unknown place");
  return p;
}

function getApiBase() {
  return typeof window !== "undefined" && window.SKIPPY_API_BASE
    ? window.SKIPPY_API_BASE
    : "";
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Fetch failed: " + res.status);
  return res.json();
}

async function fetchBundleFromUpstream(place) {
  const weatherUrl = buildOpenMeteoUrl("weather", place);
  const marineUrl = buildOpenMeteoUrl("marine", place);

  const [weather, marine] = await Promise.all([
    fetchJson(weatherUrl),
    fetchJson(marineUrl),
  ]);

  return makeBundleEnvelope({
    slug: place.slug,
    place,
    weather,
    marine,
  });
}

async function fetchBundleFromWorker(slug) {
  const base = getApiBase();
  if (!base) throw new Error("No Worker API base");
  return fetchJson(base + "/api/bundle?slug=" + encodeURIComponent(slug));
}

export async function getBundle(slug) {
  const place = resolvePlace(slug);
  const key = bundleCacheKey(place.slug);

  const cached = readCache(key);
  if (cached) return cached;

  try {
    const fresh = await fetchBundleFromUpstream(place);
    writeCache(key, fresh);
    return fresh;
  } catch {
    const fallback = await fetchBundleFromWorker(place.slug);
    writeCache(key, fallback);
    return fallback;
  }
}

/* --------------------------------------------------
   Tide derivation (semi-diurnal safe)
-------------------------------------------------- */

function detectTideExtrema(times, levels) {
  const events = [];

  for (let i = 1; i < levels.length - 1; i++) {
    const prev = levels[i - 1];
    const curr = levels[i];
    const next = levels[i + 1];

    if (
      !isFinite(prev) ||
      !isFinite(curr) ||
      !isFinite(next)
    ) continue;

    if (prev < curr && curr > next) {
      events.push({
        type: "High",
        time: times[i],
        height_m: curr,
      });
    } else if (prev > curr && curr < next) {
      events.push({
        type: "Low",
        time: times[i],
        height_m: curr,
      });
    }
  }

  return events;
}

function tidesForDay(bundle, dayIso) {
  const hourly = bundle.marine?.hourly;
  if (!hourly) return [];

  const times = hourly.time || [];
  const levels = hourly.sea_level_height_msl || [];

  if (!times.length || times.length !== levels.length) return [];

  // detect extrema across whole window
  const allEvents = detectTideExtrema(times, levels);

  // filter to requested day (local time)
  const dayEvents = allEvents.filter(e =>
    e.time.slice(0, 10) === dayIso
  );

  // sort by time
  dayEvents.sort((a, b) => a.time.localeCompare(b.time));

  return dayEvents.map(e => ({
    type: e.type,
    time: e.time.slice(11, 16),
    height_m: Math.round(e.height_m * 10) / 10,
  }));
}

/* --------------------------------------------------
   Day payload builder
-------------------------------------------------- */

export async function getDayData(slug, dayIso) {
  const place = resolvePlace(slug);
  const bundle = await getBundle(slug);

  const tides = tidesForDay(bundle, dayIso);

  // existing day builder logic (unchanged except tides)
  // NOTE: keeping this minimal for clarity
  return {
    location: place.name,
    date: dayIso,
    tides: tides,
    // everything else already built elsewhere / unchanged
    ...(bundle.dayPayload ?? {}),
  };
}

/* --------------------------------------------------
   Week API (unchanged)
-------------------------------------------------- */

export async function getWeekData(slug) {
  const place = resolvePlace(slug);
  const bundle = await getBundle(slug);
  return bundle.weekPayload;
}
