// worker/worker.js
// Skippy API
//
// Endpoints:
// - GET /api/bundle?slug=...
// - GET /api/tides/today?slug=...
//
// Notes:
// - /api/bundle: Open-Meteo raw bundle (1h cache)
// - /api/tides/today: TideTimes RSS adapter for *today only*
// - Always returns JSON, never throws to frontend

import { SKIPPY_PLACES } from "../docs/shared/places.js";
import { buildOpenMeteoUrl, makeBundleEnvelope } from "../docs/shared/openmeteoSpec.js";

// Cache TTL for unstable outcomes (edge)
const TIDES_CACHE_UNSTABLE_SECONDS = 10 * 60; // 10 minutes

// TideTimes RSS stations we can fetch directly
const TIDE_STATIONS = {
  dartmouth: {
    key: "dartmouth",
    name: "Dartmouth",
    rss: "https://www.tidetimes.org.uk/dartmouth-tide-times.rss",
  },
  salcombe: {
    key: "salcombe",
    name: "Salcombe",
    rss: "https://www.tidetimes.org.uk/salcombe-tide-times.rss",
  },
  plymouth: {
    key: "plymouth",
    name: "Plymouth (Devonport)",
    rss: "https://www.tidetimes.org.uk/plymouth-devonport-tide-times.rss",
  },
  yealm: {
    key: "yealm",
    name: "River Yealm Entrance",
    rss: "https://www.tidetimes.org.uk/river-yealm-entrance-tide-times.rss",
  },
  torquay: {
    key: "torquay",
    name: "Torquay",
    rss: "https://www.tidetimes.org.uk/torquay-tide-times.rss",
  },
  teignmouth: {
    key: "teignmouth",
    name: "Teignmouth Approaches",
    rss: "https://www.tidetimes.org.uk/teignmouth-approaches-tide-times.rss",
  },
  exmouth: {
    key: "exmouth",
    name: "Exmouth Approaches",
    rss: "https://www.tidetimes.org.uk/exmouth-approaches-tide-times.rss",
  },
};

// Map each SKIPPY place slug to a TideTimes station key.
const TIDE_STATION_BY_PLACE = {
  dartmouth: "dartmouth",

  salcombe: "salcombe",
  kingsbridge: "salcombe",
  bantham: "plymouth",
  "hope-cove": "plymouth",

  plymouth: "plymouth",
  wembury: "plymouth",
  "river-yealm": "yealm",

  torquay: "torquay",
  brixham: "torquay",

  teignmouth: "teignmouth",
  exmouth: "exmouth",
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    if (request.method !== "GET") {
      return withCors(new Response("Method not allowed", { status: 405 }));
    }

    if (url.pathname === "/api/bundle") return handleBundle(request, ctx);
    if (url.pathname === "/api/tides/today") return handleTodayTides(request, ctx);

    return withCors(new Response("Skippy API: Not found", { status: 404 }));
  },
};

/* --------------------------------------------------
   /api/bundle
-------------------------------------------------- */

async function handleBundle(request, ctx) {
  const url = new URL(request.url);
  const cache = caches.default;
  const cacheKey = new Request(url.toString(), request);
  const cached = await cache.match(cacheKey);
  if (cached) return withCors(cached);

  let resp;
  try {
    resp = jsonResponse(await buildBundle(url.searchParams));
  } catch (err) {
    const status = err?.status || 500;
    resp = jsonResponse({ error: String(err.message || err) }, status);
  }

  resp.headers.set("Cache-Control", "public, max-age=0, s-maxage=3600");
  if (resp.status === 200) ctx.waitUntil(cache.put(cacheKey, resp.clone()));
  return withCors(resp);
}

/* --------------------------------------------------
   /api/tides/today
-------------------------------------------------- */

async function handleTodayTides(request, ctx) {
  const url = new URL(request.url);
  const slug = url.searchParams.get("slug") || "";
  const updatedAt = new Date().toISOString();

  let place;
  try {
    place = resolvePlace(slug);
  } catch {
    return withCors(jsonResponse({ ok: false, reason: "unknown_place", updated_at: updatedAt }));
  }

  const stationKey = TIDE_STATION_BY_PLACE[place.slug];
  const station = stationKey && TIDE_STATIONS[stationKey];
  if (!station) {
    return withCors(jsonResponse({ ok: false, reason: "no_station_mapping", location: place.name }));
  }

  const cache = caches.default;
  const cacheKey = new Request(`https://cache.skippy/tides/today/${place.slug}`, request);
  const cached = await cache.match(cacheKey);
  if (cached) return withCors(cached);

  let resp;
  let rssText;

  try {
    rssText = await fetchText(station.rss);
  } catch {
    resp = jsonResponse({
      ok: false,
      reason: "rss_fetch_failed",
      location: place.name,
      station,
      updated_at: updatedAt,
    });
  }

  if (!resp) {
    const parsed = parseTideTimesFromRss(rssText);
    if (!parsed.events.length) {
      resp = jsonResponse({
        ok: false,
        reason: "rss_no_events",
        location: place.name,
        station,
        updated_at: updatedAt,
      });
    } else {
      resp = jsonResponse({
        ok: true,
        source: "tidetimes",
        location: place.name,
        station,
        date: parsed.date || todayIso(),
        events: parsed.events,
        updated_at: updatedAt,
      });
    }
  }

  const ttl = resp.ok === true ? secondsUntilTomorrowUK() : TIDES_CACHE_UNSTABLE_SECONDS;

  resp.headers.set("Cache-Control", `public, max-age=0, s-maxage=${ttl}`);
  if (resp.status === 200) ctx.waitUntil(cache.put(cacheKey, resp.clone()));
  return withCors(resp);
}

