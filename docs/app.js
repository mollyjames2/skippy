"use strict";

import { pillClass, getSavedLocation } from "./common/core.js";
import { getWeekData, getDayData } from "./data.js";

function setText(id, text) {
  var el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
}

function setHtml(id, html) {
  var el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = html;
}

function setFooterNote(msg) {
  setText("footerNote", msg || "");
}

function wireHomeTopbar() {
  var settingsBtn = document.getElementById("settingsBtn");
  if (settingsBtn) {
    settingsBtn.addEventListener("click", function () {
      window.location.href = "./settings.html";
    });
  }
}

function wireLocationBar() {
  var bar = document.getElementById("locationBar");
  if (!bar) return;

  bar.addEventListener("click", function () {
    window.location.href = "./location.html?from=home";
  });
}

function renderLocationBar(loc) {
  var label = document.getElementById("locationLabel");
  if (!label) return;

  if (!loc || !loc.name) {
    label.textContent = "Choose location";
    return;
  }

  label.textContent = loc.name;
}

/* ---------------------------------------------
   London time helpers
--------------------------------------------- */

function todayIsoLondon() {
  var parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  var y = (parts.find(function (p) { return p.type === "year"; }) || {}).value;
  var m = (parts.find(function (p) { return p.type === "month"; }) || {}).value;
  var d = (parts.find(function (p) { return p.type === "day"; }) || {}).value;

  return String(y) + "-" + String(m) + "-" + String(d);
}

function formatUpdatedAtLondon(iso) {
  if (!iso) return "";
  var d = new Date(iso);
  if (isNaN(d.getTime())) return "";

  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function hhmmToMinutes(hhmm) {
  if (!hhmm || typeof hhmm !== "string") return null;
  var p = hhmm.split(":");
  if (p.length !== 2) return null;
  var h = Number(p[0]);
  var m = Number(p[1]);
  if (!isFinite(h) || !isFinite(m)) return null;
  return h * 60 + m;
}

function nowMinutesLondon() {
  var parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());

  var hh = Number((parts.find(function (p) { return p.type === "hour"; }) || {}).value);
  var mm = Number((parts.find(function (p) { return p.type === "minute"; }) || {}).value);

  if (!isFinite(hh) || !isFinite(mm)) return null;
  return hh * 60 + mm;
}


/**
 * Best time to boat display logic (Today card only).
 *
 * Rules:
 * - If there are no recommended windows at all today -> noneToday
 * - If all windows are passed, or only an in-progress window with too little time left and no future windows -> noneLeft
 * - If we are inside a window and there is >= minHours remaining -> show Now-end
 * - If we are inside a window but remaining < minHours -> skip to next future window if any
 * - Otherwise show the next future window start-end
 *
 * Returns:
 *   { kind:"window", startText, end, score? }
 *   { kind:"noneToday" }
 *   { kind:"noneLeft" }
 */
function deriveTodayBestTimeDisplay(recommended, minHours) {
  // Capture "now" once for this render (matches "based on when the page was loaded/rendered")
  var minsNow = nowMinutesLondon();
  if (minsNow == null) minsNow = nowMinutesLocal(); // fallback

  // "Too late" threshold is based on minHours
  var minMins = (typeof minHours === "number" && isFinite(minHours) ? minHours : 0) * 60;

  function getAllWindowsFlat(recommended) {
    // Shape A: array of windows
    if (Array.isArray(recommended)) return recommended.slice();

    // Shape B: tiered object { excellent:[...], good:[...], ok:[...] }
    if (!recommended || typeof recommended !== "object") return [];
    var tiers = ["excellent", "good", "ok"];
    var out = [];
    for (var ti = 0; ti < tiers.length; ti++) {
      var list = recommended[tiers[ti]];
      if (Array.isArray(list)) out = out.concat(list);
    }
    return out;
  }

  var all = getAllWindowsFlat(recommended);
  var hadAnyWindowsToday = all.length > 0;

  if (!hadAnyWindowsToday) {
    return { kind: "noneToday" };
  }

  // Iterate in order (assumes recommended is already best->next best)
  for (var i = 0; i < all.length; i++) {
    var w = all[i];
    if (!w || !w.start || !w.end) continue;

    var startMin = hhmmToMinutes(w.start);
    var endMin = hhmmToMinutes(w.end);
    if (startMin == null || endMin == null) continue;

    // Window fully passed
    if (endMin <= minsNow) continue;

    // Inside current window
    if (minsNow >= startMin && minsNow < endMin) {
      var remaining = endMin - minsNow;

      // If too little time left (based on minHours), skip this window and look for the next future one
      if (remaining < minMins) {
        continue;
      }

      // Otherwise show Now-end
      return {
        kind: "window",
        startText: "Now",
        end: w.end,
        score: w.score
      };
    }

    // Future window: show start-end
    if (minsNow < startMin) {
      return {
        kind: "window",
        startText: w.start,
        end: w.end,
        score: w.score
      };
    }
  }

  // There WERE windows today, but none are suitable/future anymore
  return { kind: "noneLeft" };
}



