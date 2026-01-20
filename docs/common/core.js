// docs/common/core.js


/**
 * Return a CSS class name for a score pill.
 * One-to-one with the logical score categories.
 */
export function pillClass(score) {
  if (score >= 90) return "pill excellent";
  if (score >= 60) return "pill good";
  if (score >= 40) return "pill ok";
  if (score >= 20) return "pill poor";
  return "pill avoid";
}


/**
 * Load the selected location from storage.
 * Returns null if missing/invalid.
 */
export function getSavedLocation() {
  try {
    const raw = localStorage.getItem("skippy.location");
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

/**
 * For pages that *must* have a location (e.g. day details).
 * Redirects to location picker if missing.
 */
export function requireLocationOrRedirect() {
  const loc = getSavedLocation();
  if (!loc) {
    window.location.href = "./location.html";
    return null;
  }
  return loc;
}

