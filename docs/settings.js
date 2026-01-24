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

// Environment: "coastal" | "estuary" (default coastal)
var SCORE_ENVIRONMENT_KEY = "skippy.score.environment";

// Minimum recommended window hours: integer 1..8 (default 2)
var MIN_RECOMMENDED_WINDOW_HOURS_KEY = "skippy.recommended.minHours";

// ----------------------------
// Small helpers
// ----------------------------

function clampInt(n, a, b) {
  var x = Math.trunc(Number(n));
  if (!isFinite(x)) return a;
  return Math.max(a, Math.min(b, x));
}

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

function getScoreEnvironment() {
  var v = "";
  try {
    v = localStorage.getItem(SCORE_ENVIRONMENT_KEY) || "";
  } catch (e) {
    v = "";
  }
  return v === "estuary" ? "estuary" : "coastal";
}

function setScoreEnvironment(env) {
  try {
    localStorage.setItem(SCORE_ENVIRONMENT_KEY, env === "estuary" ? "estuary" : "coastal");
  } catch (e) {}
}

function getMinRecommendedWindowHours() {
  var v = "";
  try {
    v = localStorage.getItem(MIN_RECOMMENDED_WINDOW_HOURS_KEY) || "";
  } catch (e) {
    v = "";
  }
  if (!v) return 2;
  return clampInt(parseInt(v, 10), 1, 8);
}

function setMinRecommendedWindowHours(n) {
  var v = clampInt(parseInt(n, 10), 1, 8);
  try {
    localStorage.setItem(MIN_RECOMMENDED_WINDOW_HOURS_KEY, String(v));
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

function setupScoreEnvironmentToggle() {
  setupSegmented("scoreEnvironment", "data-env", getScoreEnvironment, setScoreEnvironment);
}

// ----------------------------
// Minimum window select
// ----------------------------

function setupMinWindowHoursSelect() {
  var el = byId("minWindowHours");
  if (!el) return;

  // initial
  var v = getMinRecommendedWindowHours();
  el.value = String(v);

  // change
  el.addEventListener("change", function () {
    setMinRecommendedWindowHours(el.value);
    // keep in sync (clamping might adjust)
    el.value = String(getMinRecommendedWindowHours());
  });
}

// ----------------------------
// Boot
// ----------------------------

document.addEventListener("DOMContentLoaded", function () {
  setText("footerNote", "");

  setupDailyScoreToggle();
  setupScoreProfileToggle();
  setupScoreTempToggle();
  setupScoreEnvironmentToggle();
  setupMinWindowHoursSelect();

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

