// docs/common/score.js
// Updated: 2026-01-22
//
// Skippy boating score logic (single place to tweak).
//
// Notes:
// - Pure functions (no DOM, no storage)
// - This module now also owns DAILY aggregation for scoring (allhours vs daylight)
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

/* --------------------------------------------------
   HARD GATES (tunable)
   If any gate triggers, the hour/day is forced to "Avoid" (score 0).

   environment:
     - "coastal"  (default)
     - "estuary"  (sheltered / upriver intent)
-------------------------------------------------- */

const HARD_GATES = {
  coastal: {
    // Mean wind ≥ 45 km/h (~24 kt) → Avoid
    windMeanKmh: 45,

    // Gusts ≥ 65 km/h (~35 kt) → Avoid
    gustKmh: 65,

    // Significant wave height ≥ 1.8 m → Avoid
    waveM: 1.8,

    // Sig wave height ≥ 1.2 m AND period ≤ 6 s → Avoid
    shortPeriod: { waveM: 1.2, periodS: 6 },

    // Wind ≥ 33 km/h AND waves ≥ 1.2 m → Avoid
    combo: { windKmh: 33, waveM: 1.2 },
  },

  // Estuary / sheltered (upriver intent): keep wind strict, make wave gates storm-only.
  estuary: {
    // Keep wind hard gates strong (wind is still very real upriver).
    windMeanKmh: 45,
    gustKmh: 80,

    // Wave hard gates: only trigger on extreme offshore conditions.
    waveM: 4,
    shortPeriod: { waveM: 2.8, periodS: 5 },
    combo: { windKmh: 35, waveM: 2.8 },
  },
};

/* --------------------------------------------------
   ENVIRONMENT FACTORS (tunable)
   Goal: the offshore model can't "see" shelter, so in estuary mode we dampen
   wave-driven inputs so you don't miss genuine upriver opportunities.

   These factors scale *inputs* before hazards are computed.
   (Hard gates still apply first.)
-------------------------------------------------- */

const ENVIRONMENT_FACTORS = {
  coastal: {
    wave: 1.0,
    windWave: 1.0,
    swell: 1.0,
    current: 1.0,
    // period left unchanged by default (see note below)
    period: 1.0,
  },

  // Suggested defaults: "clear difference but not ignore waves"
  // Tune these if you want estuary to be more/less opportunity-finding.
  estuary: {
    wave: 0.55,
    windWave: 0.45,
    swell: 0.3,
    current: 0.80,
    period: 1.0,
  },
};

function normalizeEnvironment(env) {
  return env === "estuary" ? "estuary" : "coastal";
}

function hardGateTriggered(input) {
  const opts = input || {};
  const env = normalizeEnvironment(opts.environment);
  const g = HARD_GATES[env] || HARD_GATES.coastal;

  const wind = toNumberOrNaN(opts.wind_kmh);
  const gust = toNumberOrNaN(opts.wind_gust_kmh);
  const wave = toNumberOrNaN(opts.wave_m);
  const period = toNumberOrNaN(opts.wave_period_s);

  // Mean wind gate
  if (Number.isFinite(wind) && Number.isFinite(g.windMeanKmh) && wind >= g.windMeanKmh) return true;

  // Gust gate
  if (Number.isFinite(gust) && Number.isFinite(g.gustKmh) && gust >= g.gustKmh) return true;

  // Wave height gate
  if (Number.isFinite(wave) && Number.isFinite(g.waveM) && wave >= g.waveM) return true;

  // Short/steep sea gate: wave >= X AND period <= Y
  if (
    g.shortPeriod &&
    Number.isFinite(wave) &&
    Number.isFinite(period) &&
    Number.isFinite(g.shortPeriod.waveM) &&
    Number.isFinite(g.shortPeriod.periodS) &&
    wave >= g.shortPeriod.waveM &&
    period <= g.shortPeriod.periodS
  ) {
    return true;
  }

  // Combo gate: wind >= X AND wave >= Y
  if (
    g.combo &&
    Number.isFinite(wind) &&
    Number.isFinite(wave) &&
    Number.isFinite(g.combo.windKmh) &&
    Number.isFinite(g.combo.waveM) &&
    wind >= g.combo.windKmh &&
    wave >= g.combo.waveM
  ) {
    return true;
  }

  return false;
}

