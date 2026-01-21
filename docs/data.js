// docs/data.js

import { SKIPPY_PLACES } from "./shared/places.js";

import {
  buildOpenMeteoUrl,
  makeBundleEnvelope,
  SKIPPY_BUNDLE_VERSION,
} from "./shared/openmeteoSpec.js";

import { calculateBoatingScore, scoreToRating } from "./common/score.js";

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
// Daily score preference: whether to average all hours or daylight hours.
// "all" | "daylight"
const DAILY_SCORE_HOURS_MODE_KEY = "skippy.score.dailyHoursMode";

function getDailyScoreHoursMode() {
  try {
    const v = localStorage.getItem(DAILY_SCORE_HOURS_MODE_KEY);
    return v === "daylight" ? "daylight" : "all";
  } catch (e) {
    return "all";
  }
}

function parseHHMMToMin(hhmm) {
  const s = String(hhmm || "");
  if (!/^\d\d:\d\d$/.test(s)) return null;
  const h = Number(s.slice(0, 2));
  const m = Number(s.slice(3, 5));
  if (!isFinite(h) || !isFinite(m)) return null;
  return h * 60 + m;
}

function ceilToHour(mins) {
  return Math.ceil(mins / 60) * 60;
}

function floorToHour(mins) {
  return Math.floor(mins / 60) * 60;
}

function hourIsInDaylight(mode, hourHHMM, sunriseHHMM, sunsetHHMM) {
  if (mode !== "daylight") return true;

  const sr = parseHHMMToMin(sunriseHHMM);
  const ss = parseHHMMToMin(sunsetHHMM);
  if (sr == null || ss == null) return true;
  if (ss <= sr) return true;

  // Match the Day screen filter logic: round sunrise up to next hour and sunset down.
  const startMin = ceilToHour(sr);
  const endMin = floorToHour(ss);

  const tMin = parseHHMMToMin(hourHHMM);
  if (tMin == null) return true;

  return tMin >= startMin && tMin <= endMin;
}

function averageScoreFromHourRows(mode, hourRows, sunriseHHMM, sunsetHHMM, fallbackScore) {
  let sum = 0;
  let n = 0;

  const list = Array.isArray(hourRows) ? hourRows : [];
  for (let i = 0; i < list.length; i++) {
    const h = list[i] || {};
    if (!hourIsInDaylight(mode, h.time, sunriseHHMM, sunsetHHMM)) continue;

    const s = Number(h.score);
    if (!isFinite(s)) continue;
    sum += s;
    n += 1;
  }

  if (n <= 0) return isFinite(Number(fallbackScore)) ? Math.round(Number(fallbackScore)) : 0;
  return Math.round(sum / n);
}

function averageDailyScoreFromHourly(bundle, dayIso, sunriseHHMM, sunsetHHMM, mode, fallbackWaveM, fallbackWindKmh) {
  const fallback = calculateBoatingScore({
    wave_m: fallbackWaveM || 0,
    wind_kmh: fallbackWindKmh || 0,
  });

  const wHourly = (bundle && bundle.weather && bundle.weather.hourly) ? bundle.weather.hourly : {};
  const mHourly = (bundle && bundle.marine && bundle.marine.hourly) ? bundle.marine.hourly : {};

  const wTimes = wHourly.time || [];
  const mTimes = mHourly.time || [];

  if (!Array.isArray(wTimes) || !wTimes.length) return fallback;

  // Align marine to weather timestamps
  const marineIndexByTime = {};
  for (let i = 0; i < mTimes.length; i++) marineIndexByTime[mTimes[i]] = i;

  let sum = 0;
  let n = 0;

  for (let i = 0; i < wTimes.length; i++) {
    const t = String(wTimes[i] || "");
    if (t.slice(0, 10) !== dayIso) continue;

    const hhmm = t.slice(11, 16);
    if (!hourIsInDaylight(mode, hhmm, sunriseHHMM, sunsetHHMM)) continue;

    const j = marineIndexByTime[t];

    const windKmhH = (wHourly.wind_speed_10m || [])[i];
    const waveMH = (j != null && mHourly.wave_height) ? mHourly.wave_height[j] : null;

    const s = calculateBoatingScore({ wave_m: waveMH || 0, wind_kmh: windKmhH || 0 });
    sum += s;
    n += 1;
  }

  if (n <= 0) return fallback;
  return Math.round(sum / n);
}

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
    const ts = parsed.ts;
    const data = parsed.data;

    // Drop cache if bundle version doesn't match current contract/spec.
    if (!data || data.v !== SKIPPY_BUNDLE_VERSION) return null;

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

