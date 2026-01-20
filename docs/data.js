// docs/data.js

import { SKIPPY_PLACES } from "./shared/places.js";
import { buildOpenMeteoUrl, makeBundleEnvelope } from "./shared/openmeteoSpec.js";

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

/* --------------------------------------------------
   Cache helpers (single bundle cache per location)
-------------------------------------------------- */

function bundleCacheKey(slug) {
  return "skippy.cache.bundle." + slug;
}

function readCache(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const ts = parsed.ts;
    const data = parsed.data;
    if (Date.now() - ts > CACHE_TTL_MS) return null;
    return data;
  } catch (e) {
    return null;
  }
}

function writeCache(key, data) {
  try {
    localStorage.setItem(
      key,
      JSON.stringify({
        ts: Date.now(),
        data: data,
      })
    );
  } catch (e) {}
}

/* --------------------------------------------------
   Utility helpers
-------------------------------------------------- */

function resolvePlace(slug) {
  const place = SKIPPY_PLACES[slug];
  if (!place) throw new Error("Unknown place");
  return place;
}

function getApiBase() {
  return typeof window !== "undefined" && window.SKIPPY_API_BASE
    ? window.SKIPPY_API_BASE
    : "";
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    const txt = await res.text().catch(function () {
      return "";
    });
    throw new Error("Fetch failed " + res.status + ": " + txt.slice(0, 200));
  }
  return res.json();
}

/* --------------------------------------------------
   Bundle fetch (browser-first, worker fallback)
-------------------------------------------------- */

async function fetchBundleFromUpstream(place) {
  const weatherUrl = buildOpenMeteoUrl("weather", { lat: place.lat, lon: place.lon });
  const marineUrl = buildOpenMeteoUrl("marine", { lat: place.lat, lon: place.lon });

  const results = await Promise.all([fetchJson(weatherUrl), fetchJson(marineUrl)]);
  const weather = results[0];
  const marine = results[1];

  return makeBundleEnvelope({
    slug: place.slug,
    place: place,
    weather: weather,
    marine: marine,
  });
}

async function fetchBundleFromWorker(slug) {
  const apiBase = getApiBase();
  if (!apiBase) throw new Error("SKIPPY_API_BASE not configured");
  const url = apiBase + "/api/bundle?slug=" + encodeURIComponent(slug);
  return fetchJson(url);
}

/*
 * Single source of truth for all screens.
 * - One cached bundle per location
 * - Refresh once per hour
 * - Browser fetches upstream first; Worker is fallback only
 */
export async function getBundle(slug) {
  const place = resolvePlace(slug);
  const key = bundleCacheKey(place.slug);

  const cached = readCache(key);
  if (cached) return cached;

  try {
    const b = await fetchBundleFromUpstream(place);
    writeCache(key, b);
    return b;
  } catch (err) {
    const b = await fetchBundleFromWorker(place.slug);
    writeCache(key, b);
    return b;
  }
}

/* --------------------------------------------------
   UI-shape helpers
-------------------------------------------------- */

function kmhToKnots(kmh) {
  return Math.round((kmh || 0) * 0.539957);
}

function weatherCodeToText(code) {
  if (code === 0) return "Clear";
  if (code === 1 || code === 2) return "Mostly clear";
  if (code === 3) return "Cloudy";
  if (code === 45 || code === 48) return "Fog";
  if (code >= 51 && code <= 67) return "Drizzle/Rain";
  if (code >= 71 && code <= 77) return "Snow";
  if (code >= 80 && code <= 82) return "Showers";
  if (code >= 95) return "Thunder";
  return "Mixed";
}

function scoreToRating(score) {
  if (score >= 80) return "Great";
  if (score >= 50) return "OK";
  return "Poor";
}

function formatDow(dateIso) {
  const d = new Date(dateIso + "T00:00:00");
  return new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(d);
}

