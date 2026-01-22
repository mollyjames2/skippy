// docs/shared/openmeteoSpec.js
//
// Canonical Open-Meteo request spec for Skippy.
// Browser and Worker MUST use this to avoid drift.

export const SKIPPY_TIMEZONE = "Europe/London";
export const SKIPPY_FORECAST_DAYS = 8;

// Bump this when the request spec / bundle shape changes
// so cached bundles refresh automatically.
export const SKIPPY_BUNDLE_VERSION = 4;

export const OPEN_METEO = {
  weather: {
    baseUrl: "https://api.open-meteo.com/v1/forecast",
    hourly: [
      "temperature_2m",
      "apparent_temperature",
      "pressure_msl",
      "precipitation_probability",
      "precipitation",
      "weather_code",
      "visibility",
      "cloud_cover",
      "wind_speed_10m",
      "wind_direction_10m",
      "wind_gusts_10m",
    ],
    daily: [
      "weather_code",
      "temperature_2m_max",
      "temperature_2m_mean",
      "temperature_2m_min",
      "apparent_temperature_max",
      "apparent_temperature_mean",
      "apparent_temperature_min",
      "wind_speed_10m_max",
      "wind_gusts_10m_max",
      "wind_direction_10m_dominant",
      "precipitation_sum",
      "precipitation_probability_max",
      "precipitation_probability_mean",
      "precipitation_probability_min",
      "sunrise",
      "sunset",
    ],
  },

  marine: {
    baseUrl: "https://marine-api.open-meteo.com/v1/marine",
    hourly: [
      "wave_height",
      "wind_wave_height",
      "swell_wave_height",
      "wave_direction",
      "wind_wave_direction",
      "swell_wave_direction",
      "wave_period",
      "wind_wave_period",
      "swell_wave_period",
      "wind_wave_peak_period",
      "swell_wave_peak_period",
      "ocean_current_velocity",
      "ocean_current_direction",
      "sea_surface_temperature",
      "invert_barometer_height",

      // modelled sea level including tides
      "sea_level_height_msl",
    ],
    daily: [
      "wave_height_max",
      "wind_wave_height_max",
      "swell_wave_height_max",
      "wave_direction_dominant",
      "wind_wave_direction_dominant",
      "swell_wave_direction_dominant",
      "wave_period_max",
      "wind_wave_period_max",
      "swell_wave_period_max",
      "wind_wave_peak_period_max",
      "swell_wave_peak_period_max",
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
