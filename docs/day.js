"use strict";

import { pillClass, requireLocationOrRedirect } from "./common/core.js";
import { getDayData } from "./data.js";

// Reuse existing infra
import { scoreDayFromHourRows } from "./common/score.js";
import { windowsByTierFromHourRows } from "./common/window.js";

// Settings storage keys (shared behaviour)
const SETTINGS_DAILY_SCORE_MODE_KEY = "skippy.score.dailyHoursMode"; // "all" | "daylight"
const MIN_RECOMMENDED_WINDOW_HOURS_KEY = "skippy.recommended.minHours"; // int 1..8 (default 2)

// Environment (shared with Settings)
const SCORE_ENVIRONMENT_KEY = "skippy.score.environment"; // "coastal" | "estuary"

function getDateParam() {
  var p = new URLSearchParams(window.location.search);
  return p.get("date") || "";
}

function tileHtml(label, main, sub) {
  return (
    "" +
    '<div class="tile">' +
    '  <div class="muted small">' + label + "</div>" +
    '  <div style="font-weight:800;">' + main + "</div>" +
    '  <div class="muted small">' + sub + "</div>" +
    "</div>"
  );
}

function conditionToIcon(conditionText) {
  var t = String(conditionText || "").toLowerCase();
  if (t.indexOf("thunder") >= 0) return "\u26c8\ufe0f";
  if (t.indexOf("snow") >= 0) return "\u2744\ufe0f";
  if (t.indexOf("fog") >= 0) return "\ud83c\udf2b\ufe0f";
  if (t.indexOf("shower") >= 0) return "\ud83c\udf27\ufe0f";
  if (t.indexOf("drizzle") >= 0 || t.indexOf("rain") >= 0) return "\ud83c\udf26\ufe0f";
  if (t.indexOf("cloud") >= 0) return "\u2601\ufe0f";
  if (t.indexOf("clear") >= 0 || t.indexOf("mostly") >= 0) return "\u26c5\ufe0f";
  return "\ud83c\udf25\ufe0f";
}

/* ----------------------------
   Read Settings (for initial mode only)
---------------------------- */

function getSettingsDailyMode() {
  var v = "";
  try {
    v = localStorage.getItem(SETTINGS_DAILY_SCORE_MODE_KEY) || "";
  } catch (e) {
    v = "";
  }
  return v === "daylight" ? "daylight" : "all";
}

function getScoreEnvironment() {
  var v = "";
  try {
    v = localStorage.getItem(SCORE_ENVIRONMENT_KEY) || "";
  } catch (e) {
    v = "";
  }
  return v === "estuary" ? "estuary" : "coastal";
}

function clampInt(n, a, b) {
  var x = Math.trunc(Number(n));
  if (!isFinite(x)) return a;
  return Math.max(a, Math.min(b, x));
}

function getMinRecommendedWindowHours() {
  var v = "";
  try {
    v = localStorage.getItem(MIN_RECOMMENDED_WINDOW_HOURS_KEY) || "";
  } catch (e) {
    v = "";
  }
  if (!v) return 2;
  return clampInt(parseInt(v, 10), 1, 8);
}

/* ----------------------------
   Toggle (local-only; no persistence)
---------------------------- */

function setupToggle(initialMode, onChange) {
  var root = document.getElementById("hoursToggle");
  if (!root) return;

  function applyActive(mode) {
    var btns = root.querySelectorAll(".segbtn");
    btns.forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-mode") === mode);
    });
  }

  // initial state comes from Settings
  applyActive(initialMode);

  root.addEventListener("click", function (e) {
    var target = e.target;
    if (!target) return;
    if (!target.classList.contains("segbtn")) return;

    var next = target.getAttribute("data-mode") === "daylight" ? "daylight" : "all";
    applyActive(next);
    if (typeof onChange === "function") onChange(next);
  });
}

/* ----------------------------
   Time helpers + daylight rounding
---------------------------- */

function parseHHMMToMin(hhmm) {
  var s = String(hhmm || "");
  if (!/^\d\d:\d\d$/.test(s)) return null;
  var h = Number(s.slice(0, 2));
  var m = Number(s.slice(3, 5));
  if (!isFinite(h) || !isFinite(m)) return null;
  return h * 60 + m;
}

