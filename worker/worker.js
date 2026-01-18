// worker/worker.js
// Skippy API - real weather + marine data via Open-Meteo, hourly cached.
//
// Endpoints (unchanged):
// - GET /api/week?slug=...
// - GET /api/day?day_iso=YYYY-MM-DD&slug=...

import { SKIPPY_PLACES } from "../shared/places.js";

const TIMEZONE = "Europe/London";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    // 1-hour edge cache per unique URL
    const cache = caches.default;
    const cacheKey = new Request(url.toString(), request);
    const cached = await cache.match(cacheKey);
    if (cached) return withCors(cached);

    let resp;
    try {
      if (url.pathname === "/api/week") {
        resp = jsonResponse(await buildWeek(url.searchParams));
      } else if (url.pathname === "/api/day") {
        resp = jsonResponse(await buildDay(url.searchParams));
      } else {
        resp = new Response("Skippy API: Not found", { status: 404 });
      }
    } catch (err) {
      const msg = String(err && err.message ? err.message : err);
      resp = new Response(JSON.stringify({ error: msg }), {
        status: 500,
        headers: { "Content-Type": "application/json; charset=utf-8" }
      });
    }

    // Hourly refresh
    resp.headers.set("Cache-Control", "public, max-age=0, s-maxage=3600");

    ctx.waitUntil(cache.put(cacheKey, resp.clone()));
    return withCors(resp);
  }
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
}

function withCors(resp) {
  const h = new Headers(resp.headers);
  const cors = corsHeaders();
  h.set("Access-Control-Allow-Origin", cors["Access-Control-Allow-Origin"]);
  h.set("Access-Control-Allow-Methods", cors["Access-Control-Allow-Methods"]);
  h.set("Access-Control-Allow-Headers", cors["Access-Control-Allow-Headers"]);
  return new Response(resp.body, { status: resp.status, headers: h });
}

