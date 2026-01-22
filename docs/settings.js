// docs/settings.js

// Storage keys
const DAILY_SCORE_HOURS_MODE_KEY = "skippy.score.dailyHoursMode"; // "all" | "daylight"
const SCORE_PROFILE_KEY = "skippy.score.profile"; // "safety" | "standard" | "opportunity"
const SCORE_TEMP_KEY = "skippy.score.includeTemp"; // "on" | "off"

// Defaults
const DEFAULT_DAILY_HOURS_MODE = "all";
const DEFAULT_SCORE_PROFILE = "standard";
const DEFAULT_SCORE_TEMP = "off";

function $(sel) {
  return document.querySelector(sel);
}

function clampToAllowed(value, allowed, fallback) {
  if (allowed.includes(value)) return value;
  return fallback;
}

/* -----------------------------
   Daily hours mode (existing)
------------------------------ */

function getDailyHoursMode() {
  try {
    const v = localStorage.getItem(DAILY_SCORE_HOURS_MODE_KEY);
    return clampToAllowed(v, ["all", "daylight"], DEFAULT_DAILY_HOURS_MODE);
  } catch (e) {
    return DEFAULT_DAILY_HOURS_MODE;
  }
}

function setDailyHoursMode(v) {
  try {
    localStorage.setItem(DAILY_SCORE_HOURS_MODE_KEY, v);
  } catch (e) {}
}

/* -----------------------------
   Score profile (new)
------------------------------ */

function getScoreProfile() {
  try {
    const v = localStorage.getItem(SCORE_PROFILE_KEY);
    return clampToAllowed(v, ["safety", "standard", "opportunity"], DEFAULT_SCORE_PROFILE);
  } catch (e) {
    return DEFAULT_SCORE_PROFILE;
  }
}

function setScoreProfile(v) {
  try {
    localStorage.setItem(SCORE_PROFILE_KEY, v);
  } catch (e) {}
}

/* -----------------------------
   Include temperature (new)
------------------------------ */

function getIncludeTemp() {
  try {
    const v = localStorage.getItem(SCORE_TEMP_KEY);
    return clampToAllowed(v, ["on", "off"], DEFAULT_SCORE_TEMP);
  } catch (e) {
    return DEFAULT_SCORE_TEMP;
  }
}

function setIncludeTemp(v) {
  try {
    localStorage.setItem(SCORE_TEMP_KEY, v);
  } catch (e) {}
}

/* -----------------------------
   Segmented controls helpers
------------------------------ */

function initSegment(groupEl, value, onChange) {
  if (!groupEl) return;

  const buttons = Array.from(groupEl.querySelectorAll("[data-value]"));

  function apply(v) {
    buttons.forEach((btn) => {
      const isOn = btn.getAttribute("data-value") === v;
      btn.classList.toggle("is-active", isOn);
      btn.setAttribute("aria-pressed", isOn ? "true" : "false");
    });
  }

  function handleClick(e) {
    const btn = e.target.closest("[data-value]");
    if (!btn) return;
    const v = btn.getAttribute("data-value");
    if (!v) return;
    apply(v);
    onChange(v);
  }

  groupEl.addEventListener("click", handleClick);

  // keyboard support (left/right)
  groupEl.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();

    const activeIdx = buttons.findIndex((b) => b.classList.contains("is-active"));
    if (activeIdx < 0) return;

    const nextIdx =
      e.key === "ArrowRight"
        ? Math.min(activeIdx + 1, buttons.length - 1)
        : Math.max(activeIdx - 1, 0);

    const next = buttons[nextIdx];
    if (!next) return;
    const v = next.getAttribute("data-value");
    if (!v) return;

    apply(v);
    onChange(v);
    next.focus();
  });

  apply(value);
}

/* -----------------------------
   Boot
------------------------------ */

function init() {
  // Existing daily mode segment (if present)
  const dailyModeEl = $("#dailyScoreHoursMode");
  if (dailyModeEl) {
    initSegment(dailyModeEl, getDailyHoursMode(), (v) => {
      setDailyHoursMode(v);
    });
  }

  // New: scoring profile
  const profileEl = $("#scoreProfile");
  if (profileEl) {
    initSegment(profileEl, getScoreProfile(), (v) => {
      setScoreProfile(v);
    });
  }

  // New: include temperature
  const tempEl = $("#scoreIncludeTemp");
  if (tempEl) {
    initSegment(tempEl, getIncludeTemp(), (v) => {
      setIncludeTemp(v);
    });
  }
}

document.addEventListener("DOMContentLoaded", init);
