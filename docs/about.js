"use strict";

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
      if (from === "settings") {
        window.location.href = "./settings.html";
      } else {
        window.location.href = "./index.html";
      }
    });
  }

  var homeBtn = byId("homeBtn");
  if (homeBtn) {
    homeBtn.addEventListener("click", function () {
      window.location.href = "./index.html";
    });
  }
});
