"use strict";

// Updated: 2026-01-20

function byId(id) {
  return document.getElementById(id);
}

function getQueryParam(name) {
  try {
    return new URLSearchParams(window.location.search).get(name);
  } catch (e) {
    return null;
  }
}

document.addEventListener("DOMContentLoaded", function () {
  var from = getQueryParam("from");

  var backBtn = byId("backBtn");
  if (backBtn) {
    backBtn.addEventListener("click", function () {
      // Prefer browser history first (feels natural on mobile),
      // then fall back to explicit routes.
      if (window.history && window.history.length > 1) {
        window.history.back();
        return;
      }

      if (from === "settings") window.location.href = "./settings.html";
      else window.location.href = "./index.html";
    });
  }

  var homeBtn = byId("homeBtn");
  if (homeBtn) {
    homeBtn.addEventListener("click", function () {
      window.location.href = "./index.html";
    });
  }
});

