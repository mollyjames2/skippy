// docs/data.js

import { SKIPPY_PLACES } from "./shared/places.js";

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

function cacheKey(type, slug, extra = "") {
  return `skippy.cache.${type}.${slug}.${extra}`;
}

function readCache(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL_MS) return null;
    return data;
  } catch {
    return null;
  }
}

function writeCache(key, data) {
  try {
    localStorage.setItem(
      key,
      JSON.stringify({
        ts: Date.now(),
        data,
      })
    );
  } catch {}
}

/* --------------------------------------------------
   Worker fetch (unchanged contract)
-------------------------------------------------- */

async function fetchFromWorkerWeek(apiBase, slug) {
  const res = await fetch(`${apiBase}/week?place=${encodeURIComponent(slug)}`);
  if (!res.ok) throw new Error("Worker week fetch failed");
  return res.json();
}

async function fetchFromWorkerDay(apiBase, slug, dayIso) {
  const res = await fetch(
    `${apiBase}/day?place=${encodeURIComponent(slug)}&date=${encodeURIComponent(
      dayIso
    )}`
  );
  if (!res.ok) throw new Error("Worker day fetch failed");
  return res.json();
}

/* --------------------------------------------------
   Open-Meteo fetch + mapping
-------------------------------------------------- */

async function fetchOpenMeteo(lat, lon) {
  const weatherUrl =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${lat}&longitude=${lon}` +
    `&daily=weathercode,temperature_2m_max,temperature_2m_min` +
    `&timezone=auto`;

  const marineUrl =
    `https://marine-api.open-meteo.com/v1/marine` +
    `?latitude=${lat}&longitude=${lon}` +
    `&daily=wave_height_max,wind_speed_10m_max` +
    `&timezone=auto`;

  const [weatherRes, marineRes] = await Promise.all([
    fetch(weatherUrl),
    fetch(marineUrl),
  ]);

  if (!weatherRes.ok || !marineRes.ok) {
    throw new Error("Open-Meteo fetch failed");
  }

  return {
    weather: await weatherRes.json(),
    marine: await marineRes.json(),
  };
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
  return new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    month: "short",
  }).format(d);
}

/**
 * Convert Open-Meteo responses into
 * the SAME JSON shape the UI already expects (home list).
 */
function buildWeekPayload(open, place) {
  const times = open?.weather?.daily?.time || [];
  const codes = open?.weather?.daily?.weathercode || [];
  const tmax = open?.weather?.daily?.temperature_2m_max || [];

  const waveMax = open?.marine?.daily?.wave_height_max || [];
  const windMaxKmh = open?.marine?.daily?.wind_speed_10m_max || [];

  const days = times.map((date, i) => {
    const wave = waveMax[i] ?? 0;
    const windKmh = windMaxKmh[i] ?? 0;

    // Simple boating score heuristic (tweak later if you like)
    const scoreRaw = 100 - wave * 20 - windKmh;
    const score = Math.max(0, Math.round(scoreRaw));

    return {
      date,
      dow: formatDow(date),
      label: formatLabel(date),

      condition: weatherCodeToText(codes[i]),
      temp_c: Math.round(tmax[i] ?? 0),

      score,
      rating: scoreToRating(score),

      wind: {
        kts: kmhToKnots(windKmh),
        dir: "—",
      },

      waves: {
        m: Number(Number(wave).toFixed(1)),
      },

      best_time: { start: "All day", end: "All day" },
    };
  });

  const best = days.reduce(
    (acc, d) => (!acc || d.score > acc.score ? d : acc),
    null
  );

  return {
    location: place?.name || "",
    place, // keep for other pages that still expect it
    days,
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

/**
 * Build a day payload that won't crash day.js:
 * provides common fields even if we don't have tides/hourly yet.
 */
function buildDayPayload(weekData, dayIso) {
  const day = (weekData.days || []).find((d) => d.date === dayIso);
  if (!day) throw new Error("Day not found");

  return {
    location: weekData.location || weekData.place?.name || "",
    place: weekData.place,
    date: day.date,
    title: `${day.dow} ${day.label}`,

    summary: {
      temp_c: day.temp_c,
      condition: day.condition,
      score: day.score,
    },

    tiles: {
      wind_kts: day.wind?.kts ?? 0,
      gust_kts: day.wind?.kts ?? 0,
      wind_dir: day.wind?.dir ?? "—",

      wave_m: day.waves?.m ?? 0,
      period_s: "—",

      visibility_km: "—",
      precip_mm: "—",

      sunrise: "—",
      sunset: "—",
    },

    tides: [],
    recommended: [{ start: "All day", end: "All day", score: day.score }],
    hours: [],
  };
}

/* --------------------------------------------------
   Public API (used by UI)
-------------------------------------------------- */

export async function getWeekData(slug) {
  const place = SKIPPY_PLACES[slug];
  if (!place) throw new Error("Unknown place");

  const key = cacheKey("week", slug);
  const cached = readCache(key);
  if (cached) return cached;

  try {
    const open = await fetchOpenMeteo(place.lat, place.lon);
    const data = buildWeekPayload(open, place);
    writeCache(key, data);
    return data;
  } catch (e) {
    // fallback to worker (if configured) — DO NOT CACHE FALLBACK
    const apiBase = window.SKIPPY_API_BASE;
    if (!apiBase) throw e;

    return await fetchFromWorkerWeek(apiBase, slug);
  }
}

export async function getDayData(slug, dayIso) {
  const key = cacheKey("day", slug, dayIso);
  const cached = readCache(key);
  if (cached) return cached;

  try {
    // Build day payload from week data (Open-Meteo-shaped)
    const week = await getWeekData(slug);
    const data = buildDayPayload(week, dayIso);
    writeCache(key, data);
    return data;
  } catch (e) {
    // fallback to worker day endpoint — DO NOT CACHE FALLBACK
    const apiBase = window.SKIPPY_API_BASE;
    if (!apiBase) throw e;

    return await fetchFromWorkerDay(apiBase, slug, dayIso);
  }
}
