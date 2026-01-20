// worker/worker.js
// Skippy API
//
// Endpoints:
// - GET /api/bundle?slug=...
// - GET /api/tides/today?slug=...
//
// Notes:
// - /api/bundle: Open-Meteo raw bundle (1h cache)
// - /api/tides/today: TideTimes RSS adapter for *today only* (short cache)
// - Always returns JSON, never throws to frontend

import { SKIPPY_PLACES } from "../docs/shared/places.js";
import { buildOpenMeteoUrl, makeBundleEnvelope } from "../docs/shared/openmeteoSpec.js";

// RSS cache TTL (edge)
const TIDES_CACHE_SECONDS = 3 * 60; // 3 minutes

// TideTimes RSS stations we can fetch directly
const TIDE_STATIONS = {
  dartmouth: {
    key: "dartmouth",
    name: "Dartmouth",
    rss: "https://www.tidetimes.co.uk/rss/dartmouth-tide-times",
  },
  salcombe: {
    key: "salcombe",
    name: "Salcombe",
    rss: "https://www.tidetimes.co.uk/rss/salcombe-tide-times",
  },
  plymouth: {
    key: "plymouth",
    name: "Plymouth (Devonport)",
    rss: "https://www.tidetimes.co.uk/rss/plymouth-devonport-tide-times",
  },
  yealm: {
    key: "yealm",
    name: "River Yealm Entrance",
    rss: "https://www.tidetimes.co.uk/rss/river-yealm-entrance-tide-times",
  },
  torquay: {
    key: "torquay",
    name: "Torquay",
    rss: "https://www.tidetimes.co.uk/rss/torquay-tide-times",
  },
  teignmouth: {
    key: "teignmouth",
    name: "Teignmouth Approaches",
    rss: "https://www.tidetimes.co.uk/rss/teignmouth-approaches-tide-times",
  },
  exmouth: {
    key: "exmouth",
    name: "Exmouth Approaches",
    rss: "https://www.tidetimes.co.uk/rss/exmouth-approaches-tide-times",
  },
};

// Map each SKIPPY place slug to a TideTimes station key.
// Places without their own RSS borrow a nearby/representative station.
const TIDE_STATION_BY_PLACE = {
  // River Dart / home
  dartmouth: "dartmouth",

  // South Hams
  salcombe: "salcombe",
  kingsbridge: "salcombe",
  bantham: "plymouth",
  "hope-cove": "plymouth",

  // Plymouth Sound
  plymouth: "plymouth",
  wembury: "plymouth",
  "river-yealm": "yealm",

  // Torbay
  torquay: "torquay",
  brixham: "torquay",

  // Teign
  teignmouth: "teignmouth",

  // Exe
  exmouth: "exmouth",
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    // Only allow GET for API
    if (request.method !== "GET") {
      return withCors(new Response("Method not allowed", { status: 405 }));
    }

    if (url.pathname === "/api/bundle") {
      return handleBundle(request, ctx);
    }

    if (url.pathname === "/api/tides/today") {
      return handleTodayTides(request, ctx);
    }

    return withCors(new Response("Skippy API: Not found", { status: 404 }));
  },
};

/* --------------------------------------------------
   /api/bundle (existing behaviour preserved)
-------------------------------------------------- */