function minToHHMM(mins) {
  var m = Number(mins);
  if (!isFinite(m)) return null;
  var mm = ((m % 60) + 60) % 60;
  var hh = Math.floor(m / 60);
  if (hh < 0 || hh > 23) return null;
  return String(hh).padStart(2, "0") + ":" + String(mm).padStart(2, "0");
}

function ceilToHour(mins) {
  return Math.ceil(mins / 60) * 60;
}

function floorToHour(mins) {
  return Math.floor(mins / 60) * 60;
}

// Round sunrise up, sunset down to whole hours (same philosophy as scoring/windows)
function adjustedSunWindowForMode(mode, sunriseHHMM, sunsetHHMM) {
  if (mode !== "daylight") {
    return { sunriseHHMM: sunriseHHMM || null, sunsetHHMM: sunsetHHMM || null };
  }

  var sr = parseHHMMToMin(sunriseHHMM);
  var ss = parseHHMMToMin(sunsetHHMM);
  if (sr == null || ss == null) return { sunriseHHMM: sunriseHHMM || null, sunsetHHMM: sunsetHHMM || null };
  if (ss <= sr) return { sunriseHHMM: sunriseHHMM || null, sunsetHHMM: sunsetHHMM || null };

  var startMin = ceilToHour(sr);
  var endMin = floorToHour(ss);

  return {
    sunriseHHMM: minToHHMM(startMin) || sunriseHHMM || null,
    sunsetHHMM: minToHHMM(endMin) || sunsetHHMM || null,
  };
}

/* ----------------------------
   Hour list filtering (match scoring: end is exclusive)
---------------------------- */

function filterHours(mode, hours, sunriseHHMM, sunsetHHMM) {
  if (mode !== "daylight") return hours;

  var sr = parseHHMMToMin(sunriseHHMM);
  var ss = parseHHMMToMin(sunsetHHMM);
  if (sr == null || ss == null) return hours;
  if (ss <= sr) return hours;

  var startMin = ceilToHour(sr);
  var endMin = floorToHour(ss);

  return (hours || []).filter(function (h) {
    var tMin = parseHHMMToMin(h.time);
    if (tMin == null) return true;
    // END EXCLUSIVE
    return tMin >= startMin && tMin < endMin;
  });
}

function renderHourlyTable(hoursEl, mode, hours, sunrise, sunset) {
  hoursEl.innerHTML = "";

  var list = filterHours(mode, hours || [], sunrise, sunset);

  // Header row
  var head = document.createElement("div");
  head.className = "hourly-header";
  head.innerHTML =
    '<div class="hcell">Time</div>' +
    '<div class="hcell">Temp</div>' +
    '<div class="hcell"></div>' +
    '<div class="hcell">Wind</div>' +
    '<div class="hcell">Waves</div>' +
    '<div class="hcell" style="text-align:right;">Score</div>';
  hoursEl.appendChild(head);

  list.forEach(function (h) {
    var item = document.createElement("div");
    item.className = "hourly-item";

    var icon = conditionToIcon(h.condition);
    var score = (h.score ?? 0);

    var windMain = (h.wind_kts ?? 0) + " kts " + (h.wind_dir || "-");
    var windSub = (h.gust_kts != null && h.gust_kts > 0) ? ("G " + h.gust_kts) : "";

    var waveMain = (h.wave_m ?? 0) + " m";
    var waveSub = (h.wave_period_s != null && h.wave_period_s > 0) ? (h.wave_period_s + " s") : "";

    var row = document.createElement("div");
    row.className = "hourly-row";
    row.innerHTML =
      '<div class="hourly-time"><b>' + h.time + "</b></div>" +
      '<div class="hourly-temp muted">' + (h.temp_c ?? "—") + "\u00b0</div>" +
      '<div class="hourly-cond" title="' + (h.condition || "") + '">' + icon + "</div>" +

      '<div class="hourly-wind">' +
      '  <div class="main">' + windMain + "</div>" +
      '  <div class="sub muted small">' + windSub + "</div>" +
      "</div>" +

      '<div class="hourly-waves">' +
      '  <div class="main">' + waveMain + "</div>" +
      '  <div class="sub muted small">' + waveSub + "</div>" +
      "</div>" +

      '<div class="hourly-score" style="text-align:right;">' +
      '  <span class="' + pillClass(score) + '">' + score + "</span>" +
      "</div>";

    item.appendChild(row);

    var extrasBits = [];
    if (h.precip_mm != null && h.precip_mm > 0) extrasBits.push("Precip " + h.precip_mm + " mm");
    if (h.visibility_km != null) extrasBits.push("Vis " + h.visibility_km + " km");

    if (extrasBits.length > 0) {
      var extras = document.createElement("div");
      extras.className = "hourly-extras muted small";
      extras.textContent = extrasBits.join(" \u00b7 ");
      item.appendChild(extras);
    }

    hoursEl.appendChild(item);
  });
}

