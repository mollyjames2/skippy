// docs/shared/openmeteoSpec.js
//
// Canonical Open-Meteo request spec for Skippy.
// Browser and Worker MUST use this to avoid drift.

export const SKIPPY_TIMEZONE = "Europe/London";
export const SKIPPY_FORECAST_DAYS = 7;

// Bump this when the request spec / bundle shape changes
// so cached bundles refresh automatically.
export const SKIPPY_BUNDLE_VERSION = 4;

export const OPEN_METEO = {
  weather: {
    baseUrl: "https://api.open-meteo.com/v1/forecast",
    hourly: [
      "temperature_2m",
      "apparent_temperature",
      "precipitation_probability",
      "precipitation",
      "weather_code",
      "visibility",
      "cloud_cover",
      "wind_speed_10m",
      "wind_direction_10m",
      "wind_gusts_10m",
      "pressure_msl",
    ],
    daily: [
      "weather_code",
      "temperature_2m_max",
      "temperature_2m_min",
      "wind_speed_10m_max",
      "wind_gusts_10m_max",
      "wind_direction_10m_dominant",
      "precipitation_sum",
      "precipitation_probability_max",
      "sunrise",
      "sunset",
    ],
  },

  marine: {
    baseUrl: "https://marine-api.open-meteo.com/v1/marine",
    hourly: [
      "wave_height",
      "wave_direction",
      "wave_period",

      // modelled sea level including tides
      "sea_level_height_msl",
    ],
    daily: [
      "wave_height_max",
      "wave_direction_dominant",
      "wave_period_max",
    ],

    // NEW: 15-minute series (where available; elsewhere may be interpolated)
    minutely_15: [
      "sea_level_height_msl",
    ],
  },
};

/**
 * Build a URL for Open-Meteo Weather or Marine using the canonical spec.
 * type: "weather" | "marine"
 */
export function buildOpenMeteoUrl(type, { lat, lon }) {
  const cfg = OPEN_METEO[type];
  if (!cfg) throw new Error(`Unknown Open-Meteo type: ${type}`);

  const u = new URL(cfg.baseUrl);
  u.searchParams.set("latitude", String(lat));
  u.searchParams.set("longitude", String(lon));
  u.searchParams.set("timezone", SKIPPY_TIMEZONE);
  u.searchParams.set("forecast_days", String(SKIPPY_FORECAST_DAYS));

  // Always request BOTH layers (daily + hourly)
  if (cfg.hourly && cfg.hourly.length) u.searchParams.set("hourly", cfg.hourly.join(","));
  if (cfg.daily && cfg.daily.length) u.searchParams.set("daily", cfg.daily.join(","));

  // Optional 15-min layer (marine only)
  if (cfg.minutely_15 && cfg.minutely_15.length) {
    u.searchParams.set("minutely_15", cfg.minutely_15.join(","));
  }

  return u.toString();
}

/**
 * Canonical bundle wrapper shape.
 * Tides are DERIVED client-side from marine sea level
 * (hourly, optionally refined with minutely_15)
 */
export function makeBundleEnvelope({ slug, place, weather, marine }) {
  return {
    v: SKIPPY_BUNDLE_VERSION,
    slug,
    place,
    timezone: SKIPPY_TIMEZONE,
    fetched_at: new Date().toISOString(),
    weather,
    marine,
    tides: null,
  };
}