/**
 * Returns YYYY-MM-DD for "today" in Europe/London (prevents UTC rollover issues).
 */
function todayIsoLondon() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const d = parts.find((p) => p.type === "day")?.value;
  return `${y}-${m}-${d}`;
}

/**
 * Adds N days to a YYYY-MM-DD string and returns YYYY-MM-DD.
 * Uses UTC math to avoid local timezone DST weirdness.
 */
function addDaysIso(dateIso, days) {
  const s = String(dateIso || "");
  const d = new Date(s + "T00:00:00Z");
  if (isNaN(d.getTime())) throw new Error("Invalid date: " + s);
  d.setUTCDate(d.getUTCDate() + Number(days || 0));
  return d.toISOString().slice(0, 10);
}

/**
 * Fetch today's TideTimes-derived tides from the Worker.
 * Returns:
 *  - { ok:true, events:[...], updated_at, station, ... } on success
 *  - { ok:false, reason, updated_at, station? } on RSS failure
 *  - null on network/other failure
 */
async function fetchTodayTidesFromWorker(slug) {
  try {
    const apiBase = getApiBase();
    if (!apiBase) return null;

    const url = apiBase + "/api/tides/today?slug=" + encodeURIComponent(slug);
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;

    const json = await res.json();
    if (!json) return null;
    return json;
  } catch (e) {
    return null;
  }
}

/* --------------------------------------------------
   Bundle fetch (browser-first, worker fallback)
-------------------------------------------------- */

