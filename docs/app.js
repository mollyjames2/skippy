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



function renderTodayTidesCard(dayData) {
  var tides = (dayData && dayData.tides) ? dayData.tides : [];
  var meta = (dayData && dayData.tides_meta) ? dayData.tides_meta : null;

  // Title line (optionally show station name)
  var stationName = meta && meta.station && meta.station.name ? meta.station.name : "";
  var title = "Today at a glance"
  //var title = "Today at a glance" + (stationName ? " (" + stationName + ")" : "");
  var todayScore = dayData && dayData.summary ? dayData.summary.score : null;

  // Next tide:
  // 1) Prefer the next tide event *today* from today's event list (do not roll past times into tomorrow)
  // 2) If there are none left today, fall back to tomorrow's *modelled* extrema (15-min curve)
  var next = findNextTideEvent(tides, 0);
  if (!next) {
    var tomorrowModel = (dayData && dayData.tides_tomorrow_model) ? dayData.tides_tomorrow_model : [];
    if (tomorrowModel && tomorrowModel.length) {
      next = findNextTideEvent(tomorrowModel, 1);
    }
  }

  // Footer / caveat message
  var footer = "";
  if (meta && meta.source === "tidetimes") {
    var t = formatUpdatedAtLondon(meta.updated_at);
    footer = "Data accessed from Tide Times" + (t ? " - last updated " + t : "");
  } else {
    // Model fallback / none
    footer =
      (meta && meta.message)
        ? meta.message
        : "High accuracy tidal data not available - using 15 minute modelled tide predictions";
  }

  // Render events (up to 6)
  var lines = "";
  if (tides && tides.length) {
    lines = tides
      .slice(0, 6)
      .map(function (e) {
        var hm = (e.height_m != null && isFinite(Number(e.height_m)))
          ? " (" + Number(e.height_m).toFixed(2).replace(/\.00$/, "") + "m)"
          : "";
        return (
          '<div class="muted small">' +
          (e.type || "-") +
          " Tide: <b>" +
          (e.time || "-") +
          "</b>" +
          hm +
          "</div>"
        );
      })
      .join("");
  } else {
    lines = '<div class="muted small">No tide data available.</div>';
  }
  var nextLine = "";
  if (next) {
    nextLine =
      '<div class="row">' +
      '  <div>' +
      '    <div style="font-weight:800; font-size:18px;">Next: ' +
      (next.type || "-") +
      ' tide</div>' +
      '    <div class="muted small">In ' +
      formatMins(next.mins) +
      " - at <b>" +
      next.time +
      "</b></div>" +
      "  </div>" +
      '  <div class="hero-score">' + (todayScore == null ? "-" : todayScore) + "</div>" +
      "</div>" +
      '<div class="spacer"></div>';
  } else {
    nextLine =
      '<div class="row">' +
      '  <div class="muted small">Next tide: -</div>' +
      '  <div class="hero-score">' + (todayScore == null ? "-" : todayScore) + "</div>" +
      "</div>" +
      '<div class="spacer"></div>';
  }
  
  setHtml(
    "tideCard",
    "" +
      '<div class="muted small">' + title + "</div>" +
      '<div class="spacer"></div>' +
      nextLine +
      lines +
      '<div class="spacer"></div>' +
      '<div class="muted small">' + footer + "</div>"
  );
  var todayScore = dayData && dayData.summary ? dayData.summary.score : null;
  applyCardTone(document.getElementById("tideCard"), todayScore);
  // Make the whole "Today's tides" card open the Day view for today.
  // (Ignore clicks on any links inside the card.)
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

  var best = data.best_day || null;
  if (best) {
    setHtml(
      "bestCard",
      "" +
        '<div class="muted small">Best day this week</div>' +
        '<div class="spacer"></div>' +
        '<div class="row">' +
        "  <div>" +
        '    <div style="font-weight:800; font-size:18px;">' +
        best.dow +
        " " +
        best.label +
        "</div>" +
        '    <div class="muted small">Best window: ' +
        best.best_time.start +
        " - " +
        best.best_time.end +
        "</div>" +
        '  <div class="hero-score">' + best.score + "</div>" +
        "</div>"
    );
    applyCardTone(document.getElementById("bestCard"), best.score);

  } else {
    setHtml("bestCard", '<div class="muted small">No data</div>');
    applyCardTone(document.getElementById("bestCard"), null);

  }

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

    var bestStart = d.best_time && d.best_time.start ? d.best_time.start : "-";
    var bestEnd = d.best_time && d.best_time.end ? d.best_time.end : "-";

    card.innerHTML =
      "" +
      '<div class="row">' +
      "  <div>" +
      '    <div style="font-weight:800;">' +
      dow +
      "</div>" +
      '    <div class="muted small">' +
      condition +
      "</div>" +
      "  </div>" +
      '  <div style="text-align:right;">' +
      '    <div style="font-weight:800;">' +
      tempC +
      "&deg;C</div>" +
      '    <div class="' +
      pillClass(score) +
      '">' +
      rating +
      "</div>" +
      "  </div>" +
      "</div>" +
      '<div class="spacer"></div>' +
      '<div class="row small muted">' +
      "  <div>Wind: " +
      windKts +
      " kts " +
      windDir +
      "</div>" +
      "  <div>Waves: " +
      waveM +
      " m</div>" +
      "</div>" +
      '<div class="spacer"></div>' +
      '<div class="muted small">Best time to boat: <b>' +
      bestStart +
      " - " +
      bestEnd +
      "</b></div>";

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

async function main() {
  maybeShowSplash();

  // Show any one-shot toast (eg after location change).
  showToastFromStorage();

  // Wire UI first
  wireHomeTopbar();
  wireLocationBar();

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

    // If you add id="forecastLabel" to the "7-day forecast" label, you can hide it too:
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

main();
