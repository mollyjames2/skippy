// worker/worker.js
// Skippy API - raw weather + marine bundle via Open-Meteo, hourly cached.
//
// Contract:
// - GET /api/bundle?slug=...
//
// Notes:
// - Returns raw upstream JSON only (no scoring, no UI shaping).
// - Cache: 1 hour per unique URL.
// - Timezone is fixed in the shared Open-Meteo spec (Europe/London).

import { SKIPPY_PLACES } from "../docs/shared/places.js";
import { buildOpenMeteoUrl, makeBundleEnvelope } from "../docs/shared/openmeteoSpec.js";

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

    // Only supported endpoint
    if (url.pathname !== "/api/bundle") {
      return withCors(new Response("Skippy API: Not found", { status: 404 }));
    }

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
      resp = new Response(JSON.stringify({ error: msg, status: status }), {
        status,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
    }

    // Hourly refresh at the edge
    resp.headers.set("Cache-Control", "public, max-age=0, s-maxage=3600");

    // Only cache successful bundles. Never cache errors.
    if (resp.status === 200) {
      ctx.waitUntil(cache.put(cacheKey, resp.clone()));
    }

    return withCors(resp);
  },
};

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

function jsonResponse(obj) {
  return new Response(JSON.stringify(obj), {
    status: 200,
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

  const results = await Promise.all([fetchJson(weatherUrl), fetchJson(marineUrl)]);
  const weather = results[0];
  const marine = results[1];

  // Return raw upstream payloads + metadata (no scoring, no shaping)
  return makeBundleEnvelope({
    slug: place.slug || String(slug || "").trim(),
    place: place,
    weather: weather,
    marine: marine,
  });
}