function jsonResponse(obj) {
  return new Response(JSON.stringify(obj), {
    status: 200,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}

function resolvePlace(slug) {
  const s = String(slug || "").trim();
  if (s && SKIPPY_PLACES[s]) return SKIPPY_PLACES[s];
  return { slug: s, name: humanizeSlug(s) || "South Devon UK", lat: 50.35, lon: -4.10 };
}

function humanizeSlug(slug) {
  if (!slug) return "";
  return String(slug || "")
    .split("-")
    .map(function (w) {
      if (!w) return "";
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(" ");
}

async function fetchJson(url) {
  const resp = await fetch(url, { method: "GET" });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error("Upstream error " + resp.status + ": " + txt.slice(0, 200));
  }
  return await resp.json();
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function round1(x) {
  return Math.round(Number(x) * 10) / 10;
}

function toKnotsFromKmh(kmh) {
  const n = Number(kmh);
  if (!isFinite(n)) return null;
  return n / 1.852;
}

function avg(nums) {
  const xs = (nums || []).map(Number).filter(function (n) { return isFinite(n); });
  if (!xs.length) return null;
  const s = xs.reduce(function (a, b) { return a + b; }, 0);
  return s / xs.length;
}

function max(nums) {
  const xs = (nums || []).map(Number).filter(function (n) { return isFinite(n); });
  if (!xs.length) return null;
  return xs.reduce(function (a, b) { return Math.max(a, b); }, -Infinity);
}

function sum(nums) {
  const xs = (nums || []).map(Number).filter(function (n) { return isFinite(n); });
  if (!xs.length) return 0;
  return xs.reduce(function (a, b) { return a + b; }, 0);
}

function avgAngle(degArray) {
  const xs = (degArray || []).map(Number).filter(function (n) { return isFinite(n); });
  if (!xs.length) return null;
  let x = 0;
  let y = 0;
  for (let i = 0; i < xs.length; i++) {
    const r = (xs[i] * Math.PI) / 180;
    x += Math.cos(r);
    y += Math.sin(r);
  }
  const ang = (Math.atan2(y, x) * 180) / Math.PI;
  return (ang + 360) % 360;
}

function dir16(deg) {
  const d = Number(deg);
  if (!isFinite(d)) return "";
  const dirs = [
    "N","NNE","NE","ENE","E","ESE","SE","SSE",
    "S","SSW","SW","WSW","W","WNW","NW","NNW"
  ];
  const idx = Math.round(((d % 360) / 22.5)) % 16;
  return dirs[idx];
}

function safeGet(arr, idx) {
  if (!arr || typeof arr.length !== "number") return null;
  if (idx < 0 || idx >= arr.length) return null;
  const v = arr[idx];
  if (v === null || typeof v === "undefined") return null;
  const n = Number(v);
  return isFinite(n) ? n : v;
}

function groupByDay(times, values) {
  const out = {};
  for (let i = 0; i < times.length; i++) {
    const t = String(times[i] || "");
    const day = t.slice(0, 10);
    if (!out[day]) out[day] = [];
    out[day].push(values[i]);
  }
  return out;
}

// Placeholder score (keep it simple for now; tune later)
function boatingScoreHour(windKts, waveM, visKm, precipMm) {
  let s = 100;
  if (isFinite(windKts)) s -= windKts * 2.2;
  if (isFinite(waveM)) s -= waveM * 28;
  if (isFinite(visKm)) s -= Math.max(0, 8 - visKm) * 4;
  if (isFinite(precipMm)) s -= Math.min(precipMm * 4, 20);
  return Math.trunc(clamp(s, 0, 100));
}

function ratingFromScore(score) {
  if (score >= 80) return "Excellent";
  if (score >= 60) return "Good";
  if (score >= 40) return "Fair";
  return "Poor/Avoid";
}

function weatherCodeToText(code) {
  const c = Number(code);
  if (!isFinite(c)) return "";
  if (c === 0) return "Clear";
  if (c === 1) return "Mainly clear";
  if (c === 2) return "Partly cloudy";
  if (c === 3) return "Overcast";
  if (c === 45 || c === 48) return "Fog";
  if (c === 51 || c === 53 || c === 55) return "Drizzle";
  if (c === 56 || c === 57) return "Freezing drizzle";
  if (c === 61 || c === 63 || c === 65) return "Rain";
  if (c === 66 || c === 67) return "Freezing rain";
  if (c === 71 || c === 73 || c === 75) return "Snow";
  if (c === 77) return "Snow grains";
  if (c === 80 || c === 81 || c === 82) return "Rain showers";
  if (c === 85 || c === 86) return "Snow showers";
  if (c === 95) return "Thunderstorm";
  if (c === 96 || c === 99) return "Thunderstorm with hail";
  return "Mixed";
}

function pickMiddayValue(dayIso, data, key) {
  const t = (data.hourly && data.hourly.time) ? data.hourly.time : [];
  const v = (data.hourly && data.hourly[key]) ? data.hourly[key] : null;
  if (!t.length || !v) return null;

  const target = dayIso + "T12:00";
  for (let i = 0; i < t.length; i++) {
    if (String(t[i]) === target) return safeGet(v, i);
  }

  const byDay = groupByDay(t, v);
  const arr = byDay[dayIso] || [];
  return avg(arr);
}

function addMinutes(hhmm, mins) {
  const parts = String(hhmm).split(":");
  const h = parseInt(parts[0], 10) || 0;
  const m = parseInt(parts[1], 10) || 0;
  const total = (h * 60 + m + (parseInt(mins, 10) || 0)) % (24 * 60);
  const oh = Math.trunc(total / 60);
  const om = total % 60;
  return String(oh).padStart(2, "0") + ":" + String(om).padStart(2, "0");
}

function hash01(s) {
  s = String(s || "");
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000;
}

// Still mocked for now (same shape as before)
function placeholderTides(dayIso, slug) {
  const j = hash01(String(dayIso) + "/" + String(slug || ""));
  const hi1 = 6.0 + j * 0.6;
  const lo1 = 1.7 + j * 0.4;
  const hi2 = 5.6 + j * 0.6;

  const m1 = Math.trunc(j * 50);
  const m2 = Math.trunc((1 - j) * 50);

  const t1 = addMinutes("04:30", m1);
  const t2 = addMinutes("10:45", m2);
  const t3 = addMinutes("17:00", m1);

  return [
    { type: "High", time: t1, height_m: round1(hi1) },
    { type: "Low", time: t2, height_m: round1(lo1) },
    { type: "High", time: t3, height_m: round1(hi2) }
  ];
}

async function fetchOpenMeteoWeather(lat, lon) {
  const base = "https://api.open-meteo.com/v1/forecast";
  const hourly = [
    "temperature_2m",
    "apparent_temperature",
    "precipitation_probability",
    "precipitation",
    "weather_code",
    "visibility",
    "cloud_cover",
    "wind_speed_10m",
    "wind_direction_10m",
    "wind_gusts_10m",
    "pressure_msl"
  ].join(",");

  const daily = ["sunrise", "sunset"].join(",");

  const url =
    base +
    "?latitude=" + encodeURIComponent(String(lat)) +
    "&longitude=" + encodeURIComponent(String(lon)) +
    "&hourly=" + encodeURIComponent(hourly) +
    "&daily=" + encodeURIComponent(daily) +
    "&timezone=" + encodeURIComponent(TIMEZONE);

  const data = await fetchJson(url);

  // Convenience alias for midday selection
  if (data.hourly) data.hourly.weatherCode = data.hourly.weather_code;

  // Daily sunrise/sunset map by date
  const dailyByDay = {};
  const dt = data.daily && data.daily.time ? data.daily.time : [];
  for (let i = 0; i < dt.length; i++) {
    const day = String(dt[i]).slice(0, 10);
    dailyByDay[day] = {
      sunrise: (data.daily.sunrise && data.daily.sunrise[i]) ? String(data.daily.sunrise[i]).slice(11, 16) : "",
      sunset: (data.daily.sunset && data.daily.sunset[i]) ? String(data.daily.sunset[i]).slice(11, 16) : ""
    };
  }

  // By-day arrays used for tiles
  const byDay = {};
  const t = data.hourly && data.hourly.time ? data.hourly.time : [];
  for (let i = 0; i < t.length; i++) {
    const day = String(t[i]).slice(0, 10);
    if (!byDay[day]) {
      byDay[day] = { windDirDeg: [], gustKts: [], visKm: [], precipMm: [] };
    }
    byDay[day].windDirDeg.push(safeGet(data.hourly.wind_direction_10m, i));
    byDay[day].gustKts.push(toKnotsFromKmh(safeGet(data.hourly.wind_gusts_10m, i)));
    const v = safeGet(data.hourly.visibility, i);
    byDay[day].visKm.push(v != null ? Number(v) / 1000 : null);
    byDay[day].precipMm.push(safeGet(data.hourly.precipitation, i));
  }

  data.byDay = byDay;
  data.dailyByDay = dailyByDay;
  return data;
}

async function fetchOpenMeteoMarine(lat, lon) {
  const base = "https://marine-api.open-meteo.com/v1/marine";
  const hourly = [
    "wave_height",
    "wave_direction",
    "wave_period"
  ].join(",");

  const url =
    base +
    "?latitude=" + encodeURIComponent(String(lat)) +
    "&longitude=" + encodeURIComponent(String(lon)) +
    "&hourly=" + encodeURIComponent(hourly) +
    "&timezone=" + encodeURIComponent(TIMEZONE);

  const data = await fetchJson(url);

  // Convenience alias for midday selection
  if (data.hourly) data.hourly.wavePeriod = data.hourly.wave_period;

  return data;
}

function buildHourObjectsForDay(dayIso, wx, sea) {
  const wTimes = (wx.hourly && wx.hourly.time) ? wx.hourly.time : [];
  const sTimes = (sea.hourly && sea.hourly.time) ? sea.hourly.time : [];

  const seaIdx = {};
  for (let i = 0; i < sTimes.length; i++) seaIdx[sTimes[i]] = i;

  const out = [];

  for (let i = 0; i < wTimes.length; i++) {
    const t = wTimes[i];
    if (String(t).slice(0, 10) !== dayIso) continue;

    const j = seaIdx[t];

    const windKts = toKnotsFromKmh(safeGet(wx.hourly.wind_speed_10m, i));
    const visKm = safeGet(wx.hourly.visibility, i) != null
      ? Number(safeGet(wx.hourly.visibility, i)) / 1000
      : null;
    const precipMm = safeGet(wx.hourly.precipitation, i);

    const waveM = (j != null && sea.hourly && sea.hourly.wave_height)
      ? safeGet(sea.hourly.wave_height, j)
      : null;

    const score = boatingScoreHour(windKts, waveM, visKm, precipMm);

    out.push({
      time: String(t).slice(11, 16),
      temp_c: safeGet(wx.hourly.temperature_2m, i),
      wind_kts: windKts,
      wave_m: waveM,
      score: score
    });
  }

  return out;
}

function pickBestWindowFromHourly(hourObjs) {
  if (!hourObjs || !hourObjs.length) return { start: "06:00", end: "20:00" };

  let best = { i: 0, win: 2, avg: -1 };

  for (let win = 2; win <= 6; win++) {
    for (let i = 0; i + win <= hourObjs.length; i++) {
      const slice = hourObjs.slice(i, i + win);
      const a = slice.reduce(function (acc, h) { return acc + (h.score || 0); }, 0) / win;
      if (a > best.avg) best = { i: i, win: win, avg: a };
    }
  }

  const start = hourObjs[best.i].time;
  const last = hourObjs[best.i + best.win - 1].time;
  const endH = (parseInt(String(last).slice(0, 2), 10) + 1) % 24;
  const end = String(endH).padStart(2, "0") + ":00";

  return { start: start, end: end };
}

function windowsFromHourly(hourObjs, thresholdScore) {
  const thr = Number(thresholdScore);
  const out = [];
  let cur = null;

  for (let i = 0; i < hourObjs.length; i++) {
    const h = hourObjs[i];
    const ok = (h.score || 0) >= thr;

    if (ok && !cur) {
      cur = { start: h.time, end: h.time, score: h.score || 0, _n: 1 };
    } else if (ok && cur) {
      cur.end = h.time;
      cur.score += (h.score || 0);
      cur._n += 1;
    } else if (!ok && cur) {
      const endH = (parseInt(cur.end.slice(0, 2), 10) + 1) % 24;
      out.push({
        start: cur.start,
        end: String(endH).padStart(2, "0") + ":00",
        score: Math.trunc(cur.score / cur._n)
      });
      cur = null;
    }
  }

  if (cur) {
    const endH = (parseInt(cur.end.slice(0, 2), 10) + 1) % 24;
    out.push({
      start: cur.start,
      end: String(endH).padStart(2, "0") + ":00",
      score: Math.trunc(cur.score / cur._n)
    });
  }

  out.sort(function (a, b) { return b.score - a.score; });
  return out.slice(0, 3);
}

async function buildWeek(params) {
  const slug = params.get("slug") || "";
  const place = resolvePlace(slug);

  const wx = await fetchOpenMeteoWeather(place.lat, place.lon);
  const sea = await fetchOpenMeteoMarine(place.lat, place.lon);

  const today = new Date();
  const days = [];

  for (let i = 0; i < 7; i++) {
    const d = new Date(today.getTime() + i * 86400000);
    const iso = d.toISOString().slice(0, 10);
    const dow = d.toLocaleDateString("en-GB", { weekday: "short" });
    const label = d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });

    const hours = buildHourObjectsForDay(iso, wx, sea);

    const dayScore = hours.length
      ? Math.trunc(hours.reduce(function (a, h) { return a + (h.score || 0); }, 0) / hours.length)
      : 0;

    const windAvg = avg(hours.map(function (h) { return h.wind_kts; })) || 0;
    const waveAvg = avg(hours.map(function (h) { return h.wave_m; })) || 0;

    const windDir = avgAngle(wx.byDay[iso] ? wx.byDay[iso].windDirDeg : []);
    const periodMid = pickMiddayValue(iso, sea, "wavePeriod") || 0;

    const tempAvg = avg(hours.map(function (h) { return h.temp_c; })) || 0;
    const condition = weatherCodeToText(pickMiddayValue(iso, wx, "weatherCode"));

    days.push({
      date: iso,
      dow: dow,
      label: label,
      temp_c: round1(tempAvg),
      condition: condition,
      score: Math.trunc(dayScore),
      rating: ratingFromScore(dayScore),
      wind: { kts: Math.trunc(windAvg), dir: dir16(windDir) },
      waves: { m: round1(waveAvg), period_s: round1(periodMid) },
      best_time: pickBestWindowFromHourly(hours)
    });
  }

  let bestDay = days[0] || null;
  for (let i = 0; i < days.length; i++) {
    if (!bestDay || (days[i].score || 0) > (bestDay.score || 0)) bestDay = days[i];
  }

  return {
    location: place.name,
    best_day: bestDay,
    days: days,
    meta: {
      source: "open-meteo",
      timezone: TIMEZONE,
      generated_at: new Date().toISOString(),
      note: "Weather and marine are live. Tides are placeholder for now."
    }
  };
}

async function buildDay(params) {
  const slug = params.get("slug") || "";
  const place = resolvePlace(slug);

  const dayIso = params.get("day_iso") || new Date().toISOString().slice(0, 10);

  const wx = await fetchOpenMeteoWeather(place.lat, place.lon);
  const sea = await fetchOpenMeteoMarine(place.lat, place.lon);

  const d = new Date(dayIso + "T00:00:00Z");
  const title = d.toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "short" });

  const hours = buildHourObjectsForDay(dayIso, wx, sea);

  const tempAvg = avg(hours.map(function (h) { return h.temp_c; })) || 0;
  const cond = weatherCodeToText(pickMiddayValue(dayIso, wx, "weatherCode"));

  const dayScore = hours.length
    ? Math.trunc(hours.reduce(function (a, h) { return a + (h.score || 0); }, 0) / hours.length)
    : 0;

  const windMax = max(hours.map(function (h) { return h.wind_kts; })) || 0;
  const waveMax = max(hours.map(function (h) { return h.wave_m; })) || 0;

  const gustMax = max(wx.byDay[dayIso] ? wx.byDay[dayIso].gustKts : []) || 0;
  const visAvg = avg(wx.byDay[dayIso] ? wx.byDay[dayIso].visKm : []) || 0;
  const precipSum = sum(wx.byDay[dayIso] ? wx.byDay[dayIso].precipMm : []) || 0;

  const windDir = avgAngle(wx.byDay[dayIso] ? wx.byDay[dayIso].windDirDeg : []);
  const wavePeriod = pickMiddayValue(dayIso, sea, "wavePeriod") || 0;

  const sunrise = wx.dailyByDay[dayIso] ? wx.dailyByDay[dayIso].sunrise : "";
  const sunset = wx.dailyByDay[dayIso] ? wx.dailyByDay[dayIso].sunset : "";

  return {
    location: place.name,
    date: dayIso,
    title: title,
    summary: { temp_c: round1(tempAvg), condition: cond, score: Math.trunc(dayScore) },
    tiles: {
      wind_kts: Math.trunc(windMax),
      gust_kts: Math.trunc(gustMax),
      wave_m: round1(waveMax),
      visibility_km: round1(visAvg),
      wind_dir: dir16(windDir),
      period_s: round1(wavePeriod),
      precip_mm: round1(precipSum),
      sunrise: sunrise,
      sunset: sunset
    },
    tides: placeholderTides(dayIso, slug),
    recommended: windowsFromHourly(hours, 70),
    hours: hours.map(function (h) {
      return {
        time: h.time,
        temp_c: round1(h.temp_c),
        wind_kts: Math.trunc(h.wind_kts || 0),
        wave_m: round1(h.wave_m || 0),
        score: Math.trunc(h.score || 0)
      };
    }),
    meta: {
      source: "open-meteo",
      timezone: TIMEZONE,
      generated_at: new Date().toISOString(),
      note: "Weather and marine are live. Tides are placeholder for now."
    }
  };
}

