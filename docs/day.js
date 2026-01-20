"use strict";

import { pillClass, requireLocationOrRedirect } from "./common/core.js";
import { getDayData } from "./data.js";

const HOURS_MODE_KEY = "skippy.day.hoursMode"; // "all" | "daylight"

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

function getHoursMode() {
  var v = localStorage.getItem(HOURS_MODE_KEY);
  return v === "daylight" ? "daylight" : "all";
}

function setHoursMode(mode) {
  localStorage.setItem(HOURS_MODE_KEY, mode === "daylight" ? "daylight" : "all");
}

function setupToggle(onChange) {
  var root = document.getElementById("hoursToggle");
  if (!root) return;

  function applyActive(mode) {
    var btns = root.querySelectorAll(".segbtn");
    btns.forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-mode") === mode);
    });
  }

  var mode = getHoursMode();
  applyActive(mode);

  root.addEventListener("click", function (e) {
    var target = e.target;
    if (!target) return;
    if (!target.classList.contains("segbtn")) return;

    var next = target.getAttribute("data-mode") === "daylight" ? "daylight" : "all";
    setHoursMode(next);
    applyActive(next);
    if (typeof onChange === "function") onChange(next);
  });
}

function parseHHMMToMin(hhmm) {
  var s = String(hhmm || "");
  if (!/^\d\d:\d\d$/.test(s)) return null;
  var h = Number(s.slice(0, 2));
  var m = Number(s.slice(3, 5));
  if (!isFinite(h) || !isFinite(m)) return null;
  return h * 60 + m;
}

function ceilToHour(mins) {
  return Math.ceil(mins / 60) * 60;
}

function floorToHour(mins) {
  return Math.floor(mins / 60) * 60;
}

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
    return tMin >= startMin && tMin <= endMin;
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

    // Extras line (optional)
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

function renderDay(data, loc) {
  var locName = loc && loc.name ? loc.name : (data.location || "South West UK");

  var locEl = document.getElementById("location");
  if (locEl) locEl.textContent = locName;

  var titleEl = document.getElementById("title");
  if (titleEl) titleEl.textContent = data.title || data.date || "";

  var summaryData = data.summary || {};
  var tilesData = data.tiles || {};

  var summary = document.getElementById("summary");
  if (summary) {
    var temp = (summaryData.temp_c ?? "—");
    var cond = (summaryData.condition ?? "—");
    var score = (summaryData.score ?? 0);

    summary.innerHTML =
      "" +
      '<div class="row">' +
      "  <div>" +
      '    <div class="big">' + temp + "&deg;C</div>" +
      '    <div class="muted">' + cond + "</div>" +
      "  </div>" +
      '  <div style="text-align:right;">' +
      '    <div class="muted small">Boating Score</div>' +
      '    <div class="' + pillClass(score) + '" style="font-size:16px;">' +
      score +
      "</div>" +
      "  </div>" +
      "</div>";
  }

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
      var row = document.createElement("div");
      row.className = "row";
      row.innerHTML =
        "<div><b>" +
        t.type +
        ' Tide</b> <span class="muted small">' +
        t.time +
        "</span></div>" +
        '<div class="muted small">' +
        t.height_m +
        " m</div>";
      tides.appendChild(row);
    });
  }

  var windows = document.getElementById("windows");
  if (windows) {
    windows.innerHTML = "";
    (data.recommended || []).forEach(function (w) {
      var row = document.createElement("div");
      row.className = "row";
      row.innerHTML =
        "<div><b>" +
        w.start +
        " - " +
        w.end +
        "</b></div>" +
        '<div class="muted small">' +
        w.score +
        "/100</div>";
      windows.appendChild(row);
    });
  }

  var hoursEl = document.getElementById("hours");
  if (hoursEl) {
    var sunriseHHMM = tilesData.sunrise;
    var sunsetHHMM = tilesData.sunset;

    function rerender(mode) {
      renderHourlyTable(hoursEl, mode, data.hours || [], sunriseHHMM, sunsetHHMM);
    }

    rerender(getHoursMode());
    setupToggle(function (mode) {
      rerender(mode);
    });
  }
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
