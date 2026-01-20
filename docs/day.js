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

function parseHHMMToMin(hhmm) {
  // "08:03" -> 483
  var s = String(hhmm || "");
  if (!/^\d\d:\d\d$/.test(s)) return null;
  var h = Number(s.slice(0, 2));
  var m = Number(s.slice(3, 5));
  if (!isFinite(h) || !isFinite(m)) return null;
  return h * 60 + m;
}

function ceilToHour(mins) {
  // 08:03 -> 09:00 (540)
  return Math.ceil(mins / 60) * 60;
}

function floorToHour(mins) {
  // 16:46 -> 16:00 (960)
  return Math.floor(mins / 60) * 60;
}

function filterHours(mode, hours, sunriseHHMM, sunsetHHMM) {
  if (mode !== "daylight") return hours;

  var sr = parseHHMMToMin(sunriseHHMM);
  var ss = parseHHMMToMin(sunsetHHMM);
  if (sr == null || ss == null) return hours;
  if (ss <= sr) return hours;

  // Display hours fully within daylight-ish window:
  // start at the next whole hour after sunrise, end at the previous whole hour before sunset.
  var startMin = ceilToHour(sr);
  var endMin = floorToHour(ss);

  return (hours || []).filter(function (h) {
    var tMin = parseHHMMToMin(h.time);
    if (tMin == null) return true;
    return tMin >= startMin && tMin <= endMin;
  });
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
    var temp = (summaryData.temp_c ?? "\x97");
    var cond = (summaryData.condition ?? "\x97");
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
    var windDir = (tilesData.wind_dir ?? "\x97");

    var waveM = (tilesData.wave_m ?? 0);
    var periodS = (tilesData.period_s ?? "\x97");

    var visKm = (tilesData.visibility_km ?? "\x97");
    var precipMm = (tilesData.precip_mm ?? "\x97");

    var sunrise = (tilesData.sunrise ?? "\x97");
    var sunset = (tilesData.sunset ?? "\x97");

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

  function renderHours(mode) {
    var hoursEl = document.getElementById("hours");
    if (!hoursEl) return;

    var sunrise = tilesData.sunrise;
    var sunset = tilesData.sunset;

    var list = filterHours(mode, data.hours || [], sunrise, sunset);

    hoursEl.innerHTML = "";

    // header row (same structure as before)
    var head = document.createElement("div");
    head.className = "row small muted";
    head.innerHTML =
      '<div style="width:56px;">Time</div>' +
      '<div style="width:56px;">Temp</div>' +
      '<div style="flex:1;">Conditions</div>' +
      '<div style="width:56px; text-align:right;">Score</div>';
    hoursEl.appendChild(head);

    list.forEach(function (h) {
      var row = document.createElement("div");
      row.className = "row small";

      var icon = conditionToIcon(h.condition);
      var cond = h.condition || "";

      // Prefer enriched fields if available, otherwise fall back to old minimal row.
      var hasEnriched = typeof h.wind_dir !== "undefined" || typeof h.wave_period_s !== "undefined";

      var condText;
      if (hasEnriched) {
        var windDir = h.wind_dir || "-";
        var gust = (h.gust_kts != null && h.gust_kts > 0) ? " (gust " + h.gust_kts + ")" : "";
        var windPart = "\ud83c\udf2c " + (h.wind_kts ?? 0) + " kts " + windDir + gust;

        var wavePart = "\ud83c\udf0a " + (h.wave_m ?? 0) + " m";
        if (h.wave_period_s != null && h.wave_period_s > 0) wavePart += " @ " + h.wave_period_s + " s";

        var extras = "";
        if (h.precip_mm != null && h.precip_mm > 0) extras += " \u00b7 \ud83c\udf27 " + h.precip_mm + " mm";
        if (h.visibility_km != null) extras += " \u00b7 \ud83d\udc41 " + h.visibility_km + " km";

        condText = icon + " " + cond + " \u00b7 " + windPart + " \u00b7 " + wavePart + extras;
      } else {
        condText = icon + " " + cond + " \u00b7 Wind " + (h.wind_kts ?? 0) + " kts \u00b7 Waves " + (h.wave_m ?? 0) + " m";
      }

      row.innerHTML =
        '<div style="width:56px;"><b>' + h.time + "</b></div>" +
        '<div style="width:56px;" class="muted">' + (h.temp_c ?? "\x97") + "\u00b0</div>" +
        '<div class="muted" style="flex:1;">' + condText + "</div>" +
        '<div class="' + pillClass(h.score) + '" style="width:56px; text-align:center;">' +
        (h.score ?? 0) +
        "</div>";

      hoursEl.appendChild(row);
    });
  }

  // Initial render + attach toggle behavior
  renderHours(getHoursMode());
  setupToggle(function (mode) {
    renderHours(mode);
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