/* ----------------------------
   Recommended windows rendering (unchanged)
---------------------------- */

function formatWindowRange(start, end) {
  return String(start || "") + "\u2013" + String(end || "");
}

function renderRecommendedWindows(windowsEl, recommended) {
  windowsEl.innerHTML = "";

  function renderRow(w, pillTone) {
    var row = document.createElement("div");
    row.className = "row";
    row.innerHTML =
      '<div>' +
        '<span class="pill ' + pillTone + '">' +
          formatWindowRange(w.start, w.end) +
        '</span>' +
      '</div>' +
      '<div class="muted small">' +
        (w.score != null ? (w.score + "/100") : "") +
      '</div>';
    windowsEl.appendChild(row);
  }

  function section(title, list, pillTone) {
    if (!list || !list.length) return;

    var head = document.createElement("div");
    head.className = "muted small";
    head.style.marginBottom = "6px";
    head.style.fontWeight = "800";
    head.textContent = title;
    windowsEl.appendChild(head);

    list.forEach(function (w) {
      renderRow(w, pillTone);
    });

    var spacer = document.createElement("div");
    spacer.className = "spacer";
    windowsEl.appendChild(spacer);
  }

  if (Array.isArray(recommended)) {
    if (!recommended.length) {
      windowsEl.innerHTML = '<div class="muted small">No recommended window</div>';
      return;
    }
    recommended.forEach(function (w) {
      renderRow(w, pillClass(w.score));
    });
    return;
  }

  var byTier = (recommended && typeof recommended === "object") ? recommended : null;
  var excellent = byTier && Array.isArray(byTier.excellent) ? byTier.excellent : [];
  var good = byTier && Array.isArray(byTier.good) ? byTier.good : [];
  var ok = byTier && Array.isArray(byTier.ok) ? byTier.ok : [];

  if (!excellent.length && !good.length && !ok.length) {
    windowsEl.innerHTML = '<div class="muted small">No recommended window</div>';
    return;
  }

  section("Excellent", excellent, "excellent");
  section("Good", good, "good");
  section("OK", ok, "ok");

  if (windowsEl.lastChild && windowsEl.lastChild.classList && windowsEl.lastChild.classList.contains("spacer")) {
    windowsEl.removeChild(windowsEl.lastChild);
  }
}

/* ----------------------------
   Summary rerender
---------------------------- */

function renderSummary(score, summaryData) {
  var summary = document.getElementById("summary");
  if (!summary) return;

  var temp = (summaryData.temp_c ?? "—");
  var cond = (summaryData.condition ?? "—");
  var s = (score ?? 0);

  summary.innerHTML =
    "" +
    '<div class="row">' +
    "  <div>" +
    '    <div class="big">' + temp + "&deg;C</div>" +
    '    <div class="muted">' + cond + "</div>" +
    "  </div>" +
    '  <div style="text-align:right;">' +
    '    <div class="muted small">Boating Score</div>' +
    '    <div class="' + pillClass(s) + '" style="font-size:16px;">' +
    s +
    "</div>" +
    "  </div>" +
    "</div>";
}

/* ----------------------------
   Main render
---------------------------- */