async function handleBundle(request, ctx) {
  const url = new URL(request.url);

  // 1-hour edge cache per unique URL
  const cache = caches.default;
  const cacheKey = new Request(url.toString(), request);
  const cached = await cache.match(cacheKey);
  if (cached) return withCors(cached);

  let resp;
  try {
    const body = await buildBundle(url.searchParams);
    resp = jsonResponse(body);
  } catch (err) {
    const status = err && typeof err.status === "number" ? err.status : 500;
    const msg = String(err && err.message ? err.message : err);
    resp = jsonResponse({ error: msg, status: status }, status);
  }

  // Hourly refresh at the edge
  resp.headers.set("Cache-Control", "public, max-age=0, s-maxage=3600");

  // Only cache successful bundles. Never cache errors.
  if (resp.status === 200) {
    ctx.waitUntil(cache.put(cacheKey, resp.clone()));
  }

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
  } catch (e) {
    // Always return JSON; never throw to frontend
    return withCors(
      jsonResponse({ ok: false, reason: "unknown_place", updated_at: updatedAt })
    );
  }

  const stationKey = TIDE_STATION_BY_PLACE[place.slug];
  const station = stationKey ? TIDE_STATIONS[stationKey] : null;

  if (!station) {
    return withCors(
      jsonResponse({
        ok: false,
        reason: "no_station_mapping",
        location: place.name,
        updated_at: updatedAt,
      })
    );
  }

  // Short edge cache per place (even if multiple places share a station).
  // This keeps the response's "location" accurate to the selected place.
  const cache = caches.default;
  const cacheKey = new Request(`https://cache.skippy/tides/today/${place.slug}`, request);
  const cached = await cache.match(cacheKey);
  if (cached) return withCors(cached);

  let resp;
  try {
    const rssText = await fetchText(station.rss);
    const parsed = parseTideTimesFromRss(rssText);

    if (!parsed.events.length) {
      throw new Error("No tide events found");
    }

    resp = jsonResponse({
      ok: true,
      source: "tidetimes",
      location: place.name, // Skippy location selected by user
      station: {
        key: station.key,
        name: station.name,
        rss: station.rss,
      },
      date: parsed.date || todayIso(),
      events: parsed.events,
      updated_at: updatedAt,
    });
  } catch (e) {
    // Frontend will fall back to Open-Meteo modelled tides
    resp = jsonResponse({
      ok: false,
      reason: "rss_unavailable",
      location: place.name,
      station: {
        key: station.key,
        name: station.name,
        rss: station.rss,
      },
      updated_at: updatedAt,
    });
  }

  // Cache briefly at the edge
  resp.headers.set(
    "Cache-Control",
    `public, max-age=0, s-maxage=${TIDES_CACHE_SECONDS}`
  );

  // Cache both ok:true and ok:false responses so we don't hammer RSS
  // (short TTL means it recovers quickly)
  if (resp.status === 200) {
    ctx.waitUntil(cache.put(cacheKey, resp.clone()));
  }

  return withCors(resp);
}

/* --------------------------------------------------
   RSS parsing helpers
-------------------------------------------------- */

function parseTideTimesFromRss(xmlText) {
  // Pull the first <item>...</item> block and parse from that.
  const itemMatch = xmlText.match(/<item>([\s\S]*?)<\/item>/i);
  const item = itemMatch ? itemMatch[1] : xmlText;

  // Try pubDate -> ISO date
  let dateIso = null;
  const pubDateMatch = item.match(/<pubDate>([\s\S]*?)<\/pubDate>/i);
  if (pubDateMatch) {
    const d = new Date(pubDateMatch[1].trim());
    if (!isNaN(d.getTime())) dateIso = d.toISOString().slice(0, 10);
  }

  // Extract <description>...</description>
  const descMatch = item.match(/<description>([\s\S]*?)<\/description>/i);
  if (!descMatch) return { date: dateIso, events: [] };

  // Decode minimal entities (RSS description contains HTML)
  const html = descMatch[1]
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

  // Match: Low Tide:00:31 (1.09m)
  const re = /(Low|High)\s*Tide:(\d{2}:\d{2})\s*\(([\d.]+)m\)/g;

  const events = [];
  let m;
  while ((m = re.exec(html)) !== null) {
    events.push({
      type: m[1], // "Low" | "High"
      time: m[2], // "HH:MM"
      height_m: Number(m[3]),
    });
  }

  return { date: dateIso, events };
}

/* --------------------------------------------------
   Shared helpers
-------------------------------------------------- */

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
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

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function resolvePlace(slug) {
  const s = String(slug || "").trim();
  if (!s) throw new HttpError(400, "Missing slug");
  const place = SKIPPY_PLACES[s];
  if (!place) throw new HttpError(404, "Unknown place");
  return place;
}

async function fetchText(url) {
  const resp = await fetch(url, { method: "GET" });
  if (!resp.ok) throw new Error("Upstream RSS error " + resp.status);
  return await resp.text();
}

async function fetchJson(url) {
  const resp = await fetch(url, { method: "GET" });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error("Upstream error " + resp.status + ": " + txt.slice(0, 200));
  }
  return await resp.json();
}

async function buildBundle(params) {
  const slug = params.get("slug") || "";
  const place = resolvePlace(slug);

  const weatherUrl = buildOpenMeteoUrl("weather", { lat: place.lat, lon: place.lon });
  const marineUrl = buildOpenMeteoUrl("marine", { lat: place.lat, lon: place.lon });

  const [weather, marine] = await Promise.all([fetchJson(weatherUrl), fetchJson(marineUrl)]);

  // Return raw upstream payloads + metadata (no scoring, no shaping)
  return makeBundleEnvelope({
    slug: place.slug,
    place,
    weather,
    marine,
  });
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}
