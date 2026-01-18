// docs/common/core.js

/**
 * Return a CSS class name for a score pill.
 */
export function pillClass(score) {
  if (score >= 80) return "pill good";
  if (score >= 50) return "pill ok";
  return "pill bad";
}

/**
 * Load the selected location from storage.
 * Redirects to location picker if missing.
 */
export function requireLocationOrRedirect() {
  try {
    const raw = localStorage.getItem("skippy.location");
    if (!raw) {
      window.location.href = "location.html";
      return null;
    }
    return JSON.parse(raw);
  } catch (e) {
    window.location.href = "location.html";
    return null;
  }
}