function renderDay(data, loc) {
  var locName = loc && loc.name ? loc.name : (data.location || "South West UK");

  var locEl = document.getElementById("location");
  if (locEl) locEl.textContent = locName;

  var titleEl = document.getElementById("title");
  if (titleEl) titleEl.textContent = data.title || data.date || "";

  var summaryData = data.summary || {};
  var tilesData = data.tiles || {};

  // initial summary (will be overwritten by rerenderForMode)
  renderSummary(summaryData.score ?? 0, summaryData);

  var tiles = document.getElementById("tiles");
  if (tiles) {
    var windKts = (tilesData.wind_kts ?? 0);
    var gustKts = (tilesData.gust_kts ?? windKts);
    var windDir = (tilesData.wind_dir ?? "—");

    var waveM = (tilesData.wave_m ?? 0);
    var periodS = (tilesData.period_s ?? "—");

    var visKm = (tilesData.visibility_km ?? "—");
    var precipMm = (tilesData.precip_mm ?? "—");

    var sunrise = (tilesData.sunrise ?? "—");
    var sunset = (tilesData.sunset ?? "—");

    tiles.innerHTML =
      "" +
      tileHtml("Wind", windKts + " kts", "Gusts " + gustKts + " kts " + windDir) +
      tileHtml("Waves", waveM + " m", "Period " + periodS + " s") +
      tileHtml("Visibility", visKm + " km", "Precip " + precipMm + " mm") +
      tileHtml("Daylight", "Sunrise " + sunrise, "Sunset " + sunset);
  }

  var tides = document.getElementById("tides");
  if (tides) {
    tides.innerHTML = "";
    (data.tides || []).forEach(function (t) {
      var height =
        t.height_m != null && isFinite(Number(t.height_m))
          ? (String(Number(t.height_m).toFixed(1)).replace(/\.0$/, "") + " m")
          : "";

      var row = document.createElement("div");
      row.className = "row";
      row.innerHTML =
        "<div><b>" +
        t.type +
        ' Tide</b> <span class="muted small">' +
        t.time +
        "</span></div>" +
        '<div class="muted small">' +
        height +
        "</div>";
      tides.appendChild(row);
    });
  }

  var windowsEl = document.getElementById("windows");
  var hoursEl = document.getElementById("hours");

  var rawSunriseHHMM = tilesData.sunrise;
  var rawSunsetHHMM = tilesData.sunset;

  function rerenderForMode(mode) {
    // 1) Hourly list
    if (hoursEl) {
      renderHourlyTable(hoursEl, mode, data.hours || [], rawSunriseHHMM, rawSunsetHHMM);
    }

    // 2) Daily boating score (recomputed)
    var dailyScoreMode = (mode === "daylight") ? "daylight" : "allhours";
    var adj = adjustedSunWindowForMode(mode, rawSunriseHHMM, rawSunsetHHMM);

    // scoreDayFromHourRows now supports hour rows with `time: "HH:MM"` directly (no adapter needed).
    var dayScore = scoreDayFromHourRows({
      dailyScoreMode: dailyScoreMode,
      hourRows: data.hours || [],
      sunriseHHMM: adj.sunriseHHMM,
      sunsetHHMM: adj.sunsetHHMM,
      fallbackScore: summaryData.score ?? 0,
      environment: getScoreEnvironment(),
    });

    renderSummary(dayScore, summaryData);

    // 3) Recommended windows tier list (recomputed)
    var windowsByTier = windowsByTierFromHourRows({
      hourRows: data.hours || [],
      minHours: getMinRecommendedWindowHours(),
      dailyScoreMode: dailyScoreMode,
      sunriseHHMM: adj.sunriseHHMM,
      sunsetHHMM: adj.sunsetHHMM,
    });

    if (windowsEl) {
      renderRecommendedWindows(windowsEl, windowsByTier);
    }
  }

  // Initial mode comes from Settings (NOT any prior day view toggle)
  var initialMode = getSettingsDailyMode();
  rerenderForMode(initialMode);

  // Toggle is local-only; does not affect settings
  setupToggle(initialMode, function (mode) {
    rerenderForMode(mode);
  });
}

async function main() {
  var loc = requireLocationOrRedirect();
  if (!loc) return;

  var dayIso = getDateParam();
  if (!dayIso) {
    var titleEl = document.getElementById("title");
    if (titleEl) titleEl.textContent = "Missing date parameter";
    return;
  }

  try {
    var data = await getDayData(loc.slug, dayIso);
    renderDay(data, loc);
  } catch (e) {
    var titleEl2 = document.getElementById("title");
    if (titleEl2) titleEl2.textContent = "Error: " + e.message;
  }
}

main();

