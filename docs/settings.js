"use strict";

import {
  getDailyScoreMode, setDailyScoreMode,
  getScoreProfile,   setScoreProfile,
  getScoreTemp,      setScoreTemp,
  getScoreFairWeather, setScoreFairWeather,
  getScoreEnvironment, setScoreEnvironment,
  getMinRecommendedWindowHours, setMinRecommendedWindowHours,
  getMooringHighNoAccessHours,  setMooringHighNoAccessHours,
  getMooringLowNoAccessHours,   setMooringLowNoAccessHours,
} from "./common/settings.js";

function byId(id) {
  return document.getElementById(id);
}

function setText(id, text) {
  const el = byId(id);
  if (!el) return;
  el.textContent = text;
}

// ----------------------------
// Segmented controls helpers
// ----------------------------

function setupSegmented(rootId, btnAttr, getValue, setValue) {
  const root = byId(rootId);
  if (!root) return;

  function applyActive(value) {
    root.querySelectorAll(".segbtn").forEach(function (b) {
      b.classList.toggle("active", b.getAttribute(btnAttr) === value);
    });
  }

  applyActive(getValue());

  root.addEventListener("click", function (e) {
    const target = e.target;
    if (!target || !target.classList.contains("segbtn")) return;
    const next = target.getAttribute(btnAttr);
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

function setupScoreFairWeatherToggle() {
  setupSegmented("scoreFairWeather", "data-fair", getScoreFairWeather, setScoreFairWeather);
}

function setupScoreEnvironmentToggle() {
  setupSegmented("scoreEnvironment", "data-env", getScoreEnvironment, setScoreEnvironment);
}

// ----------------------------
// Minimum window select
// ----------------------------

function setupMinWindowHoursSelect() {
  const el = byId("minWindowHours");
  if (!el) return;

  el.value = String(getMinRecommendedWindowHours());

  el.addEventListener("change", function () {
    setMinRecommendedWindowHours(el.value);
    el.value = String(getMinRecommendedWindowHours()); // re-read in case clamping adjusted
  });
}

// ----------------------------
// Mooring access selects
// ----------------------------

function setupMooringNoAccessSelect(selectId, getValue, setValue) {
  const el = byId(selectId);
  if (!el) return;

  el.value = String(getValue());

  el.addEventListener("change", function () {
    setValue(el.value);
    el.value = String(getValue());
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
  setupScoreFairWeatherToggle();
  setupScoreEnvironmentToggle();
  setupMinWindowHoursSelect();
  setupMooringNoAccessSelect("mooringHighNoAccess", getMooringHighNoAccessHours, setMooringHighNoAccessHours);
  setupMooringNoAccessSelect("mooringLowNoAccess", getMooringLowNoAccessHours, setMooringLowNoAccessHours);

  const homeBtn = byId("homeBtn");
  if (homeBtn) {
    homeBtn.addEventListener("click", function () {
      window.location.href = "./index.html";
    });
  }

  const aboutBtn = byId("aboutBtn");
  if (aboutBtn) {
    aboutBtn.addEventListener("click", function () {
      window.location.href = "./about.html?from=settings";
    });
  }
});
