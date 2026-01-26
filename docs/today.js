"use strict";

import { pillClass, requireLocationOrRedirect } from "./common/core.js";
import { getDayData, getBundle } from "./data.js";


// Reuse existing infra
import { scoreDayFromHourRows } from "./common/score.js";
import { windowsByTierFromHourRows } from "./common/window.js";

// Settings storage keys (shared behaviour)
const SETTINGS_DAILY_SCORE_MODE_KEY = "skippy.score.dailyHoursMode"; // "all" | "daylight"
const MIN_RECOMMENDED_WINDOW_HOURS_KEY = "skippy.recommended.minHours"; // int 1..8 (default 2)

// Environment (shared with Settings)
const SCORE_ENVIRONMENT_KEY = "skippy.score.environment"; // "coastal" | "estuary"

// Mooring access - no access buffer hours around tides (0..3 in 0.5 steps)
const MOORING_HIGH_NO_ACCESS_HOURS_KEY = "skippy.mooring.noAccess.highHours";
const MOORING_LOW_NO_ACCESS_HOURS_KEY = "skippy.mooring.noAccess.lowHours";


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

function clampMooringHours(v) {
  // Allowed: 0, 0.5, 1, 1.5, 2, 2.5, 3
  var x = Number(v);
  if (!isFinite(x)) return 0;
  var snapped = Math.round(x * 2) / 2;
  if (snapped < 0) snapped = 0;
  if (snapped > 3) snapped = 3;
  return snapped;
}

function getMooringHighNoAccessHours() {
  var v = "";
  try {
    v = localStorage.getItem(MOORING_HIGH_NO_ACCESS_HOURS_KEY) || "";
  } catch (e) {
    v = "";
  }
  if (v === "") return 0;
  return clampMooringHours(v);
}

function getMooringLowNoAccessHours() {
  var v = "";
  try {
    v = localStorage.getItem(MOORING_LOW_NO_ACCESS_HOURS_KEY) || "";
  } catch (e) {
    v = "";
  }
  if (v === "") return 0;
  return clampMooringHours(v);
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

  list.forEach(function (h) {
    var item = document.createElement("div");
    item.className = "hourly-item";

    var score = (h.score ?? 0);

    // Values
    var wind = (h.wind_kts != null ? h.wind_kts : "—");
    var gust = (h.gust_kts != null ? h.gust_kts : "—");

    var wave = (h.wave_m != null ? h.wave_m : "—");
    var period = (h.wave_period_s != null ? h.wave_period_s : "—");

    var vis = (h.visibility_km != null ? h.visibility_km : "—");

    var temp = (h.temp_c != null ? h.temp_c : "—");
    var feels = (h.feels_like_c != null ? h.feels_like_c : "—");

    var windArrowDeg = windArrowDegFromCompass(h.wind_dir || "");

    var row = document.createElement("div");
    row.className = "hourly-row";
    
    row.innerHTML =
      // LEFT: time + weather stacked
      '<div class="hourly-left">' +
      '  <div class="hourly-time"><b>' + h.time + "</b></div>" +
      '  <div class="hourly-wx">' + svgWeatherFromText(h.condition || "") + "</div>" +
      "</div>" +
    
      // MIDDLE: line 1 wind/wave/vis, line 2 temp/feels
      '<div class="hourly-mid">' +
    
      '  <div class="hourly-line1">' +
      '    <div class="hourly-metric">' +
             svgWind() +
      '      <span class="val">' + wind + ' kts</span> ' +
      '      <span class="bracket">(' + gust + ')</span>' +
             (windArrowDeg != null ? svgArrowRotated(windArrowDeg) : "") +
      "    </div>" +
    
      '    <div class="hourly-metric">' +
             svgWave() +
      '      <span class="val">' + wave + ' m</span> ' +
      '      <span class="bracket">(' + period + ' s)</span>' +
      "    </div>" +
    
      '    <div class="hourly-metric">' +
             svgVisibility() +
      '      <span class="val">' + vis + " km</span>" +
      "    </div>" +
      "  </div>" +
    
      '  <div class="hourly-line2">' +
      '    <div class="hourly-metric">' +
             svgThermometer() +
      '      <span class="val">' + temp + '°C</span> ' +
      '      <span class="bracket">(' + feels + '°C)</span>' +
      "    </div>" +
      "  </div>" +
    
      "</div>" +
    
      // RIGHT: score badge
      '<div class="hourly-score">' +
      '  <span class="' + pillClass(score) + ' hourly-score-badge">' + score + "</span>" +
      "</div>";

        // Make clickable for overlay (Today page feature)
    row.style.cursor = "pointer";
    row.addEventListener("click", function () {
      if (typeof openHourlyOverlay === "function") {
        openHourlyOverlay(h);
      }
    });

    item.appendChild(row);
    hoursEl.appendChild(item);
  });
}

function minToHHMMWrapped(mins) {
  // Accepts mins that may be <0 or >1440 and wraps into 0..1439.
  var m = Math.round(Number(mins));
  if (!isFinite(m)) return null;
  m = ((m % 1440) + 1440) % 1440;
  var hh = Math.floor(m / 60);
  var mm = m % 60;
  return String(hh).padStart(2, "0") + ":" + String(mm).padStart(2, "0");
}

