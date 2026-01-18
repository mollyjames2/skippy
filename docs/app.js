"use strict";

import { pillClass, requireLocationOrRedirect } from "./common/core.js";
import { getWeekData } from "./data.js";


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


async function fetchWeek(apiBase, slug) {
  var base = apiBase.replace(/\/+$/, "");
  var url = base + "/api/week?slug=" + encodeURIComponent(slug || "");
  var resp = await fetch(url, { method: "GET" });
  if (!resp.ok) throw new Error("API error: " + resp.status);
  return await resp.json();
}


function renderWeek(data, loc) {
  setText(
    "location",
    (loc && loc.name) ? loc.name : (data.location || "South West UK"),
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
        '    <div style="font-weight:800; font-size:18px;">' + best.dow + " " +
        best.label + "</div>" +
        '    <div class="muted small">Best window: ' + best.best_time.start +
        " - " + best.best_time.end + "</div>" +
        "  </div>" +
        '  <div class="' + pillClass(best.score) +
        '" style="font-size:16px;">' + best.score + "</div>" +
        "</div>",
    );
  } else {
    setHtml("bestCard", '<div class="muted small">No data</div>');
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

    card.innerHTML = "" +
      '<div class="row">' +
      "  <div>" +
      '    <div style="font-weight:800;">' + d.dow + "</div>" +
      '    <div class="muted small">' + d.condition + "</div>" +
      "  </div>" +
      '  <div style="text-align:right;">' +
      '    <div style="font-weight:800;">' + d.temp_c + "&deg;C</div>" +
      '    <div class="' + pillClass(d.score) + '">' + d.rating + "</div>" +
      "  </div>" +
      "</div>" +
      '<div class="spacer"></div>' +
      '<div class="row small muted">' +
      "  <div>Wind: " + d.wind.kts + " kts " + d.wind.dir + "</div>" +
      "  <div>Waves: " + d.waves.m + " m</div>" +
      "</div>" +
      '<div class="spacer"></div>' +
      '<div class="muted small">Best time to boat: <b>' + d.best_time.start +
      " - " + d.best_time.end + "</b></div>";

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
  wireHomeTopbar();

  var loc = requireLocationOrRedirect();
  if (!loc) return;

  const apiBase = window.SKIPPY_API_BASE;
  if (!apiBase) {
    setFooterNote("Missing API configuration.");
    return;
  }

  try {
    var data = await getWeekData(loc.slug);
    renderWeek(data, loc);
  } catch (e) {
    setFooterNote("Error loading data: " + e.message);
  }
}


main();
