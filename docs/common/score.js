// docs/common/score.js
// Updated: 2026-01-20
//
// Skippy boating score logic (single place to tweak).
//
// Notes:
// - Pure functions (no DOM, no storage)
// - Extend later with more Open-Meteo variables
// - For now, this preserves the existing placeholder scoring behaviour.

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

/**
 * Convert a numeric score (0-100) into a user-facing rating.
 */
export function scoreToRating(score) {
  const s = Number(score);
  if (!isFinite(s)) return "Avoid";
  if (s >= 90) return "Excellent";
  if (s >= 60) return "Good";
  if (s >= 40) return "OK";
  if (s >= 20) return "Poor";
  return "Avoid";
}

/**
 * Calculate a boating score for a single time slice.
 *
 * CURRENT BEHAVIOUR (kept intentionally):
 *   score = 100 - wave_m * 20 - wind_kmh
 *
 * This will be expanded later to use more Open-Meteo variables
 * (wind-vs-tide, swell separation, currents, visibility, etc.).
 *
 * @param {Object} input
 * @param {number} input.wave_m   Significant wave height in metres.
 * @param {number} input.wind_kmh Wind speed in km/h.
 * @returns {number} Integer score in [0, 100]
 */
export function calculateBoatingScore(input) {
  const opts = input || {};
  const wave = Number(opts.wave_m);
  const wind = Number(opts.wind_kmh);

  let s = 100;
  if (isFinite(wave)) s -= wave * 20;
  if (isFinite(wind)) s -= wind;

  return Math.round(clamp(s, 0, 100));
}

