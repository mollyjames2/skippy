// docs/common/window.js
// Added: 2026-01-23
//
// Recommended boating windows derived from hourly scores.
//
// Notes:
// - Pure functions (no DOM, no storage)
// - Reuses existing rating thresholds + daylight inclusion rules from score.js
// - Windows are start-inclusive, end-exclusive
// - Never emit an end time beyond "23:00" (no "24:00")

import { scoreToRating, hourIsInDaylight } from "./score.js";

function clampInt(n, a, b) {
  const x = Math.trunc(Number(n));
  if (!Number.isFinite(x)) return a;
  return Math.max(a, Math.min(b, x));
}

function safeHHMM(s) {
  if (typeof s !== "string") return null;
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
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

function minutesToHHMM(mins) {
  const m = Math.trunc(Number(mins));
  if (!Number.isFinite(m)) return null;
  if (m < 0) return "00:00";
  // Cap at 23:00 to avoid ever producing "24:00".
  if (m >= 23 * 60) return "23:00";
  const hh = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function ratingRank(label) {
  // Higher is better.
  if (label === "Excellent") return 5;
  if (label === "Good") return 4;
  if (label === "OK") return 3;
  if (label === "Poor") return 2;
  return 1; // Avoid / unknown
}

function buildMaximalBlocks({ rows, qualifies, minHours }) {
  const out = [];
  const minsRequired = clampInt(minHours, 1, 8);

  let runStartIdx = -1;
  let runSum = 0;
  let runCount = 0;
  let prevMin = NaN;

  function flushRun(endExclusiveIdx) {
    if (runStartIdx < 0) return;
    if (runCount >= minsRequired) {
      const startHHMM = rows[runStartIdx].time;
      const lastHHMM = rows[endExclusiveIdx - 1].time;
      const endHHMM = minutesToHHMM(hhmmToMinutes(lastHHMM) + 60);

      const avg = runCount ? runSum / runCount : 0;
      out.push({
        start: startHHMM,
        end: endHHMM,
        score: Math.round(avg),
        avg: avg,
        hours: runCount,
      });
    }
    runStartIdx = -1;
    runSum = 0;
    runCount = 0;
    prevMin = NaN;
  }

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const tMin = hhmmToMinutes(r.time);

    const ok = qualifies(r);
    const contiguous = Number.isFinite(prevMin) && tMin === prevMin + 60;

    if (ok) {
      if (runStartIdx < 0) {
        runStartIdx = i;
      } else if (!contiguous) {
        // Close previous run and start a new run.
        flushRun(i);
        runStartIdx = i;
      }

      runSum += Number(r.score) || 0;
      runCount += 1;
      prevMin = tMin;
    } else {
      flushRun(i);
    }
  }

  flushRun(rows.length);
  return out;
}

function normalizeEligibleRows({ hourRows, dailyScoreMode, sunriseHHMM, sunsetHHMM }) {
  const rows = Array.isArray(hourRows) ? hourRows : [];
  const mode = dailyScoreMode === "daylight" ? "daylight" : "allhours";

  // We never want to emit an end time beyond 23:00.
  // That means the latest start hour we can consider is 22:00.
  const latestStartMinutes = 22 * 60;

  const out = [];
  for (const row of rows) {
    if (!row) continue;

    const t = safeHHMM(row.time);
    if (!t) continue;

    const tMin = hhmmToMinutes(t);
    if (!Number.isFinite(tMin) || tMin > latestStartMinutes) continue;

    if (mode === "daylight") {
      if (!hourIsInDaylight(t, sunriseHHMM, sunsetHHMM)) continue;
    }

    const s = Number(row.score);
    if (!Number.isFinite(s)) continue;

    out.push({ time: t, score: s, rating: scoreToRating(s) });
  }

  // Ensure sorted by time.
  out.sort((a, b) => hhmmToMinutes(a.time) - hhmmToMinutes(b.time));
  return out;
}

/**
 * Build recommended windows for each tier from hour rows.
 *
 * @param {Object} input
 * @param {Array<{time:string, score:number}>} input.hourRows
 * @param {number} input.minHours  Minimum duration (hours), 1..8
 * @param {string} input.dailyScoreMode  "allhours" | "daylight"
 * @param {string} input.sunriseHHMM  Rounded sunrise HH:MM (already adjusted in data.js)
 * @param {string} input.sunsetHHMM   Rounded sunset HH:MM (already adjusted in data.js)
 *
 * @returns {{excellent:Array, good:Array, ok:Array}}
 */
export function windowsByTierFromHourRows({
  hourRows,
  minHours,
  dailyScoreMode,
  sunriseHHMM,
  sunsetHHMM,
} = {}) {
  const minsRequired = clampInt(minHours, 1, 8);
  const eligible = normalizeEligibleRows({
    hourRows,
    dailyScoreMode,
    sunriseHHMM,
    sunsetHHMM,
  });

  // Daylight fallback: if daylight is selected but there aren't enough eligible
  // hours to ever form a window, return empty.
  if (dailyScoreMode === "daylight" && eligible.length < minsRequired) {
    return { excellent: [], good: [], ok: [] };
  }

  const excellent = buildMaximalBlocks({
    rows: eligible,
    minHours: minsRequired,
    qualifies: (r) => r.rating === "Excellent",
  });

  const good = buildMaximalBlocks({
    rows: eligible,
    minHours: minsRequired,
    qualifies: (r) => ratingRank(r.rating) >= ratingRank("Good"),
  });

  const ok = buildMaximalBlocks({
    rows: eligible,
    minHours: minsRequired,
    qualifies: (r) => ratingRank(r.rating) >= ratingRank("OK"),
  });

  return { excellent, good, ok };
}

function windowDurationHours(w) {
  const a = hhmmToMinutes(w && w.start);
  const b = hhmmToMinutes(w && w.end);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return 0;
  return (b - a) / 60;
}

/**
 * Pick a single best window from a tiered window object.
 * Tier preference: Excellent > Good > OK
 * In-tier preference: longest duration, then highest avg score, then earliest start.
 *
 * @param {{excellent:Array, good:Array, ok:Array}} windowsByTier
 * @returns {{start:string, end:string, score:number, tier:string} | null}
 */
export function pickBestTierWindow(windowsByTier) {
  const w = windowsByTier || {};
  const tiers = [
    { key: "excellent", label: "Excellent" },
    { key: "good", label: "Good" },
    { key: "ok", label: "OK" },
  ];

  for (const t of tiers) {
    const arr = Array.isArray(w[t.key]) ? w[t.key] : [];
    if (!arr.length) continue;

    let best = null;
    for (const win of arr) {
      if (!win || !win.start || !win.end) continue;

      const dur = windowDurationHours(win);
      if (dur <= 0) continue;

      if (!best) {
        best = win;
        continue;
      }

      const bestDur = windowDurationHours(best);
      if (dur > bestDur) {
        best = win;
        continue;
      }
      if (dur < bestDur) continue;

      const s = Number(win.avg != null ? win.avg : win.score);
      const bs = Number(best.avg != null ? best.avg : best.score);
      const sOk = Number.isFinite(s) ? s : -Infinity;
      const bsOk = Number.isFinite(bs) ? bs : -Infinity;

      if (sOk > bsOk) {
        best = win;
        continue;
      }
      if (sOk < bsOk) continue;

      const a = hhmmToMinutes(win.start);
      const ba = hhmmToMinutes(best.start);
      if (Number.isFinite(a) && Number.isFinite(ba) && a < ba) {
        best = win;
      }
    }

    if (best) {
      return {
        start: best.start,
        end: best.end,
        score: Number.isFinite(Number(best.score)) ? Number(best.score) : 0,
        tier: t.label,
      };
    }
  }

  return null;
}

