// docs/data.js

import { PLACES } from "../shared/places.js";

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
    localStorage.setItem(key, JSON.stringify({
      ts: Date.now(),
      data
    }));
  } catch {}
}

/* --------------------------------------------------
   Worker fetch (unchanged contract)
-------------------------------------------------- */

async function fetchFromWorkerWeek(apiBase, slug) {
  const res = await fetch(`${apiBase}/week?place=${slug}`);
  if (!res.ok) throw new Error("Worker week fetch failed");
  return res.json();
}

async function fetchFromWorkerDay(apiBase, slug, dayIso) {
  const res = await fetch(`${apiBase}/day?place=${slug}&date=${dayIso}`);
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
    fetch(marineUrl)
  ]);

  if (!weatherRes.ok || !marineRes.ok) {
    throw new Error("Open-Meteo fetch failed");
  }

  return {
    weather: await weatherRes.json(),
    marine: await marineRes.json()
  };
}

/**
 * Convert Open-Meteo responses into
 * the SAME JSON shape the UI already expects.
 */
function buildWeekPayload(open, place) {
  const days = open.weather.daily.time.map((date, i) => {
    const score =
      100 -
      open.marine.daily.wave_height_max[i] * 20 -
      open.marine.daily.wind_speed_10m_max[i];

    return {
      date,
      score: Math.max(0, Math.round(score)),
      temp_max: open.weather.daily.temperature_2m_max[i],
      temp_min: open.weather.daily.temperature_2m_min[i],
      wave_max: open.marine.daily.wave_height_max[i],
      wind_max: open.marine.daily.wind_speed_10m_max[i]
    };
  });

  return {
    place,
    days
  };
}

function buildDayPayload(weekData, dayIso) {
  const day = weekData.days.find(d => d.date === dayIso);
  if (!day) throw new Error("Day not found");
  return {
    place: weekData.place,
    day
  };
}

/* --------------------------------------------------
   Public API (used by UI)
-------------------------------------------------- */

export async function getWeekData(slug) {
  const place = PLACES[slug];
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
    // fallback
    const apiBase = window.SKIPPY_API_BASE;
    if (!apiBase) throw e;
    const data = await fetchFromWorkerWeek(apiBase, slug);
    writeCache(key, data);
    return data;
  }
}

export async function getDayData(slug, dayIso) {
  const week = await getWeekData(slug);
  const key = cacheKey("day", slug, dayIso);

  const cached = readCache(key);
  if (cached) return cached;

  const data = buildDayPayload(week, dayIso);
  writeCache(key, data);
  return data;
}