function formatNoAccessRangeCrossMidnight(centerMin, bufMin) {
  var start = Number(centerMin) - Number(bufMin);
  var end = Number(centerMin) + Number(bufMin);
  if (!isFinite(start) || !isFinite(end) || end <= start) return "";

  var startHHMM = minToHHMMWrapped(start);
  var endHHMM = minToHHMMWrapped(end);
  if (!startHHMM || !endHHMM) return "";

  return startHHMM + "\u2013" + endHHMM;
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
   Mooring no-access windows (Settings + tides)
---------------------------- */

function minToHHMM24(mins) {
  var m = Number(mins);
  if (!isFinite(m)) return null;
  if (m < 0) m = 0;
  if (m > 1440) m = 1440;
  if (m === 1440) return "24:00";
  var mm = m % 60;
  var hh = Math.floor(m / 60);
  return String(hh).padStart(2, "0") + ":" + String(mm).padStart(2, "0");
}

function normalizeTideType(t) {
  var s = String(t || "").toLowerCase();
  if (s.indexOf("high") >= 0) return "High";
  if (s.indexOf("low") >= 0) return "Low";
  return "";
}

function computeMooringNoAccessWindows(tides, highHours, lowHours) {
  var hiMin = Math.round(Number(highHours) * 60);
  var loMin = Math.round(Number(lowHours) * 60);
  if (!isFinite(hiMin)) hiMin = 0;
  if (!isFinite(loMin)) loMin = 0;

  var intervals = [];
  (tides || []).forEach(function (t) {
    var kind = normalizeTideType(t && t.type);
    if (!kind) return;
    var buf = kind === "High" ? hiMin : loMin;
    if (!buf || buf <= 0) return;

    var center = parseHHMMToMin(t && t.time);
    if (center == null) return;

    var start = Math.max(0, center - buf);
    var end = Math.min(1440, center + buf);
    if (end <= start) return;

    intervals.push({ start: start, end: end, labels: { [kind]: true } });
  });

  if (!intervals.length) return [];

  intervals.sort(function (a, b) {
    if (a.start !== b.start) return a.start - b.start;
    return a.end - b.end;
  });

  var merged = [];
  var cur = intervals[0];

  for (var i = 1; i < intervals.length; i++) {
    var nxt = intervals[i];
    if (nxt.start <= cur.end) {
      cur.end = Math.max(cur.end, nxt.end);
      for (var k in (nxt.labels || {})) cur.labels[k] = true;
    } else {
      merged.push(cur);
      cur = nxt;
    }
  }
  merged.push(cur);

  return merged
    .map(function (w) {
      var labels = Object.keys(w.labels || {});
      labels.sort();
      return {
        start: minToHHMM24(w.start),
        end: minToHHMM24(w.end),
        label: labels.join("/") || "",
      };
    })
    .filter(function (w) {
      return w.start && w.end;
    });
}

function renderMooringNoAccessWindows(el, tides) {
  if (!el) return;
  el.innerHTML = "";

  var highHours = getMooringHighNoAccessHours();
  var lowHours = getMooringLowNoAccessHours();

  var windows = computeMooringNoAccessWindows(tides || [], highHours, lowHours);

  if (!windows.length) {
    if ((highHours || 0) <= 0 && (lowHours || 0) <= 0) {
      el.innerHTML = '<div class="muted small">No mooring no-access window (set buffers in Settings).</div>';
    } else {
      el.innerHTML = '<div class="muted small">No mooring no-access window for today.</div>';
    }
    return;
  }

  windows.forEach(function (w) {
    var row = document.createElement("div");
    row.className = "row";
    row.innerHTML =
      '<div>' +
        '<span class="pill poor">' +
          formatWindowRange(w.start, w.end) +
        '</span>' +
      '</div>' +
      '<div class="muted small">' +
        (w.label ? ("(" + w.label + ")") : "") +
      '</div>';
    el.appendChild(row);
  });
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

function svgWeatherTitleFromText(conditionText) {
  var c = String(conditionText || "").toLowerCase();

  function wrap(svg) {
    return (
      '<span style="display:inline-flex; align-items:center; margin-left:10px; opacity:0.95;">' +
      svg +
      "</span>"
    );
  }

  // Same icons as svgWeatherFromText, just bigger (title size)
  if (c.includes("clear")) {
    return wrap(
      '<svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" focusable="false">' +
        '<circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2"/>' +
        '<path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M19.8 4.2l-2.1 2.1M6.3 17.7l-2.1 2.1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
      "</svg>"
    );
  }

  if (c.includes("fog")) {
    return wrap(
      '<svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" focusable="false">' +
        '<path d="M4 10h16M6 14h14M5 18h16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
      "</svg>"
    );
  }

  if (c.includes("thunder")) {
    return wrap(
      '<svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" focusable="false">' +
        '<path d="M6 14h11a4 4 0 0 0 0-8 5 5 0 0 0-9-2" fill="none" stroke="currentColor" stroke-width="2"/>' +
        '<path d="M12 12l-3 6h3l-1 4 5-8h-3l1-2z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>' +
      "</svg>"
    );
  }

  if (c.includes("snow")) {
    return wrap(
      '<svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" focusable="false">' +
        '<path d="M6 14h11a4 4 0 0 0 0-8 5 5 0 0 0-9-2" fill="none" stroke="currentColor" stroke-width="2"/>' +
        '<path d="M9 18h0M12 18h0M15 18h0" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>' +
      "</svg>"
    );
  }

  if (c.includes("showers") || c.includes("drizzle") || c.includes("rain")) {
    return wrap(
      '<svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" focusable="false">' +
        '<path d="M6 14h11a4 4 0 0 0 0-8 5 5 0 0 0-9-2" fill="none" stroke="currentColor" stroke-width="2"/>' +
        '<path d="M8 17v3M12 17v3M16 17v3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
      "</svg>"
    );
  }

  return wrap(
    '<svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" focusable="false">' +
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
    '<div class="today-title" style="display:flex; align-items:center; justify-content:space-between; gap:12px;">' +
    '  <span>Day Summary</span>' +
    '  ' + svgWeatherTitleFromText(snap.condition) +
    "</div>" +
  
    '<div style="display:flex; justify-content:space-between; gap:14px; align-items:stretch; margin-top:10px;">' +
  
    '  <div style="min-width:0;">' +


    // Temperature first, nowrap, smaller feels-like so icon stays on same line
    '    <div class="small muted" style="margin-top:2px; display:flex; align-items:center; gap:8px; flex-wrap:nowrap;">' +
           svgThermometer() +
    '      <span style="display:inline-flex; align-items:baseline; gap:8px; min-width:0; white-space:nowrap;">' +
    '        <span style="font-weight:800; color:rgba(255,255,255,0.92);">' + tempVal + "</span>" +
             (feelsVal ? ('<span class="muted" style="font-size:12px; white-space:nowrap;">' + feelsVal + "</span>") : "") +
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

function renderDay(data, loc, bundle) {

  var locName = loc && loc.name ? loc.name : (data.location || "South West UK");

  var locEl = document.getElementById("location");
  if (locEl) locEl.textContent = locName;

  var titleEl = document.getElementById("title");
  if (titleEl) titleEl.textContent = data.title || data.date || "";

  var summaryData = data.summary || {};
  var tilesData = data.tiles || {};

  // initial summary (will be overwritten by rerenderForMode)
  renderSummary(summaryData.score ?? 0, summaryData);

  // Mooring settings (hours)
  var highNoAccessHours = getMooringHighNoAccessHours();
  var lowNoAccessHours = getMooringLowNoAccessHours();
  var showNoAccessOnRight = (highNoAccessHours > 0) || (lowNoAccessHours > 0);
  // Show/hide the "No mooring access" header row in the Tides card
  var hdr = document.getElementById("noAccessHeaderRow");
  if (hdr) {
    hdr.style.display = showNoAccessOnRight ? "" : "none";
  }


  var tides = document.getElementById("tides");
  if (tides) {
    tides.innerHTML = "";

    (data.tides || []).forEach(function (t) {
      var height =
        t.height_m != null && isFinite(Number(t.height_m))
          ? (String(Number(t.height_m).toFixed(1)).replace(/\.0$/, "") + " m")
          : "";

      // Build left column (existing)
      var leftHtml =
        "<div><b>" +
        t.type +
        ' Tide</b> <span class="muted small">' +
        t.time +
        "</span></div>";

      // Build right column: default is just height (existing behaviour)
      var rightHtml = '<div class="muted small">' + height + "</div>";

      // If user has enabled buffers, replace right column with the no-access range (when applicable)
      if (showNoAccessOnRight) {
        var typeLower = String(t.type || "").toLowerCase();
        var isHigh = typeLower.indexOf("high") >= 0;
        var isLow = typeLower.indexOf("low") >= 0;
      
        var bufHours = isHigh ? highNoAccessHours : (isLow ? lowNoAccessHours : 0);
        var bufMin = Math.round(Number(bufHours) * 60);
      
        if (bufMin > 0) {
          var center = parseHHMMToMin(t.time);
          if (center != null) {
            // Midnight-aware (wraps over 00:00 rather than clamping to 00:00 / 24:00)
            var range = formatNoAccessRangeCrossMidnight(center, bufMin);
      
            if (range) {
              rightHtml =
                '<div class="muted small">' +
                  range +
                  " (" + (isHigh ? "High" : "Low") + ")" +
                "</div>";
            } else {
              // fallback if formatting fails: keep height
              rightHtml = '<div class="muted small">' + height + "</div>";
            }
          } else {
            // fallback if time parsing fails: keep height
            rightHtml = '<div class="muted small">' + height + "</div>";
          }
        } else {
          // buffer for this tide type is 0: keep height only
          rightHtml = '<div class="muted small">' + height + "</div>";
        }
      }


      var row = document.createElement("div");
      row.className = "row";
      row.innerHTML = leftHtml + rightHtml;
      tides.appendChild(row);
    });
  }

  // If both buffers are 0, ensure the standalone "noAccess" list (if present in HTML) shows nothing.
  // (This prevents any “set buffers in Settings” message if you don’t want it.)
  var noAccessEl = document.getElementById("noAccess");
  if (noAccessEl) {
    if (!showNoAccessOnRight) {
      noAccessEl.innerHTML = "";
    } else {
      // If you *still* want the separate list elsewhere, keep this line.
      // If you don't want it at all because we render on the right of tides, comment it out.
      // renderMooringNoAccessWindows(noAccessEl, data.tides || []);
      noAccessEl.innerHTML = "";
    }
  }

  var windowsEl = document.getElementById("windows");
  var hoursEl = document.getElementById("hours");

  var rawSunriseHHMM = tilesData.sunrise;
  var rawSunsetHHMM = tilesData.sunset;
  
    // --- Current conditions / warnings / overlay wiring ---
  var accessedAt = new Date(); // used for "Accessed HH:MM"
  setupTodayExtras({
    data: data,
    bundle: bundle,
    accessedAt: accessedAt,
    loc: loc,
    rawSunriseHHMM: rawSunriseHHMM,
    rawSunsetHHMM: rawSunsetHHMM,
    getMinHours: getMinRecommendedWindowHours,
  });


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


/* =========================================================
   TODAY EXTRAS: Current conditions, warnings, overlay
   ========================================================= */

var __todayExtrasState = {
  data: null,
  bundle: null,
  accessedAt: null,
  minHours: 2,
  // Derived:
  weatherTimeToIndex: null,
  marineTimeToIndex: null,
};

function setupTodayExtras(opts) {
  __todayExtrasState.data = opts.data || null;
  __todayExtrasState.bundle = opts.bundle || null;
  __todayExtrasState.accessedAt = opts.accessedAt || new Date();
  __todayExtrasState.minHours = (opts.getMinHours ? opts.getMinHours() : 2) || 2;

  // Build quick timestamp→index maps
  __todayExtrasState.weatherTimeToIndex = buildTimeIndexMap(getHourlyTimesSafe(__todayExtrasState.bundle, "weather"));
  __todayExtrasState.marineTimeToIndex = buildTimeIndexMap(getHourlyTimesSafe(__todayExtrasState.bundle, "marine"));

  // Render current conditions + warnings now
  renderCurrentConditionsCard();
  renderWarningsCard_WindowBased(); // Today page warnings: any point in next N hours

  // Expose overlay opener for renderHourlyTable
  window.openHourlyOverlay = function (hourRow) {
    openHourlyOverlayImpl(hourRow);
  };
}

/* ---------- Bundle helpers ---------- */

function getHourlyTimesSafe(bundle, which) {
  if (!bundle) return [];
  try {
    if (which === "weather") return (((bundle.weather || {}).hourly || {}).time) || [];
    if (which === "marine") return (((bundle.marine || {}).hourly || {}).time) || [];
  } catch (e) {}
  return [];
}

function getHourlyFieldSafe(bundle, which, key) {
  if (!bundle) return null;
  try {
    var hourly = (which === "weather")
      ? (((bundle.weather || {}).hourly) || {})
      : (((bundle.marine || {}).hourly) || {});
    return hourly[key] != null ? hourly[key] : null;
  } catch (e) {
    return null;
  }
}

function buildTimeIndexMap(times) {
  var map = Object.create(null);
  (times || []).forEach(function (t, i) {
    map[String(t)] = i;
  });
  return map;
}

// Expect ISO like "YYYY-MM-DDTHH:MM"
function isoToHHMM(iso) {
  var s = String(iso || "");
  var m = s.match(/T(\d\d):(\d\d)/);
  if (!m) return null;
  return m[1] + ":" + m[2];
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function formatAccessedHHMM(d) {
  var dt = d instanceof Date ? d : new Date();
  return pad2(dt.getHours()) + ":" + pad2(dt.getMinutes());
}

/* ---------- Now selection: FLOOR to hour ---------- */

function getNowFloorHHMM(accessedAt) {
  var d = accessedAt instanceof Date ? accessedAt : new Date();
  return pad2(d.getHours()) + ":00";
}

function getWeatherIndexForHHMM(hhmm) {
  // Find index for today's date at HH:MM inside weather time array
  var times = getHourlyTimesSafe(__todayExtrasState.bundle, "weather");
  if (!times || !times.length) return null;

  // We try to match by HH:MM first (same day page assumes today)
  // If multiple days exist, pick the first time that matches HH:MM and is on the same local date as accessedAt (best effort).
  var target = String(hhmm);
  for (var i = 0; i < times.length; i++) {
    var t = times[i];
    if (isoToHHMM(t) === target) return i;
  }
  return null;
}

function getWeatherIndexForHourRow(hourRow) {
  if (!hourRow || !hourRow.time) return null;
  return getWeatherIndexForHHMM(String(hourRow.time));
}

function clampWindowStartEnd(startIdx, count, maxLen) {
  var s = Number(startIdx);
  var n = Number(count);
  var L = Number(maxLen);

  if (!isFinite(s) || !isFinite(n) || !isFinite(L)) return { start: 0, end: 0 };
  if (L <= 0) return { start: 0, end: 0 };

  if (s < 0) s = 0;
  if (s >= L) s = L - 1;

  var end = s + Math.max(1, n);
  if (end > L) end = L;

  return { start: s, end: end };
}

/* ---------- Averaging helpers (numeric + circular mean) ---------- */

function avgNumeric(arr, start, end) {
  if (!arr || !arr.length) return null;
  var sum = 0;
  var n = 0;
  for (var i = start; i < end; i++) {
    var v = Number(arr[i]);
    if (isFinite(v)) { sum += v; n++; }
  }
  return n ? (sum / n) : null;
}

function degToRad(d) { return (Number(d) * Math.PI) / 180; }
function radToDeg(r) { return (Number(r) * 180) / Math.PI; }

function circularMeanDeg(arr, start, end) {
  if (!arr || !arr.length) return null;
  var x = 0, y = 0, n = 0;
  for (var i = start; i < end; i++) {
    var d = Number(arr[i]);
    if (!isFinite(d)) continue;
    var r = degToRad(d);
    x += Math.cos(r);
    y += Math.sin(r);
    n++;
  }
  if (!n) return null;
  var mean = radToDeg(Math.atan2(y / n, x / n));
  if (!isFinite(mean)) return null;
  mean = (mean + 360) % 360;
  return mean;
}

function circularDiffDeg(a, b) {
  var d1 = Number(a), d2 = Number(b);
  if (!isFinite(d1) || !isFinite(d2)) return null;
  var diff = Math.abs(((d1 - d2 + 540) % 360) - 180);
  return diff;
}

function isDirectionVariable(arr, start, end, meanDeg) {
  // Mark variable if at least 30% of samples differ from mean by > 60°
  if (!arr || meanDeg == null) return false;
  var n = 0, bad = 0;
  for (var i = start; i < end; i++) {
    var d = Number(arr[i]);
    if (!isFinite(d)) continue;
    var diff = circularDiffDeg(d, meanDeg);
    if (diff == null) continue;
    n++;
    if (diff > 60) bad++;
  }
  if (!n) return false;
  return (bad / n) >= 0.3;
}

/* ---------- Units + formatting ---------- */

function round1(x) {
  var n = Number(x);
  if (!isFinite(n)) return null;
  return Math.round(n * 10) / 10;
}

function round0(x) {
  var n = Number(x);
  if (!isFinite(n)) return null;
  return Math.round(n);
}

function mpsToKts(mps) {
  var n = Number(mps);
  if (!isFinite(n)) return null;
  return n * 1.9438444924406;
}

function degToCompass16(deg) {
  var d = Number(deg);
  if (!isFinite(d)) return null;
  var dirs = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
  var ix = Math.round(((d % 360) / 22.5)) % 16;
  return dirs[ix];
}

/* ---------- SVG "variable" icon (no emojis) ---------- */

function svgVariable() {
  // Small "swirl/refresh" style icon
  return (
    '<span style="display:inline-flex; align-items:center; margin-left:6px; opacity:0.9;">' +
      '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false">' +
        '<path d="M20 6v6h-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
        '<path d="M20 12a8 8 0 1 1-2.3-5.7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
      '</svg>' +
    '</span>'
  );
}

/* ---------- Condition summarising: mostly / worst ---------- */

function conditionMostlyWorst(weatherCodeArr, start, end) {
  // We rely on existing weather text in your hour rows if possible.
  // If not present, we keep it minimal.
  // Try: derive from __todayExtrasState.data.hours condition strings over same window.
  var hourRows = (__todayExtrasState.data && __todayExtrasState.data.hours) ? __todayExtrasState.data.hours : [];
  var freq = Object.create(null);
  var worst = null;

  for (var i = start; i < end; i++) {
    var hhmm = null;
    var isoTimes = getHourlyTimesSafe(__todayExtrasState.bundle, "weather");
    if (isoTimes && isoTimes[i]) hhmm = isoToHHMM(isoTimes[i]);

    var cond = null;
    if (hhmm && hourRows && hourRows.length) {
      for (var j = 0; j < hourRows.length; j++) {
        if (hourRows[j] && String(hourRows[j].time) === hhmm) {
          cond = hourRows[j].condition || null;
          break;
        }
      }
    }

    cond = cond || "—";
    freq[cond] = (freq[cond] || 0) + 1;

    // crude "worst": pick the least pleasant by keyword if score not available
    if (worst == null) worst = cond;
    else {
      if (isWorseCondition(cond, worst)) worst = cond;
    }
  }

  var mostly = "—";
  var bestCount = -1;
  Object.keys(freq).forEach(function (k) {
    if (freq[k] > bestCount) { bestCount = freq[k]; mostly = k; }
  });

  return { mostly: mostly, worst: worst || "—" };
}

function isWorseCondition(a, b) {
  // Order: thunder > snow > fog > rain/showers > drizzle > cloudy > clear
  var rank = function (t) {
    var s = String(t || "").toLowerCase();
    if (s.indexOf("thunder") >= 0) return 6;
    if (s.indexOf("snow") >= 0) return 5;
    if (s.indexOf("fog") >= 0) return 4;
    if (s.indexOf("shower") >= 0 || s.indexOf("rain") >= 0) return 3;
    if (s.indexOf("drizzle") >= 0) return 2;
    if (s.indexOf("cloud") >= 0) return 1;
    if (s.indexOf("clear") >= 0 || s.indexOf("mostly") >= 0) return 0;
    return 1;
  };
  return rank(a) > rank(b);
}

/* ---------- Rendering: Current conditions card ---------- */

function renderCurrentConditionsCard() {
  var metaEl = document.getElementById("currentConditionsMeta");
  var listEl = document.getElementById("currentConditions");
  if (!metaEl || !listEl) return;

  var minHours = __todayExtrasState.minHours || 2;
  var accessedHHMM = formatAccessedHHMM(__todayExtrasState.accessedAt);

  // Select "now": floor to hour
  var nowHHMM = getNowFloorHHMM(__todayExtrasState.accessedAt);
  var wIdx = getWeatherIndexForHHMM(nowHHMM);

  if (wIdx == null) {
    metaEl.textContent = "Accessed " + accessedHHMM;
    listEl.innerHTML = '<div class="muted small">Current conditions unavailable.</div>';
    return;
  }

  metaEl.textContent = "Accessed " + accessedHHMM + " \u2022 Values in brackets are averaged over the next " + minHours + " hours";

  var isoTimes = getHourlyTimesSafe(__todayExtrasState.bundle, "weather");
  var win = clampWindowStartEnd(wIdx, minHours, isoTimes.length);

  // Build data snapshot from bundle (weather + marine aligned by time)
  var snap = buildExtendedSnapshotFromBundle(wIdx, win.start, win.end);

  // Condition line: now + mostly/worst
  var condSummary = conditionMostlyWorst(getHourlyFieldSafe(__todayExtrasState.bundle, "weather", "weather_code"), win.start, win.end);

  var html = "";
  html += '<div class="row" style="align-items:flex-start;">' +
          '  <div class="muted small">Now</div>' +
          '  <div style="text-align:right;">' +
          '    <div style="font-weight:800;">' + escapeHtml(snap.conditionTextNow) + '</div>' +
          '    <div class="muted small">Next ' + minHours + ' hrs: mostly ' + escapeHtml(condSummary.mostly) + ' (worst: ' + escapeHtml(condSummary.worst) + ')</div>' +
          "  </div>" +
          "</div>";

  html += '<div class="spacer"></div>';

  html += renderExtendedGrid(snap, { showScore: false, showTimeLabel: false, showAverages: true });

  listEl.innerHTML = html;
}

/* ---------- Rendering: Warnings card (Today page = window-based) ---------- */

function renderWarningsCard_WindowBased() {
  var card = document.getElementById("warningsCard");
  var spacer = document.getElementById("warningsSpacer");
  var list = document.getElementById("warnings");
  if (!card || !list) return;

  var minHours = __todayExtrasState.minHours || 2;

  var nowHHMM = getNowFloorHHMM(__todayExtrasState.accessedAt);
  var wIdx = getWeatherIndexForHHMM(nowHHMM);
  if (wIdx == null) {
    card.style.display = "none";
    if (spacer) spacer.style.display = "none";
    return;
  }

  var isoTimes = getHourlyTimesSafe(__todayExtrasState.bundle, "weather");
  var win = clampWindowStartEnd(wIdx, minHours, isoTimes.length);

  var warnings = computeWarnings({
    mode: "window", // any point in next N hours
    start: win.start,
    end: win.end,
  });

  if (!warnings.length) {
    card.style.display = "none";
    if (spacer) spacer.style.display = "none";
    return;
  }

  card.style.display = "";
  if (spacer) spacer.style.display = "";

  list.innerHTML = "";
  warnings.forEach(function (w) {
    var row = document.createElement("div");
    row.className = "row";
    row.innerHTML =
      '<div style="font-weight:800;">' + escapeHtml(w.title) + "</div>" +
      '<div class="muted small" style="text-align:right;">' + escapeHtml(w.detail || "") + "</div>";
    list.appendChild(row);
  });
}

/* ---------- Build extended snapshot ---------- */

function buildExtendedSnapshotFromBundle(nowIdx, startIdx, endIdx) {
  var b = __todayExtrasState.bundle;

  // Weather arrays
  var temp = getHourlyFieldSafe(b, "weather", "temperature_2m");
  var feels = getHourlyFieldSafe(b, "weather", "apparent_temperature");
  var wind = getHourlyFieldSafe(b, "weather", "wind_speed_10m");
  var gust = getHourlyFieldSafe(b, "weather", "wind_gusts_10m");
  var windDir = getHourlyFieldSafe(b, "weather", "wind_direction_10m");
  var pressure = getHourlyFieldSafe(b, "weather", "pressure_msl");
  var cloud = getHourlyFieldSafe(b, "weather", "cloud_cover");
  var pop = getHourlyFieldSafe(b, "weather", "precipitation_probability");
  var vis = getHourlyFieldSafe(b, "weather", "visibility");
  var wcode = getHourlyFieldSafe(b, "weather", "weather_code");

  // Marine arrays
  var waveH = getHourlyFieldSafe(b, "marine", "wave_height");
  var waveP = getHourlyFieldSafe(b, "marine", "wave_period");
  var waveD = getHourlyFieldSafe(b, "marine", "wave_direction");

  var wwH = getHourlyFieldSafe(b, "marine", "wind_wave_height");
  var wwP = getHourlyFieldSafe(b, "marine", "wind_wave_period");
  var wwPP = getHourlyFieldSafe(b, "marine", "wind_wave_peak_period");
  var wwD = getHourlyFieldSafe(b, "marine", "wind_wave_direction");

  var swH = getHourlyFieldSafe(b, "marine", "swell_wave_height");
  var swP = getHourlyFieldSafe(b, "marine", "swell_wave_period");
  var swPP = getHourlyFieldSafe(b, "marine", "swell_wave_peak_period");
  var swD = getHourlyFieldSafe(b, "marine", "swell_wave_direction");

  var curV = getHourlyFieldSafe(b, "marine", "ocean_current_velocity");
  var curD = getHourlyFieldSafe(b, "marine", "ocean_current_direction");
  var sst = getHourlyFieldSafe(b, "marine", "sea_surface_temperature");

  // Convert now values (some need unit conversion)
  var now = {
    temp_c: temp ? round1(temp[nowIdx]) : null,
    feels_c: feels ? round1(feels[nowIdx]) : null,
    wind_kts: wind ? round0(mpsToKts(wind[nowIdx])) : null,
    gust_kts: gust ? round0(mpsToKts(gust[nowIdx])) : null,
    wind_dir_deg: windDir ? round0(windDir[nowIdx]) : null,

    pressure_hpa: pressure ? round0(pressure[nowIdx]) : null,
    cloud_pct: cloud ? round0(cloud[nowIdx]) : null,
    pop_pct: pop ? round0(pop[nowIdx]) : null,
    vis_km: vis ? round1((Number(vis[nowIdx]) / 1000)) : null,

    wave_m: waveH ? round1(waveH[getMarineIndexAligned(nowIdx)]) : null,
    wave_period_s: waveP ? round1(waveP[getMarineIndexAligned(nowIdx)]) : null,
    wave_dir_deg: waveD ? round0(waveD[getMarineIndexAligned(nowIdx)]) : null,

    windwave_m: wwH ? round1(wwH[getMarineIndexAligned(nowIdx)]) : null,
    windwave_period_s: wwP ? round1(wwP[getMarineIndexAligned(nowIdx)]) : null,
    windwave_peak_s: wwPP ? round1(wwPP[getMarineIndexAligned(nowIdx)]) : null,
    windwave_dir_deg: wwD ? round0(wwD[getMarineIndexAligned(nowIdx)]) : null,

    swell_m: swH ? round1(swH[getMarineIndexAligned(nowIdx)]) : null,
    swell_period_s: swP ? round1(swP[getMarineIndexAligned(nowIdx)]) : null,
    swell_peak_s: swPP ? round1(swPP[getMarineIndexAligned(nowIdx)]) : null,
    swell_dir_deg: swD ? round0(swD[getMarineIndexAligned(nowIdx)]) : null,

    current_kts: curV ? round1(mpsToKts(curV[getMarineIndexAligned(nowIdx)])) : null,
    current_dir_deg: curD ? round0(curD[getMarineIndexAligned(nowIdx)]) : null,

    sea_temp_c: sst ? round1(sst[getMarineIndexAligned(nowIdx)]) : null,
  };

  // Avg window values
  // Weather averages
  var avg = {
    temp_c: temp ? round1(avgNumeric(temp, startIdx, endIdx)) : null,
    feels_c: feels ? round1(avgNumeric(feels, startIdx, endIdx)) : null,
    wind_kts: wind ? round0(mpsToKts(avgNumeric(wind, startIdx, endIdx))) : null,
    gust_kts: gust ? round0(mpsToKts(avgNumeric(gust, startIdx, endIdx))) : null,
    wind_dir_deg: windDir ? round0(circularMeanDeg(windDir, startIdx, endIdx)) : null,

    pressure_hpa: pressure ? round0(avgNumeric(pressure, startIdx, endIdx)) : null,
    cloud_pct: cloud ? round0(avgNumeric(cloud, startIdx, endIdx)) : null,
    pop_pct: pop ? round0(avgNumeric(pop, startIdx, endIdx)) : null,
    vis_km: vis ? round1((avgNumeric(vis, startIdx, endIdx) / 1000)) : null,
  };

  // Marine averages need aligned indices by timestamp
  var marineTimes = getHourlyTimesSafe(b, "marine");
  var weatherTimes = getHourlyTimesSafe(b, "weather");

  function avgMarineNumeric(arr) {
    if (!arr || !arr.length) return null;
    var sum = 0, n = 0;
    for (var wi = startIdx; wi < endIdx; wi++) {
      var t = weatherTimes[wi];
      var mi = __todayExtrasState.marineTimeToIndex && t ? __todayExtrasState.marineTimeToIndex[String(t)] : null;
      if (mi == null) continue;
      var v = Number(arr[mi]);
      if (!isFinite(v)) continue;
      sum += v; n++;
    }
    return n ? (sum / n) : null;
  }

  function meanMarineDir(arr) {
    if (!arr || !arr.length) return null;
    var x=0,y=0,n=0;
    for (var wi = startIdx; wi < endIdx; wi++) {
      var t = weatherTimes[wi];
      var mi = __todayExtrasState.marineTimeToIndex && t ? __todayExtrasState.marineTimeToIndex[String(t)] : null;
      if (mi == null) continue;
      var d = Number(arr[mi]);
      if (!isFinite(d)) continue;
      var r = degToRad(d);
      x += Math.cos(r); y += Math.sin(r); n++;
    }
    if (!n) return null;
    var mean = radToDeg(Math.atan2(y/n, x/n));
    if (!isFinite(mean)) return null;
    return (mean + 360) % 360;
  }

  avg.wave_m = waveH ? round1(avgMarineNumeric(waveH)) : null;
  avg.wave_period_s = waveP ? round1(avgMarineNumeric(waveP)) : null;
  avg.wave_dir_deg = waveD ? round0(meanMarineDir(waveD)) : null;

  avg.windwave_m = wwH ? round1(avgMarineNumeric(wwH)) : null;
  avg.windwave_period_s = wwP ? round1(avgMarineNumeric(wwP)) : null;
  avg.windwave_peak_s = wwPP ? round1(avgMarineNumeric(wwPP)) : null;
  avg.windwave_dir_deg = wwD ? round0(meanMarineDir(wwD)) : null;

  avg.swell_m = swH ? round1(avgMarineNumeric(swH)) : null;
  avg.swell_period_s = swP ? round1(avgMarineNumeric(swP)) : null;
  avg.swell_peak_s = swPP ? round1(avgMarineNumeric(swPP)) : null;
  avg.swell_dir_deg = swD ? round0(meanMarineDir(swD)) : null;

  avg.current_kts = curV ? round1(mpsToKts(avgMarineNumeric(curV))) : null;
  avg.current_dir_deg = curD ? round0(meanMarineDir(curD)) : null;

  avg.sea_temp_c = sst ? round1(avgMarineNumeric(sst)) : null;

  // Determine variability flags for direction fields (weather: use windDir window; marine: check against mean with aligned samples)
  var windMean = avg.wind_dir_deg;
  var windVar = windDir ? isDirectionVariable(windDir, startIdx, endIdx, windMean) : false;

  function marineDirVariable(arr, meanDeg) {
    if (!arr || meanDeg == null) return false;
    var weatherTimes2 = weatherTimes;
    var n=0,bad=0;
    for (var wi = startIdx; wi < endIdx; wi++) {
      var t = weatherTimes2[wi];
      var mi = __todayExtrasState.marineTimeToIndex && t ? __todayExtrasState.marineTimeToIndex[String(t)] : null;
      if (mi == null) continue;
      var d = Number(arr[mi]);
      if (!isFinite(d)) continue;
      var diff = circularDiffDeg(d, meanDeg);
      if (diff == null) continue;
      n++;
      if (diff > 60) bad++;
    }
    if (!n) return false;
    return (bad / n) >= 0.3;
  }

  var waveDirVar = waveD ? marineDirVariable(waveD, avg.wave_dir_deg) : false;
  var wwDirVar = wwD ? marineDirVariable(wwD, avg.windwave_dir_deg) : false;
  var swDirVar = swD ? marineDirVariable(swD, avg.swell_dir_deg) : false;
  var curDirVar = curD ? marineDirVariable(curD, avg.current_dir_deg) : false;

  // Condition text now: use day hourRows if possible (keeps your mapping consistent)
  var conditionTextNow = "—";
  var hourRows = (__todayExtrasState.data && __todayExtrasState.data.hours) ? __todayExtrasState.data.hours : [];
  var nowHHMM = isoToHHMM(getHourlyTimesSafe(b, "weather")[nowIdx]);
  if (nowHHMM) {
    for (var i = 0; i < hourRows.length; i++) {
      if (hourRows[i] && String(hourRows[i].time) === nowHHMM) {
        conditionTextNow = hourRows[i].condition || conditionTextNow;
        break;
      }
    }
  }

  return {
    now: now,
    avg: avg,

    windVar: windVar,
    waveDirVar: waveDirVar,
    wwDirVar: wwDirVar,
    swDirVar: swDirVar,
    curDirVar: curDirVar,

    conditionTextNow: conditionTextNow,
  };
}

function getMarineIndexAligned(weatherIdx) {
  // Map weather timestamp to marine index; if missing, fall back to same index
  var wt = getHourlyTimesSafe(__todayExtrasState.bundle, "weather");
  var t = wt && wt[weatherIdx] ? String(wt[weatherIdx]) : null;
  if (!t) return weatherIdx;

  var mi = __todayExtrasState.marineTimeToIndex ? __todayExtrasState.marineTimeToIndex[t] : null;
  return (mi == null) ? weatherIdx : mi;
}

/* ---------- Render grid (Today card & overlay share) ---------- */
function renderKVRow(labelHtml, nowHtml, avgHtml, showAvg) {
  return (
    '<div class="row">' +
      '<div class="muted small">' + labelHtml + '</div>' +
      '<div style="text-align:right;">' +
        '<span style="font-weight:800;">' + nowHtml + '</span>' +
        (showAvg && avgHtml
          ? ' <span class="muted small">(' + avgHtml + ')</span>'
          : '') +
      '</div>' +
    '</div>'
  );
}

function fmtVal(x, suffix) {
  if (x == null || !isFinite(Number(x))) return "—";
  return String(x) + (suffix || "");
}

function fmtDir(deg, variable) {
  if (deg == null || !isFinite(Number(deg))) return "—";
  var c = degToCompass16(deg) || "";
  var arrow = svgArrowRotated((Number(deg) + 180) % 360); // show "to" direction similar to wind arrow approach
  return (
    '<span>' + c + "</span>" +
    arrow +
    (variable ? svgVariable() : "")
  );
}

function renderExtendedGrid(snap, opts) {
  var showScore = !!(opts && opts.showScore);
  var showTimeLabel = !!(opts && opts.showTimeLabel);
  var showAverages = !!(opts && opts.showAverages); 

  var now = snap.now || {};
  var avg = snap.avg || {};

  var html = "";

  // Weather
  html += '<div class="muted small" style="font-weight:800; margin:8px 0 6px;">Weather</div>';
  html += renderKVRow(svgThermometer() + "Air temp", fmtVal(now.temp_c, "°C"), fmtVal(avg.temp_c, "°C"), showAverages);
  html += renderKVRow(svgThermometer() + "Feels like", fmtVal(now.feels_c, "°C"), fmtVal(avg.feels_c, "°C"), showAverages);

  html += renderKVRow(svgWind() + "Wind", fmtVal(now.wind_kts, " kts"), fmtVal(avg.wind_kts, " kts"), showAverages);
  html += renderKVRow(svgWind() + "Gust", fmtVal(now.gust_kts, " kts"), fmtVal(avg.gust_kts, " kts"), showAverages);
  html += renderKVRow(svgWind() + "Wind dir", fmtDir(now.wind_dir_deg, snap.windVar), fmtDir(avg.wind_dir_deg, snap.windVar), showAverages);

  html += renderKVRow("Pressure", fmtVal(now.pressure_hpa, " hPa"), fmtVal(avg.pressure_hpa, " hPa"), showAverages);
  html += renderKVRow("Cloud cover", fmtVal(now.cloud_pct, "%"), fmtVal(avg.cloud_pct, "%"), showAverages);
  html += renderKVRow("Precip prob", fmtVal(now.pop_pct, "%"), fmtVal(avg.pop_pct, "%"), showAverages);
  html += renderKVRow(svgVisibility() + "Visibility", fmtVal(now.vis_km, " km"), fmtVal(avg.vis_km, " km"), showAverages);

  // Marine
  html += '<div class="muted small" style="font-weight:800; margin:10px 0 6px;">Marine</div>';
  html += renderKVRow(svgWave() + "Wave height", fmtVal(now.wave_m, " m"), fmtVal(avg.wave_m, " m"), showAverages);
  html += renderKVRow(svgWave() + "Wave period", fmtVal(now.wave_period_s, " s"), fmtVal(avg.wave_period_s, " s"), showAverages);
  html += renderKVRow(svgWave() + "Wave dir", fmtDir(now.wave_dir_deg, snap.waveDirVar), fmtDir(avg.wave_dir_deg, snap.waveDirVar), showAverages);

  html += renderKVRow(svgWave() + "Wind wave height", fmtVal(now.windwave_m, " m"), fmtVal(avg.windwave_m, " m"), showAverages);
  html += renderKVRow(svgWave() + "Wind wave period", fmtVal(now.windwave_period_s, " s"), fmtVal(avg.windwave_period_s, " s"), showAverages);
  html += renderKVRow(svgWave() + "Wind wave peak", fmtVal(now.windwave_peak_s, " s"), fmtVal(avg.windwave_peak_s, " s"), showAverages);
  html += renderKVRow(svgWave() + "Wind wave dir", fmtDir(now.windwave_dir_deg, snap.wwDirVar), fmtDir(avg.windwave_dir_deg, snap.wwDirVar), showAverages);

  html += renderKVRow(svgWave() + "Swell height", fmtVal(now.swell_m, " m"), fmtVal(avg.swell_m, " m"), showAverages);
  html += renderKVRow(svgWave() + "Swell period", fmtVal(now.swell_period_s, " s"), fmtVal(avg.swell_period_s, " s"), showAverages);
  html += renderKVRow(svgWave() + "Swell peak", fmtVal(now.swell_peak_s, " s"), fmtVal(avg.swell_peak_s, " s"), showAverages);
  html += renderKVRow(svgWave() + "Swell dir", fmtDir(now.swell_dir_deg, snap.swDirVar), fmtDir(avg.swell_dir_deg, snap.swDirVar), showAverages);

  html += renderKVRow("Current", fmtVal(now.current_kts, " kts"), fmtVal(avg.current_kts, " kts"), showAverages);
  html += renderKVRow("Current dir", fmtDir(now.current_dir_deg, snap.curDirVar), fmtDir(avg.current_dir_deg, snap.curDirVar), showAverages);
  html += renderKVRow("Sea temp", fmtVal(now.sea_temp_c, "°C"), fmtVal(avg.sea_temp_c, "°C"), showAverages);

  return html;
}

/* ---------- Overlay ---------- */

function ensureOverlayRoot() {
  var existing = document.getElementById("ccOverlay");
  if (existing) return existing;

  var root = document.createElement("div");
  root.id = "ccOverlay";
  root.style.display = "none";
  root.style.position = "fixed";
  root.style.left = "0";
  root.style.top = "0";
  root.style.right = "0";
  root.style.bottom = "0";
  root.style.zIndex = "9999";

  root.innerHTML =
    '<div id="ccOverlayBackdrop" style="position:absolute; inset:0; background:rgba(0,0,0,0.55);"></div>' +
    '<div style="position:absolute; left:0; right:0; bottom:0; max-height:85vh; overflow:auto; padding:12px;">' +
      '<div id="ccOverlayCard" class="card" style="margin:0 auto; max-width:720px;">' +
        '<div class="row" style="align-items:flex-start;">' +
          '<div>' +
            '<div class="muted small" id="ccOverlayTime">Hour</div>' +
            '<div style="font-weight:800;" id="ccOverlayTitle">Conditions</div>' +
          '</div>' +
          '<button id="ccOverlayClose" class="btn" type="button">Close</button>' +
        '</div>' +
        '<div class="spacer"></div>' +
        '<div id="ccOverlayWarningsWrap" style="display:none;">' +
          '<h2 style="margin:0;">Warnings</h2>' +
          '<div class="spacer"></div>' +
          '<div class="list" id="ccOverlayWarnings"></div>' +
          '<div class="spacer"></div>' +
        '</div>' +
        '<div id="ccOverlayBody" class="list"></div>' +
      '</div>' +
    '</div>';

  document.body.appendChild(root);

  var backdrop = document.getElementById("ccOverlayBackdrop");
  var closeBtn = document.getElementById("ccOverlayClose");

  function close() {
    root.style.display = "none";
  }
  if (backdrop) backdrop.addEventListener("click", close);
  if (closeBtn) closeBtn.addEventListener("click", close);

  return root;
}

function openHourlyOverlayImpl(hourRow) {
  var root = ensureOverlayRoot();
  if (!root) return;

  var bodyEl = document.getElementById("ccOverlayBody");
  var timeEl = document.getElementById("ccOverlayTime");
  var titleEl = document.getElementById("ccOverlayTitle");

  var warningsWrap = document.getElementById("ccOverlayWarningsWrap");
  var warningsEl = document.getElementById("ccOverlayWarnings");

  var minHours = __todayExtrasState.minHours || 2;

  var wIdx = getWeatherIndexForHourRow(hourRow);
  if (wIdx == null) {
    if (bodyEl) bodyEl.innerHTML = '<div class="muted small">Unavailable.</div>';
    root.style.display = "";
    return;
  }

  var isoTimes = getHourlyTimesSafe(__todayExtrasState.bundle, "weather");
  var win = clampWindowStartEnd(wIdx, minHours, isoTimes.length);

  var snap = buildExtendedSnapshotFromBundle(wIdx, win.start, win.end);

  // Title area (overlay shows time + score)
  var hh = (hourRow && hourRow.time) ? String(hourRow.time) : "Hour";
  if (timeEl) timeEl.textContent = hh;

  var score = (hourRow && hourRow.score != null) ? hourRow.score : null;
  var scoreHtml = (score != null) ? (' <span class="' + pillClass(score) + '" style="margin-left:8px;">' + score + "</span>") : "";

  if (titleEl) {
    titleEl.innerHTML = escapeHtml(snap.conditionTextNow) + scoreHtml;
  }

  // Warnings (overlay = NOW ONLY per your instruction)
  var warnings = computeWarnings({
    mode: "now",
    start: wIdx,
    end: wIdx + 1,
  });

  if (warnings && warnings.length) {
    if (warningsWrap) warningsWrap.style.display = "";
    if (warningsEl) {
      warningsEl.innerHTML = "";
      warnings.forEach(function (w) {
        var row = document.createElement("div");
        row.className = "row";
        row.innerHTML =
          '<div style="font-weight:800;">' + escapeHtml(w.title) + "</div>" +
          '<div class="muted small" style="text-align:right;">' + escapeHtml(w.detail || "") + "</div>";
        warningsEl.appendChild(row);
      });
    }
  } else {
    if (warningsWrap) warningsWrap.style.display = "none";
    if (warningsEl) warningsEl.innerHTML = "";
  }

  if (bodyEl) {
    bodyEl.innerHTML = renderExtendedGrid(snap, { showScore: true, showTimeLabel: true,  showAverages: false });
  }

  root.style.display = "";
}

/* ---------- Warnings computation ---------- */

function computeWarnings(args) {
  var mode = args && args.mode ? args.mode : "window";
  var start = Number(args && args.start);
  var end = Number(args && args.end);
  if (!isFinite(start) || !isFinite(end) || end <= start) return [];

  var b = __todayExtrasState.bundle;

  // Weather
  var wind = getHourlyFieldSafe(b, "weather", "wind_speed_10m");
  var gust = getHourlyFieldSafe(b, "weather", "wind_gusts_10m");
  var windDir = getHourlyFieldSafe(b, "weather", "wind_direction_10m");
  var pop = getHourlyFieldSafe(b, "weather", "precipitation_probability");
  var vis = getHourlyFieldSafe(b, "weather", "visibility");
  var feels = getHourlyFieldSafe(b, "weather", "apparent_temperature");

  // Marine
  var curV = getHourlyFieldSafe(b, "marine", "ocean_current_velocity");
  var curD = getHourlyFieldSafe(b, "marine", "ocean_current_direction");
  var waveH = getHourlyFieldSafe(b, "marine", "wave_height");
  var waveP = getHourlyFieldSafe(b, "marine", "wave_period");

  var weatherTimes = getHourlyTimesSafe(b, "weather");

  function worstMax(arr, xform) {
    var max = null;
    for (var i = start; i < end; i++) {
      var v = arr ? arr[i] : null;
      var n = (xform ? xform(v, i) : Number(v));
      if (!isFinite(n)) continue;
      if (max == null || n > max) max = n;
    }
    return max;
  }

  function worstMin(arr, xform) {
    var min = null;
    for (var i = start; i < end; i++) {
      var v = arr ? arr[i] : null;
      var n = (xform ? xform(v, i) : Number(v));
      if (!isFinite(n)) continue;
      if (min == null || n < min) min = n;
    }
    return min;
  }

  function anyMatch(fn) {
    for (var i = start; i < end; i++) {
      if (fn(i)) return true;
    }
    return false;
  }

  var warnings = [];

  // 1) Wind against current (comfort)
  // Trigger if at ANY point in window:
  // - current >= 1.0 kt
  // - wind >= 12 kt (sensible default; easy to tweak)
  // - wind direction opposes current direction (within 60° of opposite)
  var windKtsArr = wind;
  var curKtsArr = curV;

  function getMarineIdxForWeatherIdx(i) {
    var t = weatherTimes && weatherTimes[i] ? String(weatherTimes[i]) : null;
    var mi = (__todayExtrasState.marineTimeToIndex && t) ? __todayExtrasState.marineTimeToIndex[t] : null;
    return (mi == null) ? i : mi;
  }

  var windAgainst = anyMatch(function (i) {
    var wKts = windKtsArr ? mpsToKts(windKtsArr[i]) : null;
    var wDir = windDir ? Number(windDir[i]) : null;

    var mi = getMarineIdxForWeatherIdx(i);
    var cKts = curKtsArr ? mpsToKts(curKtsArr[mi]) : null;
    var cDir = curD ? Number(curD[mi]) : null;

    if (!isFinite(wKts) || !isFinite(wDir) || !isFinite(cKts) || !isFinite(cDir)) return false;
    if (cKts < 1.0) return false;
    if (wKts < 12) return false;

    // Opposing if wind "to" direction approx opposite current direction.
    // WindDir is "from", so "to" = +180.
    var windTo = (wDir + 180) % 360;
    var diff = circularDiffDeg(windTo, cDir);
    if (diff == null) return false;
    return diff <= 60;
  });

  if (windAgainst) {
    warnings.push({
      title: "Wind against current",
      detail: (mode === "now") ? "Steeper chop possible." : "Possible within next window.",
    });
  }

  // 2) Gusty wind (gust spread)
  var maxSpread = null;
  for (var i = start; i < end; i++) {
    var wK = wind ? mpsToKts(wind[i]) : null;
    var gK = gust ? mpsToKts(gust[i]) : null;
    if (!isFinite(wK) || !isFinite(gK)) continue;
    var spread = gK - wK;
    if (maxSpread == null || spread > maxSpread) maxSpread = spread;
  }
  if (maxSpread != null && maxSpread >= 8) {
    warnings.push({
      title: "Gusty wind",
      detail: "Gust spread up to " + round0(maxSpread) + " kts",
    });
  }

  // 3) Reduced visibility
  var minVisKm = worstMin(vis, function (v) {
    var m = Number(v);
    if (!isFinite(m)) return null;
    return m / 1000;
  });
  if (minVisKm != null && minVisKm <= 2) {
    warnings.push({
      title: "Reduced visibility",
      detail: "As low as " + round1(minVisKm) + " km",
    });
  }

  // 4) Showers possible (precip probability)
  var maxPop = worstMax(pop, function (v) { return Number(v); });
  if (maxPop != null && maxPop >= 60) {
    warnings.push({
      title: "Showers possible",
      detail: "Chance up to " + round0(maxPop) + "%",
    });
  }

  // 5) Choppy / steep seas proxy (wave height + short period)
  // Very simple comfort heuristic: height >= 1.2m and period <= 7s at any point
  var choppy = anyMatch(function (i) {
    var mi = getMarineIdxForWeatherIdx(i);
    var h = waveH ? Number(waveH[mi]) : null;
    var p = waveP ? Number(waveP[mi]) : null;
    if (!isFinite(h) || !isFinite(p)) return false;
    return (h >= 1.2 && p <= 7);
  });
  if (choppy) {
    warnings.push({
      title: "Choppy seas",
      detail: (mode === "now") ? "Short-period chop possible." : "Possible within next window.",
    });
  }

  // 6) Cold stress (feels-like)
  var minFeels = worstMin(feels, function (v) { return Number(v); });
  if (minFeels != null && minFeels <= 4) {
    warnings.push({
      title: "Cold exposure",
      detail: "Feels like down to " + round0(minFeels) + "°C",
    });
  }

  return warnings;
}

/* ---------- HTML safety ---------- */

function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
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
    // Day view data (existing)
    var data = await getDayData(loc.slug, dayIso);

    // Raw bundle (needed for extended conditions)
    var bundle = await getBundle(loc.slug);

    renderDay(data, loc, bundle);
  } catch (e) {
    var titleEl2 = document.getElementById("title");
    if (titleEl2) titleEl2.textContent = "Error: " + (e && e.message ? e.message : String(e));
  }

  
  
}

main();

