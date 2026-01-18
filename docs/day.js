"use strict";

import { pillClass, requireLocationOrRedirect } from "./common/core.js";
import { getDayData } from "./data.js";

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

function renderDay(data, loc) {
  var locName =
    loc && loc.name ? loc.name : (data.location || "South West UK");

  var locEl = document.getElementById("location");
  if (locEl) locEl.textContent = locName;

  var titleEl = document.getElementById("title");
  if (titleEl) titleEl.textContent = data.title || data.date || "";

  // Defensive: make sure these exist even if a backend returns a partial shape
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

  var hours = document.getElementById("hours");
  if (hours) {
    hours.innerHTML = "";
    (data.hours || []).forEach(function (h) {
      var row = document.createElement("div");
      row.className = "row small";
      row.innerHTML =
        '<div style="width:56px;"><b>' +
        h.time +
        "</b></div>" +
        '<div class="muted">Wind ' +
        h.wind_kts +
        " kts</div>" +
        '<div class="muted">Waves ' +
        h.wave_m +
        " m</div>" +
        '<div class="' +
        pillClass(h.score) +
        '">' +
        h.score +
        "</div>";
      hours.appendChild(row);
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
    // getDayData now handles Open-Meteo mapping and worker fallback internally
    var data = await getDayData(loc.slug, dayIso);
    renderDay(data, loc);
  } catch (e) {
    var titleEl2 = document.getElementById("title");
    if (titleEl2) titleEl2.textContent = "Error: " + e.message;
  }
}

main();
