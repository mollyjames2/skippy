"use strict";

function pillClass(score) {
  if (score >= 80) return "pill excellent";
  if (score >= 60) return "pill good";
  if (score >= 40) return "pill fair";
  return "pill poor";
}

function requireLocationOrRedirect() {
  var slug = localStorage.getItem("skippy_locationSlug") || "";
  if (!slug) {
    window.location.href = "./location.html";
    return null;
  }
  return {
    slug: slug,
    name: localStorage.getItem("skippy_locationName") || "South West UK",
    group: localStorage.getItem("skippy_locationGroup") || ""
  };
}

function getDateParam() {
  var p = new URLSearchParams(window.location.search);
  return p.get("date") || "";
}

async function fetchDay(apiBase, dayIso) {
  var base = apiBase.replace(/\/+$/, "");
  var url = base + "/api/day?day_iso=" + encodeURIComponent(dayIso);
  var resp = await fetch(url, { method: "GET" });
  if (!resp.ok) throw new Error("API error: " + resp.status);
  return await resp.json();
}

function tileHtml(label, main, sub) {
  return ""
    + '<div class="tile">'
    + '  <div class="muted small">' + label + "</div>"
    + '  <div style="font-weight:800;">' + main + "</div>"
    + '  <div class="muted small">' + sub + "</div>"
    + "</div>";
}

function renderDay(data, loc) {
  var locName = (loc && loc.name) ? loc.name : (data.location || "South West UK");
  document.getElementById("location").textContent = locName;
  document.getElementById("title").textContent = data.title || data.date;

  var summary = document.getElementById("summary");
  summary.innerHTML = ""
    + '<div class="row">'
    + '  <div>'
    + '    <div class="big">' + data.summary.temp_c + "&deg;C</div>"
    + '    <div class="muted">' + data.summary.condition + "</div>"
    + "  </div>"
    + '  <div style="text-align:right;">'
    + '    <div class="muted small">Boating Score</div>'
    + '    <div class="' + pillClass(data.summary.score) + '" style="font-size:16px;">'
    + data.summary.score
    + "</div>"
    + "  </div>"
    + "</div>";

  var tiles = document.getElementById("tiles");
  tiles.innerHTML = ""
    + tileHtml("Wind", data.tiles.wind_kts + " kts", "Gusts " + data.tiles.gust_kts + " kts " + data.tiles.wind_dir)
    + tileHtml("Waves", data.tiles.wave_m + " m", "Period " + data.tiles.period_s + " s")
    + tileHtml("Visibility", data.tiles.visibility_km + " km", "Precip " + data.tiles.precip_mm + " mm")
    + tileHtml("Daylight", "Sunrise " + data.tiles.sunrise, "Sunset " + data.tiles.sunset);

  var tides = document.getElementById("tides");
  tides.innerHTML = "";
  (data.tides || []).forEach(function(t) {
    var row = document.createElement("div");
    row.className = "row";
    row.innerHTML = '<div><b>' + t.type + " Tide</b> <span class=\"muted small\">" + t.time + "</span></div>"
      + '<div class="muted small">' + t.height_m + " m</div>";
    tides.appendChild(row);
  });

  var windows = document.getElementById("windows");
  windows.innerHTML = "";
  (data.recommended || []).forEach(function(w) {
    var row = document.createElement("div");
    row.className = "row";
    row.innerHTML = "<div><b>" + w.start + " - " + w.end + "</b></div>"
      + '<div class="muted small">' + w.score + "/100</div>";
    windows.appendChild(row);
  });

  var hours = document.getElementById("hours");
  hours.innerHTML = "";
  (data.hours || []).forEach(function(h) {
    var row = document.createElement("div");
    row.className = "row small";
    row.innerHTML = '<div style="width:56px;"><b>' + h.time + "</b></div>"
      + '<div class="muted">Wind ' + h.wind_kts + " kts</div>"
      + '<div class="muted">Waves ' + h.wave_m + " m</div>"
      + '<div class="' + pillClass(h.score) + '">' + h.score + "</div>";
    hours.appendChild(row);
  });
}

async function main() {
  var loc = requireLocationOrRedirect();
  if (!loc) return;

  if (typeof SKIPPY_API_BASE === "undefined" || !SKIPPY_API_BASE) {
    document.getElementById("title").textContent = "Missing API configuration";
    return;
  }

  var dayIso = getDateParam();
  if (!dayIso) {
    document.getElementById("title").textContent = "Missing date parameter";
    return;
  }

  try {
    var data = await fetchDay(SKIPPY_API_BASE, dayIso);
    renderDay(data, loc);
  } catch (e) {
    document.getElementById("title").textContent = "Error: " + e.message;
  }
}

main();
