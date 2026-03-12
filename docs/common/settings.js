// docs/common/settings.js
// Single source of truth for settings storage keys, helper functions, and
// localStorage accessors. Imported by data.js, day.js, today.js, and settings.js.

// ---- Storage keys ----

export const DAILY_SCORE_MODE_KEY = "skippy.score.dailyHoursMode";       // "all" | "daylight"
export const SCORE_PROFILE_KEY = "skippy.score.profile";                 // "safety" | "standard" | "opportunity"
export const SCORE_TEMP_KEY = "skippy.score.includeTemp";                // "on" | "off"
export const SCORE_ENVIRONMENT_KEY = "skippy.score.environment";         // "coastal" | "estuary"
export const SCORE_FAIR_WEATHER_KEY = "skippy.score.fairWeatherSailor";  // "on" | "off"
export const MIN_RECOMMENDED_WINDOW_HOURS_KEY = "skippy.recommended.minHours"; // int 1..8
export const MOORING_HIGH_NO_ACCESS_HOURS_KEY = "skippy.mooring.noAccess.highHours";
export const MOORING_LOW_NO_ACCESS_HOURS_KEY = "skippy.mooring.noAccess.lowHours";

// ---- Helpers ----

export function clampInt(n, a, b) {
  const x = Math.trunc(Number(n));
  if (!Number.isFinite(x)) return a;
  return Math.max(a, Math.min(b, x));
}

export function clampMooringHours(v) {
  // Allowed: 0, 0.5, 1, 1.5, 2, 2.5, 3
  const x = Number(v);
  if (!Number.isFinite(x)) return 0;
  const snapped = Math.round(x * 2) / 2;
  return Math.min(3, Math.max(0, snapped));
}

// ---- Getters ----

/**
 * Returns "all" | "daylight".
 * Used by UI pages (day.js, today.js, app.js).
 */
export function getDailyScoreMode() {
  try {
    const v = localStorage.getItem(DAILY_SCORE_MODE_KEY) || "";
    return v === "daylight" ? "daylight" : "all";
  } catch (e) {
    return "all";
  }
}

/**
 * Returns "allhours" | "daylight".
 * The scoring module expects "allhours" not "all", hence the separate getter.
 * Used by data.js.
 */
export function getDailyScoreHoursMode() {
  try {
    const v = localStorage.getItem(DAILY_SCORE_MODE_KEY);
    return v === "daylight" ? "daylight" : "allhours";
  } catch (e) {
    return "allhours";
  }
}

export function getScoreProfile() {
  try {
    const v = localStorage.getItem(SCORE_PROFILE_KEY);
    if (v === "safety" || v === "opportunity") return v;
    return "standard";
  } catch (e) {
    return "standard";
  }
}

export function getScoreTemp() {
  try {
    const v = localStorage.getItem(SCORE_TEMP_KEY);
    return v === "on" ? "on" : "off";
  } catch (e) {
    return "off";
  }
}

/** Returns boolean; used by scoring functions in data.js. */
export function getScoreTempEnabled() {
  return getScoreTemp() === "on";
}

export function getScoreEnvironment() {
  try {
    const v = localStorage.getItem(SCORE_ENVIRONMENT_KEY);
    return v === "estuary" ? "estuary" : "coastal";
  } catch (e) {
    return "coastal";
  }
}

export function getScoreFairWeather() {
  try {
    const v = localStorage.getItem(SCORE_FAIR_WEATHER_KEY);
    return v === "on" ? "on" : "off";
  } catch (e) {
    return "off";
  }
}

/** Returns boolean; used by scoring functions in data.js. */
export function getFairWeatherSailor() {
  return getScoreFairWeather() === "on";
}

export function getMinRecommendedWindowHours() {
  try {
    const raw = localStorage.getItem(MIN_RECOMMENDED_WINDOW_HOURS_KEY);
    if (raw == null || raw === "") return 2;
    return clampInt(parseInt(raw, 10), 1, 8);
  } catch (e) {
    return 2;
  }
}

export function getMooringHighNoAccessHours() {
  try {
    const v = localStorage.getItem(MOORING_HIGH_NO_ACCESS_HOURS_KEY);
    if (v === null || v === "") return 0;
    return clampMooringHours(v);
  } catch (e) {
    return 0;
  }
}

export function getMooringLowNoAccessHours() {
  try {
    const v = localStorage.getItem(MOORING_LOW_NO_ACCESS_HOURS_KEY);
    if (v === null || v === "") return 0;
    return clampMooringHours(v);
  } catch (e) {
    return 0;
  }
}

// ---- Setters ----

export function setDailyScoreMode(mode) {
  try {
    localStorage.setItem(DAILY_SCORE_MODE_KEY, mode === "daylight" ? "daylight" : "all");
  } catch (e) {}
}

export function setScoreProfile(profile) {
  const p = profile === "safety" || profile === "opportunity" ? profile : "standard";
  try {
    localStorage.setItem(SCORE_PROFILE_KEY, p);
  } catch (e) {}
}

export function setScoreTemp(v) {
  try {
    localStorage.setItem(SCORE_TEMP_KEY, v === "on" ? "on" : "off");
  } catch (e) {}
}

export function setScoreFairWeather(v) {
  try {
    localStorage.setItem(SCORE_FAIR_WEATHER_KEY, v === "on" ? "on" : "off");
  } catch (e) {}
}

export function setScoreEnvironment(env) {
  try {
    localStorage.setItem(SCORE_ENVIRONMENT_KEY, env === "estuary" ? "estuary" : "coastal");
  } catch (e) {}
}

export function setMinRecommendedWindowHours(n) {
  try {
    localStorage.setItem(
      MIN_RECOMMENDED_WINDOW_HOURS_KEY,
      String(clampInt(parseInt(n, 10), 1, 8))
    );
  } catch (e) {}
}

export function setMooringHighNoAccessHours(n) {
  try {
    localStorage.setItem(MOORING_HIGH_NO_ACCESS_HOURS_KEY, String(clampMooringHours(n)));
  } catch (e) {}
}

export function setMooringLowNoAccessHours(n) {
  try {
    localStorage.setItem(MOORING_LOW_NO_ACCESS_HOURS_KEY, String(clampMooringHours(n)));
  } catch (e) {}
}