function applyEnvironmentFactors(opts, env) {
  const e = normalizeEnvironment(env);
  const f = ENVIRONMENT_FACTORS[e] || ENVIRONMENT_FACTORS.coastal;

  function scaleFinite(n, mult) {
    const x = Number(n);
    const m = Number(mult);
    if (!Number.isFinite(x) || !Number.isFinite(m)) return n;
    return x * m;
  }

  // Only scale the wave-driven / sea-state inputs.
  // Wind stays "real" upriver, so we don't touch wind_kmh or gusts here.
  return Object.assign({}, opts, {
    wave_m: scaleFinite(opts.wave_m, f.wave),
    wind_wave_height_m: scaleFinite(opts.wind_wave_height_m, f.windWave),
    swell_wave_height_m: scaleFinite(opts.swell_wave_height_m, f.swell),
    current_velocity_ms: scaleFinite(opts.current_velocity_ms, f.current),

    // Optional: period scaling is exposed, but default is 1.0
    // (Changing period changes steepness; keep it stable unless you have a reason.)
    wave_period_s: scaleFinite(opts.wave_period_s, f.period),
  });
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
 * @returns {number} Integer score in [0, 100]
 */
export function calculateBoatingScore(input) {
  const opts0 = input || {};

  // --- HARD GATES ---
  // Force truly unsafe conditions to "Avoid" regardless of profile weights.
  if (hardGateTriggered(opts0)) return 0;

  // Apply environment scaling AFTER hard-gates, so gates reflect "what the model says"
  // about offshore conditions, but the scored hazard reflects sheltered intent.
  const env = normalizeEnvironment(opts0.environment);
  const opts = applyEnvironmentFactors(opts0, env);

  const profile =
    opts.profile === "safety" || opts.profile === "opportunity"
      ? opts.profile
      : "standard";
  const includeTemp = opts.includeTemp === true;

  const cfg = scoreProfileConfig(profile);

  // --- Primary inputs ---
  const wave = toNumberOrNaN(opts.wave_m);
  const period = toNumberOrNaN(opts.wave_period_s);

  const wind = toNumberOrNaN(opts.wind_kmh);
  const gust = toNumberOrNaN(opts.wind_gust_kmh);

  const visM = toNumberOrNaN(opts.visibility_m);
  const precipMm = toNumberOrNaN(opts.precip_mm);

  const cur = toNumberOrNaN(opts.current_velocity_ms);
  const curDir = toNumberOrNaN(opts.current_direction_deg);
  const waveDir = toNumberOrNaN(opts.wave_direction_deg);

  const windWaveH = toNumberOrNaN(opts.wind_wave_height_m);
  const windWaveDir = toNumberOrNaN(opts.wind_wave_direction_deg);
  const swellH = toNumberOrNaN(opts.swell_wave_height_m);
  const swellDir = toNumberOrNaN(opts.swell_wave_direction_deg);

  const apparentC = toNumberOrNaN(opts.apparent_temp_c);
  const seaC = toNumberOrNaN(opts.sea_temp_c);

  // --- Hazards (0..1) ---

  const HwHeight = hazardWaveHeight(wave, cfg);
  const HwSteep = hazardWaveSteepness(wave, period, cfg);
  const H_wave = clamp(0.7 * HwHeight + 0.3 * HwSteep, 0, 1);

  const HwindMean = hazardWindMean(wind, cfg);
  const HwindGust = hazardWindGustiness(wind, gust, cfg);
  const H_wind = clamp(0.75 * HwindMean + 0.25 * HwindGust, 0, 1);

  const H_wave_tide = hazardWaveAgainstCurrent({
    wave_m: wave,
    wave_dir_deg: waveDir,
    current_velocity_ms: cur,
    current_direction_deg: curDir,
    profileCfg: cfg,
  });

  const H_cross = hazardCrossSea({
    wind_wave_height_m: windWaveH,
    wind_wave_direction_deg: windWaveDir,
    swell_wave_height_m: swellH,
    swell_wave_direction_deg: swellDir,
    profileCfg: cfg,
  });

  // Visibility-only hazard. Rain is handled exclusively via the Fair Weather Sailor penalty.
  let H_vis_rain = hazardVisibility(visM, cfg);
  if (cfg.profile === "safety") H_vis_rain = clamp(H_vis_rain * 1.05, 0, 1);

  const H_temp = includeTemp
    ? hazardTemperature({
        apparent_temp_c: apparentC,
        sea_temp_c: seaC,
        profileCfg: cfg,
      })
    : 0;

  // --- Weighted sum -> score ---
  const hazardTotal = clamp(
    cfg.w.waves * H_wave +
      cfg.w.wind * H_wind +
      cfg.w.wave_tide * H_wave_tide +
      cfg.w.cross_sea * H_cross +
      cfg.w.vis_rain * H_vis_rain +
      cfg.w.temp * H_temp,
    0,
    1
  );

  let score = 100 * (1 - hazardTotal);
  score = Math.round(clamp(score, 0, 100));

  // --- FAIR WEATHER SAILOR PENALTY ---
  // When enabled, apply a multiplicative penalty based on rain intensity.
  // This is the only path through which rain affects the score.
  if (opts0.fairWeatherSailor === true && Number.isFinite(precipMm) && precipMm > 0) {
    const rainH = hazardRain(precipMm); // 0..1
    // Factor: 1.0 at 0 mm/hr → 0.30 at 10+ mm/hr
    const penaltyFactor = 1 - 0.70 * rainH;
    score = Math.round(clamp(score * penaltyFactor, 0, 100));
  }

  return score;
}

/**
 * Convenience wrapper: per-hour score from wave+wind.
 */
export function scoreHour({ wave_m, wind_kmh } = {}) {
  // Accept a rich input object (preferred), but keep legacy fields.
  const o = arguments[0] || {};
  return calculateBoatingScore(o);
}

/* --------------------------------------------------
   Model helpers
-------------------------------------------------- */

function scoreProfileConfig(profile) {
  // Tolerance factor: < 1 means more conservative, > 1 means more "opportunity finding".
  const tol = profile === "safety" ? 0.85 : profile === "opportunity" ? 1.15 : 1.0;

  // Relative weights for the hazard channels. Sum to 1.
  const w = {
    waves: 0.40,
    wind: 0.25,
    wave_tide: 0.15,
    cross_sea: 0.10,
    vis_rain: 0.08,
    temp: 0.02,
  };

  // Slightly re-balance weights by profile.
  if (profile === "safety") {
    w.waves += 0.03;
    w.wave_tide += 0.02;
    w.vis_rain += 0.01;
    w.wind -= 0.03;
    w.cross_sea -= 0.02;
    w.temp -= 0.01;
  } else if (profile === "opportunity") {
    w.wind += 0.02;
    w.cross_sea += 0.02;
    w.waves -= 0.02;
    w.wave_tide -= 0.01;
    w.vis_rain -= 0.01;
  }

  // Normalize weights to sum 1.
  const sum = Object.values(w).reduce((a, b) => a + b, 0);
  for (const k of Object.keys(w)) w[k] = w[k] / (sum || 1);

  return { profile, tol, w };
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function ramp(x, a, b) {
  const xx = Number(x);
  const aa = Number(a);
  const bb = Number(b);
  if (!Number.isFinite(xx) || !Number.isFinite(aa) || !Number.isFinite(bb) || bb === aa) return 0;
  return clamp((xx - aa) / (bb - aa), 0, 1);
}

function piecewise(points, x) {
  // points: [{x, y}, ...] sorted by x
  const xx = Number(x);
  if (!Number.isFinite(xx) || !Array.isArray(points) || points.length < 2) return 0;
  if (xx <= points[0].x) return points[0].y;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (xx >= a.x && xx <= b.x) {
      const t = (xx - a.x) / (b.x - a.x);
      return lerp(a.y, b.y, clamp(t, 0, 1));
    }
  }
  return points[points.length - 1].y;
}

function normDeg(d) {
  const n = Number(d);
  if (!Number.isFinite(n)) return NaN;
  return ((n % 360) + 360) % 360;
}

function angleDiffDeg(a, b) {
  const aa = normDeg(a);
  const bb = normDeg(b);
  if (!Number.isFinite(aa) || !Number.isFinite(bb)) return NaN;
  const d = Math.abs(aa - bb);
  return d > 180 ? 360 - d : d;
}

function hazardWaveHeight(wave_m, cfg) {
  const w = Number(wave_m);
  if (!Number.isFinite(w)) return 0;
  const eff = w / (cfg.tol || 1);
  // 15ft coastal boat: noticeable by ~0.5m, uncomfortable/poor by ~1.2m, very poor by ~1.8m.
  return clamp(
    piecewise(
      [
        { x: 0.2, y: 0.0 },
        { x: 0.5, y: 0.30 },
        { x: 0.8, y: 0.60 },
        { x: 1.2, y: 0.85 },
        { x: 1.8, y: 1.0 },
      ],
      eff
    ),
    0,
    1
  );
}

function hazardWaveSteepness(wave_m, period_s, cfg) {
  const w = Number(wave_m);
  const p = Number(period_s);
  if (!Number.isFinite(w) || !Number.isFinite(p) || p <= 0) return 0;
  const effW = w / (cfg.tol || 1);
  const steep = effW / p;
  // Rough heuristic: <0.05 is gentle, >0.18 is short/steep and nasty.
  return clamp(
    piecewise(
      [
        { x: 0.05, y: 0.0 },
        { x: 0.10, y: 0.5 },
        { x: 0.18, y: 1.0 },
      ],
      steep
    ),
    0,
    1
  );
}

function hazardWindMean(wind_kmh, cfg) {
  const w = Number(wind_kmh);
  if (!Number.isFinite(w)) return 0;
  const eff = w / (cfg.tol || 1);
  // Rough comfort thresholds for small craft (km/h):
  // ~9 (5kt) calm, ~22 (12kt) starts biting, ~33 (18kt) poor-ish, ~41 (22kt) very poor.
  return clamp(
    piecewise(
      [
        { x: 9, y: 0.0 },
        { x: 22, y: 0.35 },
        { x: 33, y: 0.65 },
        { x: 41, y: 0.85 },
        { x: 55, y: 1.0 },
      ],
      eff
    ),
    0,
    1
  );
}

function hazardWindGustiness(wind_kmh, gust_kmh, cfg) {
  const w = Number(wind_kmh);
  const g = Number(gust_kmh);
  if (!Number.isFinite(g)) return 0;
  const base = Number.isFinite(w) && w > 5 ? w : 5;
  const gf = g / base;
  // Gust factor: 1.2 steady, 1.4 gusty, 1.7 very gusty.
  const h = piecewise(
    [
      { x: 1.2, y: 0.0 },
      { x: 1.4, y: 0.5 },
      { x: 1.7, y: 1.0 },
    ],
    gf
  );
  // In safety mode, treat gustiness a bit more harshly.
  const mult = cfg.profile === "safety" ? 1.1 : cfg.profile === "opportunity" ? 0.95 : 1.0;
  return clamp(h * mult, 0, 1);
}

function hazardCurrentSpeed(cur_ms, cfg) {
  const c = Number(cur_ms);
  if (!Number.isFinite(c)) return 0;
  const eff = c / (cfg.tol || 1);
  return clamp(
    piecewise(
      [
        { x: 0.2, y: 0.0 },
        { x: 0.6, y: 0.4 },
        { x: 1.2, y: 1.0 },
      ],
      eff
    ),
    0,
    1
  );
}

function hazardWaveAgainstCurrent({
  wave_m,
  wave_dir_deg,
  current_velocity_ms,
  current_direction_deg,
  profileCfg,
}) {
  const w = Number(wave_m);
  if (!Number.isFinite(w) || w <= 0.3) return 0;
  const d = angleDiffDeg(wave_dir_deg, current_direction_deg);
  if (!Number.isFinite(d)) return 0;

  // Only penalize strongly when close to opposing (>=120deg).
  const opposition = ramp(d, 120, 180);
  const Hcur = hazardCurrentSpeed(current_velocity_ms, profileCfg);

  // More important when waves are already moderate.
  const HwaveGate = ramp(w / (profileCfg.tol || 1), 0.4, 1.0);

  const mult =
    profileCfg.profile === "safety" ? 1.1 : profileCfg.profile === "opportunity" ? 0.9 : 1.0;
  return clamp(opposition * Hcur * HwaveGate * mult, 0, 1);
}

function hazardCrossSea({
  wind_wave_height_m,
  wind_wave_direction_deg,
  swell_wave_height_m,
  swell_wave_direction_deg,
  profileCfg,
}) {
  const ww = Number(wind_wave_height_m);
  const sw = Number(swell_wave_height_m);
  if (!Number.isFinite(ww) || !Number.isFinite(sw)) return 0;
  if (ww < 0.3 || sw < 0.3) return 0;

  const d = angleDiffDeg(wind_wave_direction_deg, swell_wave_direction_deg);
  if (!Number.isFinite(d)) return 0;

  const cross = ramp(d, 40, 100);
  const total = (ww + sw) / (profileCfg.tol || 1);
  const size = ramp(total, 0.8, 1.6);

  const mult = profileCfg.profile === "opportunity" ? 0.95 : 1.0;
  return clamp(cross * size * mult, 0, 1);
}

function hazardVisibility(visibility_m, cfg) {
  const v = Number(visibility_m);
  if (!Number.isFinite(v)) return 0;
  const km = v / 1000;
  return clamp(
    piecewise(
      [
        { x: 10, y: 0.0 },
        { x: 5, y: 0.25 },
        { x: 3, y: 0.5 },
        { x: 1, y: 1.0 },
      ].sort((a, b) => a.x - b.x),
      km
    ),
    0,
    1
  );
}

function hazardRain(precip_mm, cfg) {
  const p = Number(precip_mm);
  if (!Number.isFinite(p)) return 0;
  return clamp(
    piecewise(
      [
        { x: 0, y: 0.0 },
        { x: 1, y: 0.2 },
        { x: 3, y: 0.5 },
        { x: 6, y: 0.8 },
        { x: 10, y: 1.0 },
      ],
      p
    ),
    0,
    1
  );
}

function hazardVisRain({ visibility_m, precip_mm, wind_hazard, profileCfg }) {
  const Hv = hazardVisibility(visibility_m, profileCfg);
  const Hr = hazardRain(precip_mm, profileCfg);
  let h = clamp(0.7 * Hv + 0.3 * Hr, 0, 1);

  // Extra bump when it's both wet and windy (spray/visibility/navigational load).
  const wh = Number(wind_hazard);
  const p = Number(precip_mm);
  if (Number.isFinite(wh) && Number.isFinite(p) && wh > 0.6 && p >= 2) {
    h = clamp(h + 0.10, 0, 1);
  }

  // Safety profile slightly harsher here.
  if (profileCfg.profile === "safety") h = clamp(h * 1.05, 0, 1);
  return h;
}

function hazardTemperature({ apparent_temp_c, sea_temp_c, profileCfg }) {
  const a = Number(apparent_temp_c);
  const s = Number(sea_temp_c);
  let ha = 0;
  let hs = 0;

  if (Number.isFinite(a)) {
    // Below ~3C starts to matter, very cold below ~-5C.
    ha = ramp(3 - a, 0, 8);
  }
  if (Number.isFinite(s)) {
    // Cold water risk increases below ~8C.
    hs = ramp(8 - s, 0, 8);
  }

  let h = clamp(0.6 * ha + 0.4 * hs, 0, 1);
  if (profileCfg.profile === "safety") h = clamp(h * 1.10, 0, 1);
  if (profileCfg.profile === "opportunity") h = clamp(h * 0.95, 0, 1);
  return h;
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
export function fallbackDayScoreFromDailyExtrema({
  waveMax_m = 0,
  windMax_kmh = 0,
  // Optional scoring options (backwards compatible)
  environment,
  scoreProfile,
  includeTemp,
} = {}) {
  const profile =
    scoreProfile === "safety" || scoreProfile === "opportunity" ? scoreProfile : "standard";

  return calculateBoatingScore({
    environment: normalizeEnvironment(environment),
    profile,
    includeTemp: includeTemp === true,

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
  fallbackScore,
  environment // optional (backwards compatible)
) {
  const rows = Array.isArray(hourRows) ? hourRows : [];
  const mode = dailyScoreMode === "daylight" ? "daylight" : "allhours";
  const fb = Number.isFinite(Number(fallbackScore)) ? Number(fallbackScore) : 0;
  const env = normalizeEnvironment(environment);

  let sum = 0;
  let n = 0;

  for (const row of rows) {
    if (!row) continue;

    // FIX: support rows that use `time: "HH:MM"` (day page shape), and normalize with safeHHMM.
    const hhmmRaw = row.hhmm || row.time || row.timeHHMM || row.time_hhmm; // common aliases
    const hhmm = safeHHMM(hhmmRaw);

    const include = mode === "allhours" ? true : hourIsInDaylight(hhmm, sunriseHHMM, sunsetHHMM);
    if (!include) continue;

    let s = Number(row.score);
    if (!Number.isFinite(s)) {
      // If score isn't present, compute it if we have wave/wind.
      s = scoreHour({
        // Environment: prefer per-row override if present, else the caller's environment.
        environment: normalizeEnvironment(row.environment ?? env),

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
  environment, // optional
}) {
  return averageScoreFromHourRows(
    dailyScoreMode,
    hourRows,
    sunriseHHMM,
    sunsetHHMM,
    fallbackScore,
    environment
  );
}

/**
 * Average a daily score from *raw hourly arrays* by constructing hourRows and
 * then using the same aggregation logic as the day page.
 *
 * This is designed to replace data.js's `averageDailyScoreFromHourly(...)`.
 */
export function scoreDayFromHourlySeries({
  dayIso,
  dailyScoreMode,
  sunriseHHMM,
  sunsetHHMM,
  // Scoring options
  scoreProfile,
  includeTemp,
  environment, // coastal vs estuary
  fairWeatherSailor, // optional boolean

  // Weather series
  weatherHourlyTime,
  weatherHourlyWindKmh,
  weatherHourlyGustKmh,
  weatherHourlyVisibilityM,
  weatherHourlyPrecipMm,
  weatherHourlyApparentTempC,

  // Marine series
  marineHourlyTime,
  marineHourlyWaveM,
  marineHourlyWavePeriodS,
  marineHourlyWaveDirectionDeg,
  marineHourlyWindWaveHeightM,
  marineHourlyWindWaveDirectionDeg,
  marineHourlySwellHeightM,
  marineHourlySwellDirectionDeg,
  marineHourlyCurrentVelocityMs,
  marineHourlyCurrentDirectionDeg,
  marineHourlySeaTempC,

  fallbackScore,
}) {
  const fb = Number.isFinite(Number(fallbackScore)) ? Number(fallbackScore) : 0;

  const profile =
    scoreProfile === "safety" || scoreProfile === "opportunity" ? scoreProfile : "standard";
  const tempOn = includeTemp === true;
  const env = normalizeEnvironment(environment);

  // Build quick lookups for marine values by timestamp.
  function mapByTime(times, values) {
    const m = new Map();
    if (!Array.isArray(times) || !Array.isArray(values)) return m;
    const L = Math.min(times.length, values.length);
    for (let i = 0; i < L; i++) m.set(times[i], values[i]);
    return m;
  }

  const waveByTime = mapByTime(marineHourlyTime, marineHourlyWaveM);
  const periodByTime = mapByTime(marineHourlyTime, marineHourlyWavePeriodS);
  const waveDirByTime = mapByTime(marineHourlyTime, marineHourlyWaveDirectionDeg);
  const wwHByTime = mapByTime(marineHourlyTime, marineHourlyWindWaveHeightM);
  const wwDirByTime = mapByTime(marineHourlyTime, marineHourlyWindWaveDirectionDeg);
  const swellHByTime = mapByTime(marineHourlyTime, marineHourlySwellHeightM);
  const swellDirByTime = mapByTime(marineHourlyTime, marineHourlySwellDirectionDeg);
  const curByTime = mapByTime(marineHourlyTime, marineHourlyCurrentVelocityMs);
  const curDirByTime = mapByTime(marineHourlyTime, marineHourlyCurrentDirectionDeg);
  const seaTByTime = mapByTime(marineHourlyTime, marineHourlySeaTempC);

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
      const gust = Array.isArray(weatherHourlyGustKmh) ? weatherHourlyGustKmh[i] : null;
      const vis = Array.isArray(weatherHourlyVisibilityM) ? weatherHourlyVisibilityM[i] : null;
      const precip = Array.isArray(weatherHourlyPrecipMm) ? weatherHourlyPrecipMm[i] : null;
      const apparent = Array.isArray(weatherHourlyApparentTempC) ? weatherHourlyApparentTempC[i] : null;

      const wave = waveByTime.get(t);
      const period = periodByTime.get(t);
      const waveDir = waveDirByTime.get(t);
      const wwH = wwHByTime.get(t);
      const wwDir = wwDirByTime.get(t);
      const swellH = swellHByTime.get(t);
      const swellDir = swellDirByTime.get(t);
      const cur = curByTime.get(t);
      const curDir = curDirByTime.get(t);
      const seaT = seaTByTime.get(t);

      rows.push({
        hhmm,
        wind_kmh: wind,
        wave_m: wave,
        environment: env, // keep the hourRow self-describing
        score: scoreHour({
          environment: env,
          profile,
          includeTemp: tempOn,
          fairWeatherSailor: fairWeatherSailor === true,

          wave_m: wave ?? 0,
          wave_period_s: period ?? 0,
          wave_direction_deg: waveDir,

          wind_kmh: wind ?? 0,
          wind_gust_kmh: gust,

          wind_wave_height_m: wwH,
          wind_wave_direction_deg: wwDir,
          swell_wave_height_m: swellH,
          swell_wave_direction_deg: swellDir,

          current_velocity_ms: cur,
          current_direction_deg: curDir,

          visibility_m: vis,
          precip_mm: precip,

          apparent_temp_c: apparent,
          sea_temp_c: seaT,
        }),
      });
    }
  }

  return scoreDayFromHourRows({
    dailyScoreMode,
    hourRows: rows,
    sunriseHHMM,
    sunsetHHMM,
    fallbackScore: fb,
    environment: env,
  });
}