/* ---------------------------------------------
   Tide card helpers
--------------------------------------------- */

/**
 * Returns minutes until hh:mm.
 *
 * dayOffset:
 *   0 = today only (if time already passed, returns null)
 *   1 = tomorrow (always treats hh:mm as tomorrow)
 */
function minsUntilHHMM(hhmm, dayOffset) {
  if (!hhmm || typeof hhmm !== "string") return null;

  var parts = hhmm.split(":");
  if (parts.length !== 2) return null;

  var h = Number(parts[0]);
  var m = Number(parts[1]);
  if (!isFinite(h) || !isFinite(m)) return null;

  var now = new Date();
  var t = new Date(now);

  // Anchor date first
  if (dayOffset === 1) {
    t.setDate(t.getDate() + 1);
  }

  t.setHours(h, m, 0, 0);

  if (dayOffset === 0) {
    // Today-only: if it already passed, it's not a valid "next" event
    if (t.getTime() < now.getTime()) return null;
  }

  return Math.round((t.getTime() - now.getTime()) / 60000);
}

function formatMins(mins) {
  if (mins == null || !isFinite(mins)) return "-";
  if (mins < 60) return mins + " min";
  var h = Math.floor(mins / 60);
  var m = mins % 60;
  return h + "h " + String(m).padStart(2, "0") + "m";
}