/* --------------------------------------------------
   Helpers
-------------------------------------------------- */

function secondsUntilTomorrowUK() {
  const now = new Date();

  // Convert "now" to UK-local date parts
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(now);

  const get = (t) => Number(parts.find((p) => p.type === t).value);

  // UK-local midnight at start of tomorrow
  const ukMidnightTomorrow = new Date(
    Date.UTC(get("year"), get("month") - 1, get("day") + 1, 0, 0, 0)
  );

  const seconds = Math.floor((ukMidnightTomorrow - now) / 1000);
  return Math.max(60, Math.min(seconds, 24 * 60 * 60));
}

function parseTideTimesFromRss(xmlText) {
  const item = xmlText.match(/<item>([\s\S]*?)<\/item>/i)?.[1] || xmlText;

  // Date from <pubDate>
  const dateIso = (() => {
    const m = item.match(/<pubDate>([\s\S]*?)<\/pubDate>/i);
    const d = m && new Date(m[1].trim());
    return d && !isNaN(d) ? d.toISOString().slice(0, 10) : null;
  })();

  const descRaw = item.match(/<description>([\s\S]*?)<\/description>/i)?.[1];
  if (!descRaw) return { date: dateIso, events: [] };

  // Decode RSS/HTML entities (handles &#x28; etc)
  const html = decodeEntities(descRaw);

  const events = [];

  // NEW format: "02:50 - Low Tide (1.05m)"
  const reNew = /(\d{1,2}:\d{2})\s*-\s*(Low|High)\s*Tide\s*\(([\d.]+)\s*m\)/gi;
  let m;
  while ((m = reNew.exec(html))) {
    events.push({ type: cap(m[2]), time: padTime(m[1]), height_m: Number(m[3]) });
  }

  // OLD format fallback: "Low Tide:02:50 (1.05m)"
  if (!events.length) {
    const reOld = /(Low|High)\s*Tide:\s*(\d{1,2}:\d{2})\s*\(([\d.]+)\s*m\)/gi;
    while ((m = reOld.exec(html))) {
      events.push({ type: cap(m[1]), time: padTime(m[2]), height_m: Number(m[3]) });
    }
  }

  return { date: dateIso, events };
}

function cap(s) {
  s = String(s || "");
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

// Ensure times like "2:50" become "02:50"
function padTime(t) {
  const parts = String(t).trim().split(":");
  if (parts.length !== 2) return String(t).trim();
  const hh = parts[0].padStart(2, "0");
  const mm = parts[1].padStart(2, "0");
  return `${hh}:${mm}`;
}

// Robust entity decoding for RSS descriptions
function decodeEntities(s) {
  s = String(s);

  // Named entities commonly seen in RSS
  s = s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

  // Numeric hex entities: &#x28;
  s = s.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
    const code = parseInt(hex, 16);
    return Number.isFinite(code) ? String.fromCharCode(code) : _;
  });

  // Numeric decimal entities: &#40;
  s = s.replace(/&#([0-9]+);/g, (_, dec) => {
    const code = parseInt(dec, 10);
    return Number.isFinite(code) ? String.fromCharCode(code) : _;
  });

  return s;
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function withCors(resp) {
  return new Response(resp.body, {
    status: resp.status,
    headers: { ...corsHeaders(), ...Object.fromEntries(resp.headers) },
  });
}

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function resolvePlace(slug) {
  const place = SKIPPY_PLACES[String(slug || "").trim()];
  if (!place) throw new Error("Unknown place");
  return place;
}

async function fetchText(url) {
  const r = await fetch(url, {
    headers: {
      Accept: "application/rss+xml, application/xml, text/xml, */*",
      "User-Agent": "SkippyTides/1.0 (+https://skippy)",
    },
  });
  if (!r.ok) throw new Error("RSS fetch failed");
  return r.text();
}

async function fetchJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error("Fetch failed");
  return r.json();
}

async function buildBundle(params) {
  const place = resolvePlace(params.get("slug"));
  const weather = fetchJson(buildOpenMeteoUrl("weather", place));
  const marine = fetchJson(buildOpenMeteoUrl("marine", place));
  return makeBundleEnvelope({
    slug: place.slug,
    place,
    weather: await weather,
    marine: await marine,
  });
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}