function formatLabel(dateIso) {
  const d = new Date(dateIso + "T00:00:00");
  return new Intl.DateTimeFormat(undefined, { day: "2-digit", month: "short" }).format(d);
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function round1(x) {
  const n = Number(x);
  if (!isFinite(n)) return 0;
  return Math.round(n * 10) / 10;
}

function kmhToKnotsFloat(kmh) {
  const n = Number(kmh);
  if (!isFinite(n)) return null;
  return n * 0.539957;
}

function scoreHourPlaceholder(opts) {
  const wave = Number(opts.wave_m);
  const wind = Number(opts.wind_kmh);

  let s = 100;
  if (isFinite(wave)) s -= wave * 20;
  if (isFinite(wind)) s -= wind;

  return Math.round(clamp(s, 0, 100));
}

/* --------------------------------------------------
   Week builder (from bundle daily layers)
-------------------------------------------------- */

function buildWeekPayloadFromBundle(bundle, place) {
  const wDaily = (bundle && bundle.weather && bundle.weather.daily) ? bundle.weather.daily : {};
  const mDaily = (bundle && bundle.marine && bundle.marine.daily) ? bundle.marine.daily : {};

  const times = wDaily.time || [];
  const codes = wDaily.weather_code || [];
  const tmax = wDaily.temperature_2m_max || [];

  const waveMax = mDaily.wave_height_max || [];
  const windMaxKmh = wDaily.wind_speed_10m_max || [];

  const days = times.map(function (date, i) {
    const wave = (typeof waveMax[i] !== "undefined" && waveMax[i] !== null) ? waveMax[i] : 0;
    const windKmh = (typeof windMaxKmh[i] !== "undefined" && windMaxKmh[i] !== null) ? windMaxKmh[i] : 0;

    const scoreRaw = 100 - wave * 20 - windKmh;
    const score = Math.max(0, Math.round(scoreRaw));

    return {
      date: date,
      dow: formatDow(date),
      label: formatLabel(date),

      condition: weatherCodeToText(codes[i]),
      temp_c: Math.round((typeof tmax[i] !== "undefined" && tmax[i] !== null) ? tmax[i] : 0),

      score: score,
      rating: scoreToRating(score),

      wind: {
        kts: kmhToKnots(windKmh),
        dir: "-",
      },

      waves: {
        m: Number(Number(wave).toFixed(1)),
      },

      best_time: { start: "All day", end: "All day" },
    };
  });

  const best = days.reduce(function (acc, d) {
    if (!acc || d.score > acc.score) return d;
    return acc;
  }, null);

  return {
    location: (place && place.name) ? place.name : "",
    place: place,
    days: days,
    best_day: best
      ? {
          dow: best.dow,
          label: best.label,
          score: best.score,
          best_time: best.best_time,
        }
      : null,
  };
}

/* --------------------------------------------------
   Day builder (daily summary + hourly rows from bundle)
-------------------------------------------------- */

function buildDayPayloadFromBundle(bundle, place, dayIso) {
  const wDaily = (bundle && bundle.weather && bundle.weather.daily) ? bundle.weather.daily : {};
  const mDaily = (bundle && bundle.marine && bundle.marine.daily) ? bundle.marine.daily : {};

  const dTimes = wDaily.time || [];
  const dayIdx = dTimes.indexOf(dayIso);
  if (dayIdx < 0) throw new Error("Day not found in daily data");

  const code = (wDaily.weather_code || [])[dayIdx];
  const tmax = (wDaily.temperature_2m_max || [])[dayIdx];
  const tmin = (wDaily.temperature_2m_min || [])[dayIdx];

  const windMaxKmh = (wDaily.wind_speed_10m_max || [])[dayIdx];
  const gustMaxKmh = (wDaily.wind_gusts_10m_max || [])[dayIdx];

  const precipSum = (wDaily.precipitation_sum || [])[dayIdx];

  const sunrise = (wDaily.sunrise || [])[dayIdx];
  const sunset = (wDaily.sunset || [])[dayIdx];

  const waveMax = (mDaily.wave_height_max || [])[dayIdx];
  const wavePeriodMax = (mDaily.wave_period_max || [])[dayIdx];

  const dayScore = scoreHourPlaceholder({ wave_m: waveMax || 0, wind_kmh: windMaxKmh || 0 });
  const title = formatDow(dayIso) + " " + formatLabel(dayIso);

  const wHourly = (bundle && bundle.weather && bundle.weather.hourly) ? bundle.weather.hourly : {};
  const mHourly = (bundle && bundle.marine && bundle.marine.hourly) ? bundle.marine.hourly : {};

  const wTimes = wHourly.time || [];
  const mTimes = mHourly.time || [];

  const marineIndexByTime = {};
  for (let i = 0; i < mTimes.length; i++) marineIndexByTime[mTimes[i]] = i;

  const hours = [];
  for (let i = 0; i < wTimes.length; i++) {
    const t = String(wTimes[i] || "");
    if (t.slice(0, 10) !== dayIso) continue;

    const j = marineIndexByTime[t];
    const windKmhH = (wHourly.wind_speed_10m || [])[i];
    const waveMH = (j != null && mHourly.wave_height) ? mHourly.wave_height[j] : null;

    const score = scoreHourPlaceholder({ wave_m: waveMH || 0, wind_kmh: windKmhH || 0 });

    hours.push({
      time: t.slice(11, 16),
      temp_c: round1((wHourly.temperature_2m || [])[i]),
      wind_kts: Math.round(kmhToKnotsFloat(windKmhH) || 0),
      wave_m: round1(waveMH || 0),
      score: score,
    });
  }

  return {
    location: (place && place.name) ? place.name : "",
    place: place,
    date: dayIso,
    title: title,

    summary: {
      temp_c: Math.round(tmax || 0),
      temp_max_c: Math.round(tmax || 0),
      temp_min_c: Math.round(tmin || 0),
      condition: weatherCodeToText(code),
      score: dayScore,

      best_time_window: { start: "All day", end: "All day" },
      tides_status: "Coming soon",
    },

    tiles: {
      wind_kts: Math.round(kmhToKnotsFloat(windMaxKmh) || 0),
      gust_kts: Math.round(kmhToKnotsFloat(gustMaxKmh) || 0),
      wind_dir: "-",

      wave_m: round1(waveMax || 0),
      period_s: round1(wavePeriodMax || 0),

      visibility_km: "-",
      precip_mm: round1(precipSum || 0),

      sunrise: sunrise ? String(sunrise).slice(11, 16) : "-",
      sunset: sunset ? String(sunset).slice(11, 16) : "-",
    },

    tides: [],
    recommended: [{ start: "All day", end: "All day", score: dayScore }],
    hours: hours,
  };
}

/* --------------------------------------------------
   Public API (used by UI)
-------------------------------------------------- */

export async function getWeekData(slug) {
  const place = resolvePlace(slug);
  const bundle = await getBundle(slug);
  return buildWeekPayloadFromBundle(bundle, place);
}

export async function getDayData(slug, dayIso) {
  const place = resolvePlace(slug);
  const bundle = await getBundle(slug);
  return buildDayPayloadFromBundle(bundle, place, dayIso);
}
