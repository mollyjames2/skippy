"use strict";

function byId(id) {
  return document.getElementById(id);
}

function setText(id, text) {
  var el = byId(id);
  if (!el) return;
  el.textContent = text;
}

function getCurrentLocationLabel() {
  var name = "";
  var group = "";
  try {
    const raw = localStorage.getItem("skippy.location") || "";
    if (raw) {
      const loc = JSON.parse(raw);
      name = loc.name || "";
      group = loc.group || "";
    }
  } catch (e) {}

  if (!name) return "None selected";
  if (group) return name + " (" + group + ")";
  return name;
}

// Daily score preference: "all" | "daylight"
var DAILY_SCORE_MODE_KEY = "skippy.score.dailyHoursMode";

function getDailyScoreMode() {
  var v = "";
  try {
    v = localStorage.getItem(DAILY_SCORE_MODE_KEY) || "";
  } catch (e) {
    v = "";
  }
  return v === "daylight" ? "daylight" : "all";
}

function setDailyScoreMode(mode) {
  try {
    localStorage.setItem(DAILY_SCORE_MODE_KEY, mode === "daylight" ? "daylight" : "all");
  } catch (e) {}
}

function setupDailyScoreToggle() {
  var root = byId("dailyScoreMode");
  if (!root) return;

  function applyActive(mode) {
    var btns = root.querySelectorAll(".segbtn");
    btns.forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-mode") === mode);
    });
  }

  var mode = getDailyScoreMode();
  applyActive(mode);

  root.addEventListener("click", function (e) {
    var target = e.target;
    if (!target) return;
    if (!target.classList.contains("segbtn")) return;

    var next = target.getAttribute("data-mode") === "daylight" ? "daylight" : "all";
    setDailyScoreMode(next);
    applyActive(next);
  });
}

document.addEventListener("DOMContentLoaded", function () {
  setText("footerNote", "");
  

  setupDailyScoreToggle();

  var homeBtn = byId("homeBtn");
  if (homeBtn) {
    homeBtn.addEventListener("click", function () {
      window.location.href = "./index.html";
    });
  }

  var btn = byId("changeLocationBtn");
  if (btn) {
    btn.addEventListener("click", function () {
      window.location.href = "./location.html?from=settings";
    });
  }

  var aboutBtn = byId("aboutBtn");
  if (aboutBtn) {
    aboutBtn.addEventListener("click", function () {
      window.location.href = "./about.html?from=settings";
    });
  }
});
