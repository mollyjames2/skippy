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
  var backBtn = byId("backBtn");
  if (!backBtn) return;

  var from = getQueryParam("from");

  backBtn.addEventListener("click", function () {
    if (from === "settings") {
      window.location.href = "./settings.html";
    } else {
      window.location.href = "./index.html";
    }
  });
});

