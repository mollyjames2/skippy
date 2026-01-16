"use strict";

function getSettings() {
  return {
    homeLabel: localStorage.getItem("skippy_homeLabel") || "South Devon UK"
  };
}

function pillClass(score) {
  if (score >= 80) return "pill excellent";
  if (score >= 60) return "pill good";
  if (score >= 40) return "pill fair";
  return "pill poor";
}

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

async function fetchWeek(apiBase) {
  var url = apiBase.replace(/\/+$/, "") + "/api/week";
  var resp = await fetch(url, { method: "GET" });
  if (!resp.ok) throw new Error("API error: " + resp.status);
  return await resp.json();
}

function renderWeek(data) {
  setText("location", data.location || "South Devon UK");

  var best = data.best_day || null;
  if (best) {
    setHtml(
      "bestCard",
      ""
        + '<div class="muted small">Best day this week</div>'
        + '<div class="spacer"></div>'
        + '<div class="row">'
        + '  <div>'
        + '    <div style="font-weight:800; font-size:18px;">' + best.dow + " " + best.label + "</div>"
        + '    <div class="muted small">Best window: ' + best.best_time.start + " - " + best.best_time.end + "</div>"
        + "  </div>"
        + '  <div class="' + pillClass(best.score) + '" style="font-size:16px;">' + best.score + "</div>"
        + "</div>"
    );
  } else {
    setHtml("bestCard", '<div class="muted small">No data</div>');
  }

  var daysEl = document.getElementById("days");
  if (!daysEl) return;

  daysEl.innerHTML = "";

  var days = data.days || [];
  days.forEach(function(d) {
    var href = "./day.html?date=" + encodeURIComponent(d.date);

    var card = document.createElement("a");
    card.className = "card";
    card.href = href;

    card.innerHTML =
      ""
        + '<div class="row">'
        + '  <div>'
        + '    <div style="font-weight:800;">' + d.dow + "</div>"
        + '    <div class="muted small">' + d.condition + "</div>"
        + "  </div>"
        + '  <div style="text-align:right;">'
        + '    <div style="font-weight:800;">' + d.temp_c + "&deg;C</div>"
        + '    <div class="' + pillClass(d.score) + '">' + d.rating + "</div>"
        + "  </div>"
        + "</div>"
        + '<div class="spacer"></div>'
        + '<div class="row small muted">'
        + "  <div>Wind: " + d.wind.kts + " kts " + d.wind.dir + "</div>"
        + "  <div>Waves: " + d.waves.m + " m</div>"
        + "</div>"
        + '<div class="spacer"></div>'
        + '<div class="muted small">Best time to boat: <b>' + d.best_time.start + " - " + d.best_time.end + "</b></div>";

    daysEl.appendChild(card);
  });

  setFooterNote("");
}

async function main() {
  var s = getSettings();
  void s;

  if (typeof SKIPPY_API_BASE === "undefined" || !SKIPPY_API_BASE) {
    setFooterNote("Missing API configuration.");
    return;
  }

  try {
    var data = await fetchWeek(SKIPPY_API_BASE);
    renderWeek(data);
  } catch (e) {
    setFooterNote("Error loading data: " + e.message);
  }
}

main();