function findNextTideEvent(events, dayOffset) {
  var best = null;
  (events || []).forEach(function (e) {
    if (!e || !e.time) return;
    var mins = minsUntilHHMM(e.time, dayOffset || 0);
    if (mins == null) return;
    if (best == null || mins < best.mins) {
      best = {
        type: e.type || "-",
        time: e.time,
        height_m: e.height_m,
        mins: mins,
        is_tomorrow: dayOffset === 1,
      };
    }
  });
  return best;
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

function applyCardTone(el, score) {
  if (!el) return;

  // Remove previous tones
  el.classList.remove("tone-excellent", "tone-good", "tone-ok", "tone-poor", "tone-avoid");

  var c = toneClassForScore(score);
  if (c) el.classList.add(c);
}

/* ---------------------------------------------
   NOW (nearest hour) helpers
--------------------------------------------- */

function findCurrentHour(hours) {
  if (!Array.isArray(hours) || !hours.length) return null;

  var now = new Date();
  var best = null;
  var bestScore = Infinity;

  for (var i = 0; i < hours.length; i++) {
    var h = hours[i];
    if (!h || !h.time) continue;

    var parts = String(h.time).split(":");
    if (parts.length !== 2) continue;
    var hh = Number(parts[0]);
    var mm = Number(parts[1]);
    if (!isFinite(hh) || !isFinite(mm)) continue;

    var t = new Date(now);
    t.setHours(hh, mm, 0, 0);

    var delta = t.getTime() - now.getTime();

    // Prefer next future hour; otherwise nearest past.
    var score = delta >= 0 ? delta : (Math.abs(delta) + 24 * 60 * 60 * 1000);

    if (score < bestScore) {
      bestScore = score;
      best = h;
    }
  }

  return best;
}

// Your hourly rows currently contain wind_dir as compass text, not degrees.
// We map compass -> degrees so we can rotate an SVG arrow correctly.
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

/* ---------------------------------------------
   SVG icons (no emojis)
--------------------------------------------- */

function svgIconWrap(svg) {
  // baseline alignment helper (works well with your "small muted" text)
  return '<span style="display:inline-flex; align-items:center; line-height:1; margin-right:6px;">' + svg + "</span>";
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
      '</svg>' +
    '</span>'
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

  // Your condition strings are produced by weatherCodeToText in data.js
  // Examples: Clear, Mostly clear, Cloudy, Fog, Drizzle/Rain, Showers, Thunder, Snow, Mixed
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

  // Default: cloudy/mixed
  return svgIconWrap(
    '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">' +
      '<path d="M6 16h12a4 4 0 0 0 0-8 5 5 0 0 0-9-2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
    "</svg>"
  );
}

// Remove any existing tone-* classes then add the one we want
function forceToneClass(el, toneClass) {
  if (!el) return;
  el.classList.remove("tone-excellent", "tone-good", "tone-ok", "tone-poor", "tone-avoid");
  if (toneClass) el.classList.add(toneClass);
}

// Ensures no legacy click handler survives between renders
function setBestCardClick(bestEl, handlerOrNull) {
  if (!bestEl) return;

  // Remove previous handler if one exists
  if (bestEl._bestClickHandler) {
    bestEl.removeEventListener("click", bestEl._bestClickHandler);
    bestEl._bestClickHandler = null;
  }

  // Add new handler if provided
  if (handlerOrNull) {
    bestEl._bestClickHandler = handlerOrNull;
    bestEl.style.cursor = "pointer";
    bestEl.addEventListener("click", handlerOrNull);
  } else {
    bestEl.style.cursor = "default";
  }
}

/* ---------------------------------------------
   Today card renderer (updated)
--------------------------------------------- */

function scoreToWord(score) {
  var s = Number(score);
  if (!isFinite(s)) return "-";
  if (s >= 90) return "EXCELLENT";
  if (s >= 60) return "GOOD";
  if (s >= 40) return "OK";
  if (s >= 20) return "POOR";
  return "AVOID";
}

function renderTideLine(e, showHeight) {
  if (!e) return "";
  if (showHeight == null) showHeight = true;

  var type = e.type || "-";
  var time = e.time || "-";

  var hm = "";
  if (showHeight && e.height_m != null && isFinite(Number(e.height_m))) {
    // keep as given (already rounded in data.js)
    hm = " (" + Number(e.height_m).toFixed(1).replace(/\.0$/, "") + "m)";
  }

  return '<div class="small muted">' + type + " " + time + hm + "</div>";
}

function findNextTwoTides(tides, dayOffset) {
  // returns { a, b } where a is soonest and b is next soonest
  var candidates = [];
  (tides || []).forEach(function (e) {
    if (!e || !e.time) return;
    var mins = minsUntilHHMM(e.time, dayOffset);
    if (mins == null) return;
    candidates.push({
      type: e.type || "-",
      time: e.time,
      height_m: e.height_m,
      mins: mins,
      is_tomorrow: dayOffset === 1,
    });
  });

  candidates.sort(function (x, y) { return x.mins - y.mins; });

  return {
    a: candidates[0] || null,
    b: candidates[1] || null,
  };
}

function renderTodayTidesCard(dayData) {
  var tides = (dayData && dayData.tides) ? dayData.tides : [];
  var meta = (dayData && dayData.tides_meta) ? dayData.tides_meta : null;

  var score = dayData && dayData.summary ? dayData.summary.score : null;
  var ratingWord = scoreToWord(score);
  // ---- Best time to boat (time-aware, display only) ----
  var minHours = (function () {
    try {
      var v = localStorage.getItem("skippy.recommended.minHours");
      var n = Number(v);
      return (isFinite(n) && n >= 1) ? n : 2;
    } catch (e) {
      return 2;
    }
  })();
  
  var todayBestTime = deriveTodayBestTimeDisplay(
    dayData && dayData.recommended,
    minHours
  );


  // Next two tides:
  // 1) Prefer upcoming tides today
  // 2) If none left today, fall back to tomorrow modelled extrema

  var two = findNextTwoTides(tides, 0);
  var next1 = two.a;
  var next2 = two.b;

  // Mark source
  if (next1) next1._fromTomorrow = false;
  if (next2) next2._fromTomorrow = false;

  // If only one tide left today, top up from tomorrow
  if (next1 && !next2) {
    var tomorrowModel = dayData.tides_tomorrow_model || [];
    var twoT = findNextTwoTides(tomorrowModel, 1);
    if (twoT.a) {
      next2 = twoT.a;
      next2._fromTomorrow = true;
    }
  }

  // If none left today, both come from tomorrow
  if (!next1) {
    var tomorrowModel = dayData.tides_tomorrow_model || [];
    var twoT = findNextTwoTides(tomorrowModel, 1);
    next1 = twoT.a;
    next2 = twoT.b;
    if (next1) next1._fromTomorrow = true;
    if (next2) next2._fromTomorrow = true;
  }

  // Tide footer / source (keep under tides, small)
  var footer = "";
  if (meta && meta.source === "tidetimes") {
    var t = formatUpdatedAtLondon(meta.updated_at);
    footer = "Data accessed from Tide Times" + (t ? " - last updated " + t : "");
  } else {
    footer =
      (meta && meta.message)
        ? meta.message
        : "High accuracy tidal data not available - using 15 minute modelled tide predictions";
  }

  // Current conditions from nearest-hour
  var current = findCurrentHour(dayData && dayData.hours ? dayData.hours : []);
  var windKts = current && current.wind_kts != null ? current.wind_kts : "-";
  var windDir = current && current.wind_dir ? current.wind_dir : "-";
  var waveM = current && current.wave_m != null ? current.wave_m : "-";
  var conditionText = current && current.condition ? current.condition : "-";
  var tempC = current && current.temp_c != null ? current.temp_c : null;
  var feelsC = current && current.feels_like_c != null ? current.feels_like_c : null;

  var arrowDeg = windArrowDegFromCompass(windDir);

  // Headline: "Next high tide in 2h 26m"
  var headline = "";
  if (next1) {
    headline =
      '<div class="today-headline">' +
        'Next ' + String(next1.type || "-").toLowerCase() + ' tide in ' +
        '<span class="today-headline-strong">' + formatMins(next1.mins) + "</span>" +
      "</div>";
  } else {
    headline =
      '<div class="today-headline">' +
        'Next tide in <span class="today-headline-strong">-</span>' +
      "</div>";
  }

  // Temp chip: if "feels" is present, reduce the feels part slightly
  var tempValueHtml = "";
  if (tempC != null || feelsC != null) {
    tempValueHtml =
      '<span class="today-chip-main">' +
        (tempC != null ? tempC + "&deg;C" : "-") +
      "</span>" +
      (feelsC != null
        ? ' <span class="today-chip-feels">feels ' + feelsC + "&deg;C</span>"
        : "");
  } else {
    tempValueHtml = '<span class="today-chip-main">-</span>';
  }

  // Condition chip text
  var condValue = conditionText ? String(conditionText).toLowerCase() : "-";

  // Badge tone class from your existing helper
  var toneClass = toneClassForScore(score); // e.g. "tone-ok"

  setHtml(
    "tideCard",
    "" +
      // Title: bigger, mixed case, not bold
      '<div class="today-title">Today on the water</div>' +
      '<div class="spacer"></div>' +
  
      '<div class="today-grid">' +
  
      '  <div class="today-left">' +
  
      // 1) Headline (biggest left-side element)
      headline +
  
      '<div class="spacer today-spacer-tight"></div>' +
  
  
      // 2) Best time to boat (time-aware, display-only)
      (function () {
        var line = "";
      
        if (todayBestTime && todayBestTime.kind === "window") {
          line = '<b>' + todayBestTime.startText + '-' + todayBestTime.end + '</b>';
        } else if (todayBestTime && todayBestTime.kind === "noneLeft") {
          line = '<b>No windows left today</b>';
        } else {
          // noneToday (or any unexpected null/shape)
          line = '<b>No recommended windows today</b>';
        }
      
        return (
          '<div class="today-section-title">Best time to boat</div>' +
          '<div class="small muted" style="margin-bottom:6px;">' +
            line +
          '</div>' +
          '<div class="spacer today-spacer-tight"></div>'
        );
      })() +

      
  
      // 3) Next tides block
      '<div class="today-section-title">Next tides</div>' +
      (next1 ? renderTideLine(next1, !(next1._fromTomorrow === true)) : '<div class="small muted">-</div>') +
      (next2 ? renderTideLine(next2, !(next2._fromTomorrow === true)) : "") +
  
      '<div class="spacer today-spacer-tight"></div>' +
      '<div class="today-footer">' + footer + "</div>" +
  
      '<div class="spacer"></div>' +
  
      // 4) 2x2 chips (centered content)
      '<div class="today-chips">' +
  
      // Wind chip
      '<div class="today-chip">' +
      '  <div class="today-chip-top">' + svgWind() + '<span class="today-chip-label">Wind</span></div>' +
      '  <div class="today-chip-value">' +
      '    <span class="today-chip-main">' + windKts + 'kt</span>' +
      '    <span class="today-chip-sub">' + windDir + '</span>' +
           svgArrowRotated(arrowDeg) +
      '  </div>' +
      '</div>' +
  
      // Waves chip
      '<div class="today-chip">' +
      '  <div class="today-chip-top">' + svgWave() + '<span class="today-chip-label">Waves</span></div>' +
      '  <div class="today-chip-value">' +
      '    <span class="today-chip-main">' + waveM + 'm</span>' +
      '  </div>' +
      '</div>' +
  
      // Temp chip
      '<div class="today-chip">' +
      '  <div class="today-chip-top">' + svgThermometer() + '<span class="today-chip-label">Temp</span></div>' +
      '  <div class="today-chip-value">' + tempValueHtml + '</div>' +
      '</div>' +
  
      // Condition chip
      '<div class="today-chip today-chip--cond">' +
      '  <div class="today-chip-cond">' +
           svgWeatherFromText(conditionText) +
      '    <span>' + condValue + '</span>' +
      '  </div>' +
      '</div>' +
  
      '</div>' + // today-chips
  
      '</div>' + // today-left
  
      // Right: score badge
      '<div class="today-score-wrap">' +
      '  <div class="today-score-stack">' +
      '    <div class="today-score-label">Boating score</div>' +
      '    <div class="today-score-word">' + ratingWord + '</div>' +
      '    <div class="today-score-circle ' + toneClass + '">' +
      '      <div class="today-score-num">' + (score == null ? '-' : score) + '</div>' +
      '    </div>' +
      '  </div>' +
      '</div>' +
  
      '</div>' // today-grid
  );


  // Keep your existing overall card tone
  applyCardTone(document.getElementById("tideCard"), score);

  // Wire click ? day page
  var tideEl = document.getElementById("tideCard");
  if (tideEl && !tideEl.dataset.daylinkWired) {
    tideEl.dataset.daylinkWired = "1";
    tideEl.style.cursor = "pointer";
    tideEl.addEventListener("click", function (e) {
      if (e && e.target) {
        var a = e.target.closest ? e.target.closest("a") : null;
        if (a) return;
      }
      var date = (dayData && dayData.date) ? dayData.date : todayIsoLondon();
      window.location.href = "./day.html?date=" + encodeURIComponent(date);
    });
  }
}

/* ---------------------------------------------
   Existing UI code
--------------------------------------------- */

function showToast(message) {
  if (!message) return;

  var el = document.createElement("div");
  el.textContent = message;

  // Inline styles so no CSS changes needed.
  el.style.position = "fixed";
  el.style.left = "12px";
  el.style.right = "12px";
  el.style.bottom = "78px"; // above bottom nav
  el.style.zIndex = "9999";
  el.style.padding = "12px 14px";
  el.style.borderRadius = "12px";
  el.style.border = "1px solid rgba(255,255,255,0.12)";
  el.style.background = "rgba(20,24,30,0.95)";
  el.style.color = "#ffffff";
  el.style.fontSize = "14px";
  el.style.fontWeight = "700";
  el.style.boxShadow = "0 10px 24px rgba(0,0,0,0.35)";
  el.style.opacity = "0";
  el.style.transition = "opacity 180ms ease";

  document.body.appendChild(el);

  setTimeout(function () {
    el.style.opacity = "1";
  }, 10);

  setTimeout(function () {
    el.style.opacity = "0";
  }, 2500);

  setTimeout(function () {
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }, 2750);
}

function showToastFromStorage() {
  var msg = localStorage.getItem("skippy_toast") || "";
  if (!msg) return;
  localStorage.removeItem("skippy_toast");
  showToast(msg);
}

function renderWeek(data, loc) {
  setText(
    "location",
    loc && loc.name ? loc.name : (data.location || "South West UK")
  );

  var bestEl = document.getElementById("bestCard");

  // Small, reusable pill for "Best time to boat" using existing colour scheme.
  // - Uses best_time.score (avg window score) to pick the same colour class used elsewhere.
  // - Does NOT try to match the Today/Best Day badge layout.
  function bestTimePillHtml(bestTime) {
    var start = bestTime && bestTime.start ? String(bestTime.start) : "-";
    var end = bestTime && bestTime.end ? String(bestTime.end) : "";
    var score = (bestTime && isFinite(Number(bestTime.score))) ? Number(bestTime.score) : null;

    var text = start;
    if (end) text = start + "-" + end;

    // If no real window, return plain text (no pill)
    if (!end || score == null) {
      return text;
    }

    // Color scheme comes from pillClass(score), visuals from time-pill
    return '<span class="time-pill ' + pillClass(score) + '">' + text + "</span>";
  }

  // Always clear any previous bestCard click handler first (prevents stale links)
  setBestCardClick(bestEl, null);

  // ---- Best day this week card (recommendation) ----
  var daysArr = (data && data.days) ? data.days : [];

  if (!bestEl) {
    // no best card element, continue rendering the rest
  } else if (!daysArr.length) {
    setHtml("bestCard", '<div class="muted small">No data</div>');
    forceToneClass(bestEl, null);
  } else {
    var allAvoid = daysArr.every(function (d) {
      return scoreToWord(d && d.score) === "AVOID";
    });

    var allPoorOrAvoid = daysArr.every(function (d) {
      var w = scoreToWord(d && d.score);
      return (w === "POOR" || w === "AVOID");
    });

    if (allAvoid) {
      setHtml("bestCard", '<div class="best-week-message">Honestly, just stay home!</div>');
      forceToneClass(bestEl, "tone-avoid");
      // no click
    } else if (allPoorOrAvoid) {
      setHtml("bestCard", '<div class="best-week-message">I wouldn’t bother…</div>');
      forceToneClass(bestEl, "tone-poor");
      // no click
    } else {
      // Find best day from the actual week days (so we have a date for navigation)
      var bestDay = daysArr.reduce(function (acc, d) {
        if (!d || d.score == null) return acc;
        if (!acc || d.score > acc.score) return d;
        return acc;
      }, null);

      if (!bestDay) {
        setHtml("bestCard", '<div class="muted small">No data</div>');
        forceToneClass(bestEl, null);
      } else {
        var toneClass = toneClassForScore(bestDay.score); // "tone-ok" etc
        var ratingWord = scoreToWord(bestDay.score);

        setHtml(
          "bestCard",
          "" +
            // Title
            '<div class="today-title">Best day this week</div>' +
            '<div class="spacer"></div>' +
        
            '<div class="best-grid">' +
        
            // LEFT COLUMN
            '  <div class="best-left">' +
            '    <div class="best-dayline">' +
                  (bestDay.dow || "") + (bestDay.dow ? " " : "") + (bestDay.label || "") +
            "    </div>" +
        
            '    <div class="muted small" style="margin-top:6px;">' +
            '      Best time to boat: ' +
                   bestTimePillHtml(bestDay.best_time) +
            "    </div>" +
        
            '    <div class="best-subtle" style="margin-top:8px;">Tap to explore</div>' +
            "  </div>" +
        
            // RIGHT COLUMN — score badge (same as Today)
            '  <div class="today-score-wrap">' +
            '    <div class="today-score-stack">' +
            '      <div class="today-score-label">Boating score</div>' +
            '      <div class="today-score-word">' + ratingWord + "</div>" +
            '      <div class="today-score-circle ' + toneClass + '">' +
            '        <div class="today-score-num">' + bestDay.score + "</div>" +
            "      </div>" +
            "    </div>" +
            "  </div>" +
        
            "</div>"
        );

        // Tint best card based on the recommended day
        forceToneClass(bestEl, toneClass);

        // Click ? recommended day page
        setBestCardClick(bestEl, function (e) {
          if (e && e.target) {
            var a = e.target.closest ? e.target.closest("a") : null;
            if (a) return;
          }
          window.location.href = "./day.html?date=" + encodeURIComponent(bestDay.date);
        });
      }
    }
  }

  // ---- Days list rendering (FIXED: this must be inside renderWeek) ----
  var daysEl = document.getElementById("days");
  if (!daysEl) return;

  daysEl.innerHTML = "";

  var days = data.days || [];
  days.forEach(function (d) {
    var href = "./day.html?date=" + encodeURIComponent(d.date);

    var card = document.createElement("a");
    card.className = "card";
    card.href = href;

    var windKts = d.wind && d.wind.kts != null ? d.wind.kts : 0;
    var windDir = d.wind && d.wind.dir ? d.wind.dir : "-";
    var waveM = d.waves && d.waves.m != null ? d.waves.m : 0;

    var tempC = d.temp_c != null ? d.temp_c : "-";
    var condition = d.condition || "-";
    var dow = d.dow || "";
    var rating = d.rating || "";
    var score = d.score != null ? d.score : 0;

    // Best time pill html (colored if a recommended window exists)
    var bestTimeHtml = bestTimePillHtml(d.best_time);



    card.innerHTML =
      "" +
    
      // TOP AREA: left conditions + right centered score pill
      '<div style="display:flex; align-items:stretch; justify-content:space-between; gap:14px;">' +
    
      // LEFT
      '  <div style="min-width:0;">' +
      '    <div style="font-weight:800; font-size:18px; line-height:1.1;">' + dow + '</div>' +
    
      '    <div class="small muted" style="margin-top:10px;">' +
             svgWind() + 'Max Wind:&nbsp;&nbsp;<span style="font-weight:700; color:rgba(255,255,255,0.92);">' +
             windKts + ' kts ' + windDir +
             '</span>' +
      '    </div>' +
    
      '    <div class="small muted" style="margin-top:10px;">' +
             svgWave() + 'Max Waves (at sea):&nbsp;&nbsp;<span style="font-weight:700; color:rgba(255,255,255,0.92);">' +
             waveM + ' m' +
             '</span>' +
      '    </div>' +
    
      // TEMP + WEATHER (one line after waves)
      '    <div class="small muted" style="margin-top:10px; display:flex; align-items:center; gap:8px;">' +
             svgThermometer() +
      '      <span style="font-weight:800; color:rgba(255,255,255,0.92);">' + tempC + '&deg;C</span>' +
             // weather icon (no text, per your ask)
      '      <span style="display:inline-flex; align-items:center; opacity:0.95;">' +
               svgWeatherFromText(condition) +
      '      </span>' +
      '    </div>' +
      '  </div>' +
    
      // RIGHT: vertically centered pill
      '  <div style="display:flex; align-items:center; justify-content:flex-end;">' +
      '    <div class="' + pillClass(score) + '" style="padding:10px 16px; border-radius:999px; font-weight:900; font-size:18px; line-height:1; white-space:nowrap;">' +
             rating + " (" + score + ")" +
      '    </div>' +
      '  </div>' +
    
      '</div>' +
    
      // BOTTOM: best time full width
      '<div class="spacer"></div>' +
      '<div class="small muted" style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">' +
      '  <span>Best time to boat</span>' +
      '  <span>' + bestTimeHtml + '</span>' +
      '</div>';

    
    

    daysEl.appendChild(card);
  });

  setFooterNote("");
}

function maybeShowSplash() {
  var splash = document.getElementById("splash");
  if (!splash) return;

  // Show once per session (refresh shows again, new tab shows again).
  var seen = sessionStorage.getItem("skippy_splash_seen");
  if (seen) {
    if (splash.parentNode) splash.parentNode.removeChild(splash);
    return;
  }
  sessionStorage.setItem("skippy_splash_seen", "1");

  setTimeout(function () {
    splash.classList.add("splash-hide");

    setTimeout(function () {
      if (splash && splash.parentNode) splash.parentNode.removeChild(splash);
    }, 320);
  }, 800);
}

var DAILY_SCORE_MODE_KEY = "skippy.score.dailyHoursMode";

function getDailyHoursModeForBanner() {
  try {
    var v = localStorage.getItem(DAILY_SCORE_MODE_KEY) || "";
    return v === "daylight" ? "daylight" : "all";
  } catch (e) {
    return "all";
  }
}

function renderHoursModeBanner() {
  var pill = document.getElementById("hoursModePill");
  var card = document.getElementById("hoursModeCard");
  if (!pill || !card) return;

  var mode = getDailyHoursModeForBanner();

  // Reuse your existing pill color scheme
  if (mode === "daylight") {
    pill.className = "pill ok";
    pill.textContent = " Daylight";
  } else {
    pill.className = "pill good";
    pill.textContent = "All hours";
  }

  // Tap goes straight to Settings
  card.onclick = function () {
    window.location.href = "./settings.html";
  };
}

async function main() {
  maybeShowSplash();

  // Show any one-shot toast (eg after location change).
  showToastFromStorage();

  // Wire UI first
  wireHomeTopbar();
  wireLocationBar();
  wireHomeTopbar();
  wireLocationBar();
  renderHoursModeBanner();


  // Get location BEFORE using it (your current code called renderLocationBar(loc) too early)
  var loc = getSavedLocation();

  // Always render the location bar label from current state
  renderLocationBar(loc);

  // On first run (or if storage is cleared), show ONLY the location bar.
  if (!loc) {
    // Make sure the label says "Set location"
    const label = document.getElementById("locationLabel");
    if (label) label.textContent = "Set location";

    // Hide content sections
    const tideCard = document.getElementById("tideCard");
    if (tideCard) tideCard.style.display = "none";

    const bestCard = document.getElementById("bestCard");
    if (bestCard) bestCard.style.display = "none";

    const daysEl = document.getElementById("days");
    if (daysEl) daysEl.innerHTML = "";

    // If you add id="forecastLabel" to the "weekly forecast" label, you can hide it too:
    const forecastLabel = document.getElementById("forecastLabel");
    if (forecastLabel) forecastLabel.style.display = "none";

    setFooterNote("");
    return;
  }

  // Location exists: ensure the main UI is visible (in case we hid it previously)
  const tideCard = document.getElementById("tideCard");
  if (tideCard) tideCard.style.display = "";

  const bestCard = document.getElementById("bestCard");
  if (bestCard) bestCard.style.display = "";

  const forecastLabel = document.getElementById("forecastLabel");
  if (forecastLabel) forecastLabel.style.display = "";

  // Load Today tides first (fast perceived value)
  try {
    var todayIso = todayIsoLondon();
    var todayData = await getDayData(loc.slug, todayIso);
    renderTodayTidesCard(todayData);
  } catch (e) {
    setHtml(
      "tideCard",
      "" +
        '<div class="muted small">Today\'s tides</div>' +
        '<div class="spacer"></div>' +
        '<div class="muted small">Unable to load tides right now.</div>'
    );
  }

  // Then load week
  try {
    var data = await getWeekData(loc.slug);
    renderWeek(data, loc);
  } catch (e) {
    setFooterNote("Error loading data: " + e.message);
  }
}
window.addEventListener("pageshow", function () {
  renderHoursModeBanner();
});


main();