async function fetchBundleFromUpstream(place) {
  const weatherUrl = buildOpenMeteoUrl("weather", { lat: place.lat, lon: place.lon });
  const marineUrl = buildOpenMeteoUrl("marine", { lat: place.lat, lon: place.lon });

  const [weather, marine] = await Promise.all([fetchJson(weatherUrl), fetchJson(marineUrl)]);

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

function degToCompass(deg) {
  const n = Number(deg);
  if (!isFinite(n)) return "-";
  const dirs = [
    "N","NNE","NE","ENE","E","ESE","SE","SSE",
    "S","SSW","SW","WSW","W","WNW","NW","NNW",
  ];
  const idx = Math.round(((n % 360) / 22.5)) % 16;
  return dirs[idx];
}

function formatDow(dateIso) {
  const d = new Date(dateIso + "T00:00:00");
  return new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(d);
}

function formatLabel(dateIso) {
  const d = new Date(dateIso + "T00:00:00");
  return new Intl.DateTimeFormat(undefined, { day: "2-digit", month: "short" }).format(d);
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

function kmhToKnotsInt(kmh) {
  const k = kmhToKnotsFloat(kmh);
  if (k == null) return 0;
  return Math.round(k);
}

function summarizeVisibilityKmForDay(dayIso, wHourly) {
  const times = (wHourly && wHourly.time) ? wHourly.time : [];
  const visM = (wHourly && wHourly.visibility) ? wHourly.visibility : [];

  // Conservative: show worst (minimum) visibility across the day.
  let minM = null;
  for (let i = 0; i < times.length; i++) {
    const t = String(times[i] || "");
    if (t.slice(0, 10) !== dayIso) continue;
    const v = Number(visM[i]);
    if (!isFinite(v)) continue;
    if (minM === null || v < minM) minM = v;
  }

  if (minM === null) return null;
  return minM / 1000;
}

/* --------------------------------------------------
   Tides (derived from marine.minutely_15.sea_level_height_msl)
   - Semi-diurnal friendly (2H/2L typical, but variable)
   - No forced counts; we detect local extrema in the curve
-------------------------------------------------- */

function detectExtremaPlateauAware(times, levels) {
  // Output events: { type: "High"|"Low", iso: "YYYY-MM-DDTHH:MM", height_m: number }
  const events = [];
  if (!times || !levels || times.length < 3 || times.length !== levels.length) return events;

  function sign(x) {
    if (x > 0) return 1;
    if (x < 0) return -1;
    return 0;
  }

  const slope = [];
  for (let i = 0; i < levels.length - 1; i++) {
    const a = Number(levels[i]);
    const b = Number(levels[i + 1]);
    if (!isFinite(a) || !isFinite(b)) {
      slope.push(null);
    } else {
      slope.push(sign(b - a));
    }
  }

  let lastNonZero = null;

  for (let i = 0; i < slope.length; i++) {
    const s = slope[i];
    if (s === null) continue;
    if (s === 0) continue;

    if (lastNonZero === null) {
      lastNonZero = s;
      continue;
    }

    if (lastNonZero === 1 && s === -1) {
      const peakIdx = i;
      const h = Number(levels[peakIdx]);
      if (isFinite(h)) events.push({ type: "High", iso: times[peakIdx], height_m: h });
    } else if (lastNonZero === -1 && s === 1) {
      const troughIdx = i;
      const h = Number(levels[troughIdx]);
      if (isFinite(h)) events.push({ type: "Low", iso: times[troughIdx], height_m: h });
    }

    lastNonZero = s;
  }

  const cleaned = [];
  for (let i = 0; i < events.length; i++) {
    const prev = cleaned[cleaned.length - 1];
    const cur = events[i];
    if (!prev) {
      cleaned.push(cur);
      continue;
    }
    if (prev.type === cur.type) {
      if (cur.type === "High") {
        if (cur.height_m >= prev.height_m) cleaned[cleaned.length - 1] = cur;
      } else {
        if (cur.height_m <= prev.height_m) cleaned[cleaned.length - 1] = cur;
      }
      continue;
    }
    cleaned.push(cur);
  }

  return cleaned;
}

function tidesForDay(bundle, dayIso) {
  const mMinutely_15 =
    (bundle && bundle.marine && bundle.marine.minutely_15) ? bundle.marine.minutely_15 : {};
  const times = mMinutely_15.time || [];
  const levels = mMinutely_15.sea_level_height_msl || [];
  if (!times.length || times.length !== levels.length) return [];

  const events = detectExtremaPlateauAware(times, levels);

  return events
    .filter((e) => String(e.iso || "").slice(0, 10) === dayIso)
    .sort((a, b) => String(a.iso).localeCompare(String(b.iso)))
    .map((e) => ({
      type: e.type,
      time: String(e.iso).slice(11, 16),
      height_m: Math.round(Number(e.height_m) * 10) / 10,
    }));
}

/* --------------------------------------------------
   Week builder (DAILY only)
-------------------------------------------------- */

function buildWeekPayloadFromBundle(bundle, place) {
  const wDaily = (bundle && bundle.weather && bundle.weather.daily) ? bundle.weather.daily : {};
  const mDaily = (bundle && bundle.marine && bundle.marine.daily) ? bundle.marine.daily : {};

  const times = wDaily.time || [];
  const codes = wDaily.weather_code || [];
  const tmax = wDaily.temperature_2m_max || [];

  const waveMax = mDaily.wave_height_max || [];
  const windMaxKmh = wDaily.wind_speed_10m_max || [];

  // DAILY: Dominant wind direction (10m)
  const windDirDom = wDaily.wind_direction_10m_dominant || [];
  
  const sunriseIsoArr = wDaily.sunrise || [];
  const sunsetIsoArr = wDaily.sunset || [];
  const dailyScoreMode = getDailyScoreHoursMode();

  const todayIso = todayIsoLondon();
  const todayIdx = times.indexOf(todayIso);

  // Start from tomorrow if we can find today; otherwise fall back to skipping the first element.
  const startIdx = (todayIdx >= 0) ? (todayIdx + 1) : 1;

  // We want 7 days excluding today.
  const endIdx = Math.min(startIdx + 7, times.length);

  const days = [];
  for (let i = startIdx; i < endIdx; i++) {
    const date = times[i];

    const wave = (waveMax[i] ?? 0);
    const windKmh = (windMaxKmh[i] ?? 0);

    const score = averageDailyScoreFromHourly(
      bundle,
      date,
      sunriseIsoArr[i] ? String(sunriseIsoArr[i]).slice(11, 16) : null,
      sunsetIsoArr[i] ? String(sunsetIsoArr[i]).slice(11, 16) : null,
      dailyScoreMode,
      wave,
      windKmh
    );
  
    days.push({
      date: date,
      dow: formatDow(date),
      label: formatLabel(date),

      condition: weatherCodeToText(codes[i]),
      temp_c: Math.round((tmax[i] ?? 0)),

      score: score,
      rating: scoreToRating(score),

      wind: {
        kts: kmhToKnotsInt(windKmh),
        dir: degToCompass(windDirDom[i]),
      },

      waves: {
        m: round1(wave),
      },

      best_time: { start: "All day", end: "All day" },
    });
  }

  const best = days.reduce(function (acc, d) {
    if (!acc || d.score > acc.score) return d;
    return acc;
  }, null);

  return {
    location: (place && place.name) ? place.name : "",
    place: place,
    days: days,
    best_day: best
      ? { dow: best.dow, label: best.label, score: best.score, best_time: best.best_time }
      : null,
  };
}

/* --------------------------------------------------
   Day builder (DAILY summary + HOURLY rows)
-------------------------------------------------- */

async function buildDayPayloadFromBundle(bundle, place, dayIso) {
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

  // DAILY: Dominant wind direction (10m)
  const windDirDom = (wDaily.wind_direction_10m_dominant || [])[dayIdx];

  const precipSum = (wDaily.precipitation_sum || [])[dayIdx];

  const sunrise = (wDaily.sunrise || [])[dayIdx];
  const sunset = (wDaily.sunset || [])[dayIdx];

  const waveMax = (mDaily.wave_height_max || [])[dayIdx];
  const wavePeriodMax = (mDaily.wave_period_max || [])[dayIdx];

  const fallbackDayScore = calculateBoatingScore({ wave_m: waveMax || 0, wind_kmh: windMaxKmh || 0 });

  const title = formatDow(dayIso) + " " + formatLabel(dayIso);

  const wHourly = (bundle && bundle.weather && bundle.weather.hourly) ? bundle.weather.hourly : {};
  const mHourly = (bundle && bundle.marine && bundle.marine.hourly) ? bundle.marine.hourly : {};

  // HOURLY summary for the tile (worst-of-day)
  const visKm = summarizeVisibilityKmForDay(dayIso, wHourly);

  // Align marine to weather timestamps
  const wTimes = wHourly.time || [];
  const mTimes = mHourly.time || [];

  const marineIndexByTime = {};
  for (let i = 0; i < mTimes.length; i++) marineIndexByTime[mTimes[i]] = i;

  const hours = [];
  for (let i = 0; i < wTimes.length; i++) {
    const t = String(wTimes[i] || "");
    if (t.slice(0, 10) !== dayIso) continue;

    const j = marineIndexByTime[t];

    // HOURLY weather
    const tempC = (wHourly.temperature_2m || [])[i];
    const codeH = (wHourly.weather_code || [])[i];

    const windKmhH = (wHourly.wind_speed_10m || [])[i];
    const windDirDegH = (wHourly.wind_direction_10m || [])[i];
    const gustKmhH = (wHourly.wind_gusts_10m || [])[i];

    const precipMmH = (wHourly.precipitation || [])[i];
    const visMH = (wHourly.visibility || [])[i];

    // HOURLY marine
    const waveMH = (j != null && mHourly.wave_height) ? mHourly.wave_height[j] : null;
    const wavePeriodH = (j != null && mHourly.wave_period) ? mHourly.wave_period[j] : null;

    const score = calculateBoatingScore({ wave_m: waveMH || 0, wind_kmh: windKmhH || 0 });

    hours.push({
      time: t.slice(11, 16),
      temp_c: round1(tempC),
      condition: weatherCodeToText(codeH),

      wind_kts: kmhToKnotsInt(windKmhH),
      wind_dir: degToCompass(windDirDegH),
      gust_kts: kmhToKnotsInt(gustKmhH),

      wave_m: round1(waveMH || 0),
      wave_period_s: round1(wavePeriodH || 0),

      precip_mm: round1(precipMmH || 0),
      visibility_km: isFinite(Number(visMH)) ? round1(Number(visMH) / 1000) : null,

      score: score,
    });
  }

  // Modelled tides (15-min sea level curve extrema)
  const modelledTides = tidesForDay(bundle, dayIso);

  // Tomorrow modelled tides (ONLY needed for the homepage "Today's tides" card fallback logic)
  // If there are no remaining extrema today, the UI will take the first extrema tomorrow.
  const todayIso = todayIsoLondon();
  let tidesTomorrowModel = [];
  if (dayIso === todayIso) {
    try {
      const tomorrowIso = addDaysIso(dayIso, 1);
      tidesTomorrowModel = tidesForDay(bundle, tomorrowIso);
    } catch (e) {
      tidesTomorrowModel = [];
    }
  }

  // If this is "today" (London), try to override with TideTimes RSS via worker.
  let tides = modelledTides;
  let tidesMeta = {
    source: modelledTides.length ? "model" : "none",
    message: modelledTides.length
      ? "Using 15 minute modelled tide predictions"
      : "Tide data unavailable",
    updated_at: null,
    station: null,
  };

  if (dayIso === todayIso) {
    const rss = await fetchTodayTidesFromWorker(place.slug);

    if (rss && rss.ok === true && Array.isArray(rss.events) && rss.events.length) {
      tides = rss.events.map((e) => ({
        type: e.type,
        time: e.time,
        height_m: Math.round(Number(e.height_m) * 10) / 10,
      }));

      tidesMeta = {
        source: "tidetimes",
        message: "Data accessed from Tide Times",
        updated_at: rss.updated_at || null,
        station: rss.station || null,
      };
    } else {
      // Clean fallback to modelled tides, but with explicit messaging.
      tidesMeta = {
        source: modelledTides.length ? "model" : "none",
        message:
          "High accuracy tidal data not available — using 15 minute modelled tide predictions",
        updated_at: (rss && rss.updated_at) ? rss.updated_at : null,
        station: (rss && rss.station) ? rss.station : null,
      };
    }
  }

  // Only show tidal height when sourced from TideTimes.
  // For modelled tides, hide height values intentionally.
  if (!tidesMeta || tidesMeta.source !== "tidetimes") {
    tides = (tides || []).map(function (e) {
      return {
        type: e && e.type ? e.type : "-",
        time: e && e.time ? e.time : "-",
        height_m: null,
      };
    });
  }
  
  // Daily score is derived from the average of hourly scores.
  // Mode is controlled in Settings: all hours vs daylight hours.
  const dailyScoreMode = getDailyScoreHoursMode();
  const sunriseHHMM = sunrise ? String(sunrise).slice(11, 16) : null;
  const sunsetHHMM = sunset ? String(sunset).slice(11, 16) : null;
  
  const dayScore = averageScoreFromHourRows(
    dailyScoreMode,
    hours,
    sunriseHHMM,
    sunsetHHMM,
    fallbackDayScore
  );


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
      tides_status: tides.length ? "Tides available" : "Unavailable",
    },

    tiles: {
      wind_kts: kmhToKnotsInt(windMaxKmh),
      gust_kts: kmhToKnotsInt(gustMaxKmh),

      // DAILY
      wind_dir: degToCompass(windDirDom),

      wave_m: round1(waveMax || 0),
      period_s: round1(wavePeriodMax || 0),

      // HOURLY-derived summary (OK for Day screen)
      visibility_km: visKm == null ? "-" : round1(visKm),

      precip_mm: round1(precipSum || 0),

      sunrise: sunrise ? String(sunrise).slice(11, 16) : "-",
      sunset: sunset ? String(sunset).slice(11, 16) : "-",
    },

    tides: tides,
    tides_meta: tidesMeta,

    // Used by the homepage "Today's tides" card to show the *next* extrema when the next one is tomorrow.
    // This is always modelled (15-min curve). Only populated for dayIso === todayIsoLondon().
    tides_tomorrow_model: tidesTomorrowModel,

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
