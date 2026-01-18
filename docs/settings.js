"use strict";

function byId(id) {
  return document.getElementById(id);
}

function setText(id, text) {
  var el = byId(id);
  if (!el) return;
  el.textContent = text;
}

function getCurrentLocationLabel() {
  var name = localStorage.getItem("skippy_locationName") || "";
  var group = localStorage.getItem("skippy_locationGroup") || "";
  if (!name) return "None selected";
  if (group) return name + " (" + group + ")";
  return name;
}

document.addEventListener("DOMContentLoaded", function() {
  setText("footerNote", "");
  setText("currentLocationText", "Current location: " + getCurrentLocationLabel());

  var btn = byId("changeLocationBtn");
  if (btn) {
    btn.addEventListener("click", function() {
      window.location.href = "./location.html?from=settings";
    });
  }

  var aboutBtn = byId("aboutBtn");
  if (aboutBtn) {
    aboutBtn.addEventListener("click", function() {
      window.location.href = "./about.html?from=settings";
    });
  }
});
