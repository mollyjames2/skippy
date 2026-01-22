"use strict";

function byId(id) {
  return document.getElementById(id);
}

function setText(id, text) {
  var el = byId(id);
  if (!el) return;
  el.textContent = text;
}

// ----------------------------
// Storage keys
// ----------------------------

// Daily score preference: "all" | "daylight"
var DAILY_SCORE_MODE_KEY = "skippy.score.dailyHoursMode";

// Scoring profile: "safety" | "standard" | "opportunity"
var SCORE_PROFILE_KEY = "skippy.score.profile";

// Temperature toggle: "on" | "off"
var SCORE_TEMP_KEY = "skippy.score.includeTemp";

// ----------------------------
// Getters / setters
// ----------------------------

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

function getScoreProfile() {
  var v = "";
  try {
    v = localStorage.getItem(SCORE_PROFILE_KEY) || "";
  } catch (e) {
    v = "";
  }
  if (v === "safety" || v === "opportunity") return v;
  return "standard";
}

function setScoreProfile(profile) {
  var p = profile === "safety" || profile === "opportunity" ? profile : "standard";
  try {
    localStorage.setItem(SCORE_PROFILE_KEY, p);
  } catch (e) {}
}

function getScoreTemp() {
  var v = "";
  try {
    v = localStorage.getItem(SCORE_TEMP_KEY) || "";
  } catch (e) {
    v = "";
  }
  return v === "on" ? "on" : "off";
}

function setScoreTemp(v) {
  try {
    localStorage.setItem(SCORE_TEMP_KEY, v === "on" ? "on" : "off");
  } catch (e) {}
}

// ----------------------------
// Segmented controls helpers
// ----------------------------

function setupSegmented(rootId, btnAttr, getValue, setValue) {
  var root = byId(rootId);
  if (!root) return;

  function applyActive(value) {
    var btns = root.querySelectorAll(".segbtn");
    btns.forEach(function (b) {
      b.classList.toggle("active", b.getAttribute(btnAttr) === value);
    });
  }

  // initial
  var current = getValue();
  applyActive(current);

  // click
  root.addEventListener("click", function (e) {
    var target = e.target;
    if (!target) return;
    if (!target.classList.contains("segbtn")) return;

    var next = target.getAttribute(btnAttr);
    if (!next) return;

    setValue(next);
    applyActive(getValue());
  });
}

function setupDailyScoreToggle() {
  setupSegmented("dailyScoreMode", "data-mode", getDailyScoreMode, setDailyScoreMode);
}

function setupScoreProfileToggle() {
  setupSegmented("scoreProfile", "data-profile", getScoreProfile, setScoreProfile);
}

function setupScoreTempToggle() {
  setupSegmented("scoreTemp", "data-temp", getScoreTemp, setScoreTemp);
}

// ----------------------------
// Boot
// ----------------------------

document.addEventListener("DOMContentLoaded", function () {
  setText("footerNote", "");

  setupDailyScoreToggle();
  setupScoreProfileToggle();
  setupScoreTempToggle();

  var homeBtn = byId("homeBtn");
  if (homeBtn) {
    homeBtn.addEventListener("click", function () {
      window.location.href = "./index.html";
    });
  }

  var aboutBtn = byId("aboutBtn");
  if (aboutBtn) {
    aboutBtn.addEventListener("click", function () {
      window.location.href = "./about.html?from=settings";
    });
  }
});
