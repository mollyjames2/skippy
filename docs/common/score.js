// docs/common/score.js
// Updated: 2026-01-22
//
// Skippy boating score logic (single place to tweak).
//
// Notes:
// - Pure functions (no DOM, no storage)
// - This module now also owns DAILY aggregation for scoring (allhours vs daylight)
// - The core per-hour formula is intentionally preserved for now:
//     score = 100 - wave_m * 20 - wind_kmh
//
// Expected "dailyScoreMode":
//   - "allhours"  : use all available hours for the day score
//   - "daylight"  : use only daylight hours (sunrise..sunset) for the day score

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function toNumberOrNaN(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : NaN;
}

function safeHHMM(s) {
  // Accept "HH:MM" (optionally with seconds) or return null
  if (typeof s !== "string") return null;
  const m = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function hhmmToMinutes(hhmm) {
  const s = safeHHMM(hhmm);
  if (!s) return NaN;
  const [hh, mm] = s.split(":").map((v) => Number(v));
  return hh * 60 + mm;
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
 * @param {Object} input
 * @param {number} input.wave_m   Significant wave height in metres.
 * @param {number} input.wind_kmh Wind speed in km/h.
 * @returns {number} Integer score in [0, 100]
 */
export function calculateBoatingScore(input) {
  const opts = input || {};
  const wave = toNumberOrNaN(opts.wave_m);
  const wind = toNumberOrNaN(opts.wind_kmh);

  let s = 100;
  if (Number.isFinite(wave)) s -= wave * 20;
  if (Number.isFinite(wind)) s -= wind;

  return Math.round(clamp(s, 0, 100));
}

/**
 * Convenience wrapper: per-hour score from wave+wind.
 */
export function scoreHour({ wave_m, wind_kmh } = {}) {
  return calculateBoatingScore({ wave_m, wind_kmh });
}

/**
 * Returns true if an HH:MM time is within daylight.
 *
 * Daylight is treated as inclusive of sunrise and exclusive of sunset:
 *   sunrise <= t < sunset
 *
 * If sunrise/sunset are missing/invalid, we include the hour by default.
 */
export function hourIsInDaylight(hhmm, sunriseHHMM, sunsetHHMM) {
  const t = hhmmToMinutes(hhmm);
  const sr = hhmmToMinutes(sunriseHHMM);
  const ss = hhmmToMinutes(sunsetHHMM);

  // If we cannot safely determine daylight bounds, don't exclude anything.
  if (!Number.isFinite(t) || !Number.isFinite(sr) || !Number.isFinite(ss)) return true;

  // If sunrise/sunset are weird (e.g. polar day/night or data issue),
  // fall back to including everything.
  if (ss <= sr) return true;

  return t >= sr && t < ss;
}

/**
 * Compute a fallback daily score using max (or representative) daily values.
 * This matches the existing pattern used in data.js today.
 */
export function fallbackDayScoreFromDailyExtrema({ waveMax_m = 0, windMax_kmh = 0 } = {}) {
  return calculateBoatingScore({
    wave_m: toNumberOrNaN(waveMax_m) || 0,
    wind_kmh: toNumberOrNaN(windMax_kmh) || 0,
  });
}

/**
 * Average a daily score from hour rows that already contain `score`,
 * respecting dailyScoreMode ("allhours" | "daylight").
 *
 * Each hourRow is expected to contain:
 *   - hhmm: "HH:MM" (required for daylight filtering)
 *   - score: number (optional; if missing we will compute it if wave/wind present)
 *   - wave_m, wind_kmh (optional; used only if score missing)
 *
 * @returns {number} Integer score in [0,100]
 */
export function averageScoreFromHourRows(
  dailyScoreMode,
  hourRows,
  sunriseHHMM,
  sunsetHHMM,
  fallbackScore
) {
  const rows = Array.isArray(hourRows) ? hourRows : [];
  const mode = dailyScoreMode === "daylight" ? "daylight" : "allhours";
  const fb = Number.isFinite(Number(fallbackScore)) ? Number(fallbackScore) : 0;

  let sum = 0;
  let n = 0;

  for (const row of rows) {
    if (!row) continue;

    const hhmm = row.hhmm || row.timeHHMM || row.time_hhmm; // a few common aliases
    const include = mode === "allhours" ? true : hourIsInDaylight(hhmm, sunriseHHMM, sunsetHHMM);
    if (!include) continue;

    let s = Number(row.score);
    if (!Number.isFinite(s)) {
      // If score isn't present, compute it if we have wave/wind.
      s = scoreHour({
        wave_m: row.wave_m ?? row.wave ?? 0,
        wind_kmh: row.wind_kmh ?? row.wind ?? row.windKmh ?? 0,
      });
    }

    if (!Number.isFinite(s)) continue;
    sum += s;
    n += 1;
  }

  if (!n) return Math.round(clamp(fb, 0, 100));
  return Math.round(clamp(sum / n, 0, 100));
}

/**
 * Preferred single entry point for "daily score from hour rows".
 * (This is just a clearer name than averageScoreFromHourRows.)
 */
export function scoreDayFromHourRows({
  dailyScoreMode,
  hourRows,
  sunriseHHMM,
  sunsetHHMM,
  fallbackScore,
}) {
  return averageScoreFromHourRows(
    dailyScoreMode,
    hourRows,
    sunriseHHMM,
    sunsetHHMM,
    fallbackScore
  );
}

/**
 * Average a daily score from *raw hourly arrays* by constructing hourRows and
 * then using the same aggregation logic as the day page.
 *
 * This is designed to replace data.js's `averageDailyScoreFromHourly(...)`.
 *
 * Required minimal bundle shape:
 *   bundle.weather.hourly.time[]           (ISO strings)
 *   bundle.weather.hourly.windspeed_10m[]  (km/h or m/s depending on your pipeline; expect km/h here)
 *   bundle.marine.hourly.time[]            (ISO strings)
 *   bundle.marine.hourly.wave_height[]     (m)
 *
 * If your variable names differ, adapt in data.js when calling this, or adjust here later.
 */
export function scoreDayFromHourlySeries({
  dayIso,
  dailyScoreMode,
  sunriseHHMM,
  sunsetHHMM,
  weatherHourlyTime,
  weatherHourlyWindKmh,
  marineHourlyTime,
  marineHourlyWaveM,
  fallbackScore,
}) {
  const fb = Number.isFinite(Number(fallbackScore)) ? Number(fallbackScore) : 0;

  // Build quick lookups for marine values by timestamp.
  const waveByTime = new Map();
  if (Array.isArray(marineHourlyTime) && Array.isArray(marineHourlyWaveM)) {
    const L = Math.min(marineHourlyTime.length, marineHourlyWaveM.length);
    for (let i = 0; i < L; i++) waveByTime.set(marineHourlyTime[i], marineHourlyWaveM[i]);
  }

  const rows = [];
  if (Array.isArray(weatherHourlyTime) && Array.isArray(weatherHourlyWindKmh)) {
    const L = Math.min(weatherHourlyTime.length, weatherHourlyWindKmh.length);
    for (let i = 0; i < L; i++) {
      const t = weatherHourlyTime[i];
      if (typeof t !== "string" || !t.startsWith(dayIso)) continue;

      // Derive HH:MM from ISO "YYYY-MM-DDTHH:MM"
      const m = t.match(/T(\d{2}):(\d{2})/);
      const hhmm = m ? `${m[1]}:${m[2]}` : null;

      const wind = weatherHourlyWindKmh[i];
      const wave = waveByTime.get(t);

      rows.push({
        hhmm,
        wind_kmh: wind,
        wave_m: wave,
        score: scoreHour({ wave_m: wave ?? 0, wind_kmh: wind ?? 0 }),
      });
    }
  }

  return scoreDayFromHourRows({
    dailyScoreMode,
    hourRows: rows,
    sunriseHHMM,
    sunsetHHMM,
    fallbackScore: fb,
  });
}
