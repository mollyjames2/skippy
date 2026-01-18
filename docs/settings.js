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
  var name = "";
  var group = "";
  try {
    const raw = localStorage.getItem("skippy.location") || "";
    if (raw) {
      const loc = JSON.parse(raw);
      name = loc.name || "";
      group = loc.group || "";
    }
  } catch (e) {}

  if (!name) return "None selected";
  if (group) return name + " (" + group + ")";
  return name;
}


document.addEventListener("DOMContentLoaded", function () {
  setText("footerNote", "");
  setText("currentLocationText", "Current location: " + getCurrentLocationLabel());

  var homeBtn = byId("homeBtn");
  if (homeBtn) {
    homeBtn.addEventListener("click", function () {
      window.location.href = "./index.html";
    });
  }

  var btn = byId("changeLocationBtn");
  if (btn) {
    btn.addEventListener("click", function () {
      window.location.href = "./location.html?from=settings";
    });
  }

  var aboutBtn = byId("aboutBtn");
  if (aboutBtn) {
    aboutBtn.addEventListener("click", function () {
      window.location.href = "./about.html?from=settings";
    });
  }
});
