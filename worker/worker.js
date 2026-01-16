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
    if (url.pathname === "/api/week") {
      resp = jsonResponse(mockWeek(url.searchParams));
    } else if (url.pathname === "/api/day") {
      resp = jsonResponse(mockDay(url.searchParams));
    } else {
      resp = new Response("Not found", { status: 404 });
    }

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

function mockWeek(params) {
  const location = params.get("location") || "South West UK";
  const today = new Date();
  const days = [];

  for (let i = 0; i < 7; i++) {
    const d = new Date(today.getTime() + i * 86400000);
    const iso = d.toISOString().slice(0, 10);
    const dow = d.toLocaleDateString("en-GB", { weekday: "short" });
    const label = d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });

    let score = i < 4 ? 85 - i * 3 : 70 - i * 2;
    score = Math.max(35, Math.min(95, score));

    const windKts = 8 + i;
    const waveM = Math.round((0.6 + i * 0.1) * 10) / 10;

    const rating = score >= 80 ? "Excellent" : score >= 60 ? "Good" : score >= 40 ? "Fair" : "Poor/Avoid";

    days.push({
      date: iso,
      dow: dow,
      label: label,
      temp_c: Math.round((8.5 + i * 0.3) * 10) / 10,
      condition: i % 2 === 0 ? "Overcast" : "Partly cloudy",
      score: Math.trunc(score),
      rating: rating,
      wind: { kts: Math.trunc(windKts), dir: "SSW" },
      waves: { m: waveM, period_s: 5 },
      best_time: { start: "06:00", end: "20:00" }
    });
  }

  let bestDay = days[0];
  for (const d of days) if (d.score > bestDay.score) bestDay = d;

  return { location: location, best_day: bestDay, days: days };
}

function mockDay(params) {
  const location = params.get("location") || "South West UK";
  const dayIso = params.get("day_iso") || new Date().toISOString().slice(0, 10);

  const d = new Date(dayIso + "T00:00:00Z");
  const title = d.toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "short" });

  const hours = [];
  for (let h = 0; h < 24; h++) {
    const t = String(h).padStart(2, "0") + ":00";
    const base = 60 + (h - 12) * (h >= 12 ? 1 : -1);
    const score = Math.max(35, Math.min(95, base));
    const wind = 6 + (h % 6);
    const waves = Math.round((0.6 + (h % 8) * 0.1) * 10) / 10;
    hours.push({
      time: t,
      temp_c: Math.round((7.5 + h * 0.05) * 10) / 10,
      wind_kts: wind,
      wave_m: waves,
      score: Math.trunc(score)
    });
  }

  const tides = [
    { type: "High", time: "04:34", height_m: 6.2 },
    { type: "Low", time: "10:46", height_m: 2.0 },
    { type: "High", time: "16:58", height_m: 5.7 }
  ];

  const recommended = [{ start: "06:00", end: "20:00", score: 85 }];

  return {
    location: location,
    date: dayIso,
    title: title,
    summary: { temp_c: 9, condition: "Overcast", score: 85 },
    tiles: {
      wind_kts: 13,
      gust_kts: 19,
      wind_dir: "SSW",
      wave_m: 1.1,
      period_s: 4.6,
      visibility_km: 22.7,
      precip_mm: 0.0,
      sunrise: "07:50",
      sunset: "16:18"
    },
    tides: tides,
    recommended: recommended,
    hours: hours
  };
}

