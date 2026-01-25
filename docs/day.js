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
   Wind arrow helpers (matches app.js behaviour)
---------------------------- */

function compassToDeg(compass) {
  var c = String(compass || "").toUpperCase().trim();
  var map = {
    N: 0, NNE: 22.5, NE: 45, ENE: 67.5,
    E: 90, ESE: 112.5, SE: 135, SSE: 157.5,
    S: 180, SSW: 202.5, SW: 225, WSW: 247.5,
    W: 270, WNW: 292.5, NW: 315, NNW: 337.5,
  };
  return (map[c] != null) ? map[c] : null;
}

// Open-Meteo wind direction is "coming from".
// Arrow should show where it is travelling (to) => +180.
function windArrowDegFromCompass(compass) {
  var from = compassToDeg(compass);
  if (from == null) return null;
  return (from + 180) % 360;
}

function svgArrowRotated(compassDeg) {
  if (compassDeg == null || !isFinite(Number(compassDeg))) return "";

  // Convert compass degrees (0=N) to CSS rotation (0=E)
  var cssDeg = (Number(compassDeg) - 90 + 360) % 360;

  return (
    '<span style="display:inline-flex; align-items:center; margin:0 6px; ' +
      'transform:rotate(' + cssDeg + 'deg); transform-origin:50% 50%;">' +
      '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false">' +
        '<path d="M4 12h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
        '<path d="M14 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
      "</svg>" +
    "</span>"
  );
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
        "</span>" +
      "</div>" +
      '<div class="muted small">' +
        (w.score != null ? (w.score + "/100") : "") +
      "</div>";
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
   Summary card — badge on right, conditions on left
   - Computes MAX wind/gust/waves/period/temp within the LOCAL toggle window
   - Displays temp as: 10°C (feels like 7°C) + weather icon
   - Visibility is MIN visibility within the toggle window
   - Summary CARD is toned based on boating score (toggle-aware)
---------------------------- */

/* SVG icons (copied from app.js, minimal set) */
function svgIconWrap(svg) {
  return '<span style="display:inline-flex; align-items:center; line-height:1; margin-right:6px;">' + svg + "</span>";
}

function svgVisibility() {
  return svgIconWrap(
    '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">' +
      '<path d="M1.5 12s4-6 10.5-6 10.5 6 10.5 6-4 6-10.5 6-10.5-6-10.5-6z" fill="none" stroke="currentColor" stroke-width="2"/>' +
      '<circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2"/>' +
    "</svg>"
  );
}

function svgSunrise() {
  return svgIconWrap(
    '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">' +
      '<path d="M6 16a6 6 0 0 1 12 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
      '<path d="M12 3v6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
      '<path d="M9 6l3-3 3 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<path d="M4 19h16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
    "</svg>"
  );
}

function svgSunset() {
  return svgIconWrap(
    '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">' +
      '<path d="M6 16a6 6 0 0 1 12 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
      '<path d="M12 9v6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
      '<path d="M9 12l3 3 3-3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<path d="M4 19h16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
    "</svg>"
  );
}

function svgWind() {
  return svgIconWrap(
    '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">' +
      '<path d="M3 8h10a2 2 0 1 0-2-2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
      '<path d="M3 12h14a2 2 0 1 1-2 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
      '<path d="M3 16h7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
    "</svg>"
  );
}

function svgWave() {
  return svgIconWrap(
    '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">' +
      '<path d="M2 14c2-2 4-2 6 0s4 2 6 0 4-2 6 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
    "</svg>"
  );
}

function svgThermometer() {
  return svgIconWrap(
    '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">' +
      '<path d="M10 14.5V5a2 2 0 1 1 4 0v9.5a4 4 0 1 1-4 0z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<path d="M12 17a1.5 1.5 0 1 0 0 .01" fill="currentColor"/>' +
    "</svg>"
  );
}

function svgWeatherFromText(conditionText) {
  var c = String(conditionText || "").toLowerCase();

  if (c.includes("clear")) {
    return svgIconWrap(
      '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">' +
        '<circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2"/>' +
        '<path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M19.8 4.2l-2.1 2.1M6.3 17.7l-2.1 2.1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
      "</svg>"
    );
  }

  if (c.includes("fog")) {
    return svgIconWrap(
      '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">' +
        '<path d="M4 10h16M6 14h14M5 18h16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
      "</svg>"
    );
  }

  if (c.includes("thunder")) {
    return svgIconWrap(
      '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">' +
        '<path d="M6 14h11a4 4 0 0 0 0-8 5 5 0 0 0-9-2" fill="none" stroke="currentColor" stroke-width="2"/>' +
        '<path d="M12 12l-3 6h3l-1 4 5-8h-3l1-2z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>' +
      "</svg>"
    );
  }

  if (c.includes("snow")) {
    return svgIconWrap(
      '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">' +
        '<path d="M6 14h11a4 4 0 0 0 0-8 5 5 0 0 0-9-2" fill="none" stroke="currentColor" stroke-width="2"/>' +
        '<path d="M9 18h0M12 18h0M15 18h0" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>' +
      "</svg>"
    );
  }

  if (c.includes("showers") || c.includes("drizzle") || c.includes("rain")) {
    return svgIconWrap(
      '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">' +
        '<path d="M6 14h11a4 4 0 0 0 0-8 5 5 0 0 0-9-2" fill="none" stroke="currentColor" stroke-width="2"/>' +
        '<path d="M8 17v3M12 17v3M16 17v3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
      "</svg>"
    );
  }

  return svgIconWrap(
    '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">' +
      '<path d="M6 16h12a4 4 0 0 0 0-8 5 5 0 0 0-9-2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
    "</svg>"
  );
}

function scoreToWord(score) {
  var s = Number(score);
  if (!isFinite(s)) return "-";
  if (s >= 90) return "EXCELLENT";
  if (s >= 60) return "GOOD";
  if (s >= 40) return "OK";
  if (s >= 20) return "POOR";
  return "AVOID";
}

function toneClassForScore(score) {
  var s = Number(score);
  if (!isFinite(s)) return "";
  if (s >= 90) return "tone-excellent";
  if (s >= 60) return "tone-good";
  if (s >= 40) return "tone-ok";
  if (s >= 20) return "tone-poor";
  return "tone-avoid";
}

function summarizeForSummaryCardFromHours(filteredHours, summaryDataFallback) {
  var list = Array.isArray(filteredHours) ? filteredHours : [];

  var maxWind = null;
  var windDirAtMax = null;

  var maxGust = null;

  var maxWave = null;
  var periodAtMaxWave = null;

  var minVisibility = null;

  var tempAtMaxTemp = null;
  var feelsAtMaxTemp = null;

  for (var i = 0; i < list.length; i++) {
    var h = list[i] || {};

    var w = Number(h.wind_kts);
    if (isFinite(w)) {
      if (maxWind == null || w > maxWind) {
        maxWind = w;
        windDirAtMax = h.wind_dir || windDirAtMax;
      }
    }

    var g = Number(h.gust_kts);
    if (isFinite(g)) {
      if (maxGust == null || g > maxGust) maxGust = g;
    }

    var wave = Number(h.wave_m);
    if (isFinite(wave)) {
      if (maxWave == null || wave > maxWave) {
        maxWave = wave;
        var p = Number(h.wave_period_s);
        periodAtMaxWave = isFinite(p) ? p : null;
      }
    }

    var t = Number(h.temp_c);
    if (isFinite(t)) {
      if (tempAtMaxTemp == null || t > tempAtMaxTemp) {
        tempAtMaxTemp = t;
        var f = Number(h.feels_like_c);
        feelsAtMaxTemp = isFinite(f) ? f : null;
      }
    }

    var v = Number(h.visibility_km);
    if (isFinite(v)) {
      if (minVisibility == null || v < minVisibility) minVisibility = v;
    }
  }

  var fallback = summaryDataFallback || {};

  var out = {
    wind_kts_max: maxWind,
    wind_dir_at_max: windDirAtMax,
    gust_kts_max: maxGust,

    wave_m_max: maxWave,
    wave_period_s_at_max: periodAtMaxWave,

    visibility_km_min: minVisibility,

    temp_c: tempAtMaxTemp,
    feels_like_c: feelsAtMaxTemp,

    condition: (fallback.condition ?? "—"),
  };

  if (out.temp_c == null && fallback.temp_c != null) out.temp_c = fallback.temp_c;
  if (out.feels_like_c == null && fallback.feels_like_c != null) out.feels_like_c = fallback.feels_like_c;

  if (out.visibility_km_min == null && fallback.visibility_km != null) {
    var fv = Number(fallback.visibility_km);
    out.visibility_km_min = isFinite(fv) ? fv : out.visibility_km_min;
  }

  return out;
}

function applyToneToSummaryCard(summaryEl, toneClass) {
  if (!summaryEl) return;
  summaryEl.classList.remove("tone-excellent", "tone-good", "tone-ok", "tone-poor", "tone-avoid");
  if (toneClass) summaryEl.classList.add(toneClass);
}

function renderSummaryCard(dayScore, summaryData, mode, filteredHours) {
  var summary = document.getElementById("summary");
  if (!summary) return;

  var s = Number(dayScore);
  if (!isFinite(s)) s = 0;

  var ratingWord = scoreToWord(s);
  var toneClass = toneClassForScore(s);

  applyToneToSummaryCard(summary, toneClass);

  var snap = summarizeForSummaryCardFromHours(filteredHours, summaryData);

  var windVal =
    (snap.wind_kts_max == null ? "—" : snap.wind_kts_max) +
    " kts" +
    (snap.wind_dir_at_max ? " " + snap.wind_dir_at_max : "");
  var windArrowDeg = windArrowDegFromCompass(snap.wind_dir_at_max);

  var gustVal = (snap.gust_kts_max != null ? ("Gusts " + snap.gust_kts_max + " kts") : "");

  var waveVal = (snap.wave_m_max == null ? "—" : snap.wave_m_max) + " m";
  var periodVal = (snap.wave_period_s_at_max != null ? ("Period " + snap.wave_period_s_at_max + " s") : "");

  var tempVal = (snap.temp_c == null ? "—" : snap.temp_c) + "°C";
  var feelsVal = (snap.feels_like_c != null ? ("(feels like " + snap.feels_like_c + "°C)") : "");

  var visVal =
    snap.visibility_km_min != null
      ? snap.visibility_km_min + " km"
      : "—";

  summary.innerHTML =
    "" +
    '<div class="today-title">Day Summary</div>' +

    '<div style="display:flex; justify-content:space-between; gap:14px; align-items:stretch; margin-top:10px;">' +

    '  <div style="min-width:0;">' +

    // Temperature first, nowrap, smaller feels-like so icon stays on same line
    '    <div class="small muted" style="margin-top:2px; display:flex; align-items:center; gap:8px; flex-wrap:nowrap;">' +
           svgThermometer() +
    '      <span style="display:inline-flex; align-items:baseline; gap:8px; min-width:0; white-space:nowrap;">' +
    '        <span style="font-weight:800; color:rgba(255,255,255,0.92);">' + tempVal + "</span>" +
             (feelsVal ? ('<span class="muted" style="font-size:12px; white-space:nowrap;">' + feelsVal + "</span>") : "") +
    "      </span>" +
    '      <span style="display:inline-flex; align-items:center; opacity:0.95; margin-left:6px;">' +
             svgWeatherFromText(snap.condition) +
    "      </span>" +
    "    </div>" +

    // Wind (gusts beneath) + arrow after direction
    '    <div class="small muted" style="margin-top:10px; display:flex; align-items:center; flex-wrap:wrap;">' +
           svgWind() +
           'Max Wind&nbsp;&nbsp;<span style="font-weight:800; color:rgba(255,255,255,0.92);">' + windVal + "</span>" +
           svgArrowRotated(windArrowDeg) +
    "    </div>" +
    (gustVal ? ('    <div class="muted small" style="margin-top:4px; margin-left:22px;">' + gustVal + "</div>") : "") +

    // Waves (period beneath)
    '    <div class="small muted" style="margin-top:10px;">' +
           svgWave() +
           'Max waves (at sea):&nbsp;&nbsp;<span style="font-weight:800; color:rgba(255,255,255,0.92);">' + waveVal + "</span>" +
    "    </div>" +
    (periodVal ? ('    <div class="muted small" style="margin-top:4px; margin-left:22px;">' + periodVal + "</div>") : "") +

    // Visibility (min in toggle window)
    '    <div class="small muted" style="margin-top:10px;">' +
           svgVisibility() +
           'Visibility&nbsp;&nbsp;<span style="font-weight:800; color:rgba(255,255,255,0.92);">' + visVal + "</span>" +
    "    </div>" +

    "  </div>" +

    // RIGHT: badge stack
    '  <div class="today-score-wrap" style="min-width:120px;">' +
    '    <div class="today-score-stack">' +
    '      <div class="today-score-label">Boating score</div>' +
    '      <div class="today-score-word">' + ratingWord + "</div>" +
    '      <div class="today-score-circle ' + toneClass + '">' +
    '        <div class="today-score-num">' + Math.round(s) + "</div>" +
    "      </div>" +
    "    </div>" +
    "  </div>" +

    "</div>";
}

function renderSunPill(mode, rawSunriseHHMM, rawSunsetHHMM) {
  var el = document.getElementById("sunPill");
  if (!el) return;

  var sr = rawSunriseHHMM || "—";
  var ss = rawSunsetHHMM || "—";

  // Requirement: no filter text / no "All hours" text in this box
  // Title styled like "Tides" (h2), sunrise/sunset centered
  el.innerHTML =
    "" +
    '<div>' +
    "  <h2>Daylight</h2>" +
    '  <div class="spacer"></div>' +
    '  <div class="small muted" style="display:flex; justify-content:center; gap:22px; align-items:center; flex-wrap:wrap;">' +
    '    <span style="display:inline-flex; align-items:center; gap:6px;">' +
           svgSunrise() +
    '      <span style="font-weight:800; color:rgba(255,255,255,0.92);">Sunrise ' + sr + "</span>" +
    "    </span>" +
    '    <span style="display:inline-flex; align-items:center; gap:6px;">' +
           svgSunset() +
    '      <span style="font-weight:800; color:rgba(255,255,255,0.92);">Sunset ' + ss + "</span>" +
    "    </span>" +
    "  </div>" +
    "</div>";
}

/* ----------------------------
   Legacy summary renderer (kept to avoid removing functionality)
   (No longer used once rerenderForMode runs, but retained.)
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
    // 0) Filtered hours (single source of truth for mode-specific summary calculations)
    var filteredHours = filterHours(mode, data.hours || [], rawSunriseHHMM, rawSunsetHHMM);

    // Daylight card (no mode/filter text in UI)
    renderSunPill(mode, rawSunriseHHMM, rawSunsetHHMM);

    // 1) Hourly list (still uses sunrise/sunset because it handles filtering internally)
    if (hoursEl) {
      renderHourlyTable(hoursEl, mode, data.hours || [], rawSunriseHHMM, rawSunsetHHMM);
    }

    // 2) Daily boating score (recomputed; must be toggle-aware)
    var dailyScoreMode = (mode === "daylight") ? "daylight" : "allhours";
    var adj = adjustedSunWindowForMode(mode, rawSunriseHHMM, rawSunsetHHMM);

    var dayScore = scoreDayFromHourRows({
      dailyScoreMode: dailyScoreMode,
      hourRows: data.hours || [],
      sunriseHHMM: adj.sunriseHHMM,
      sunsetHHMM: adj.sunsetHHMM,
      fallbackScore: summaryData.score ?? 0,
      environment: getScoreEnvironment(),
    });

    // NEW summary card (badge + conditions) — card tone based on the computed score
    renderSummaryCard(dayScore, summaryData, mode, filteredHours);

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
