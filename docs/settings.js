"use strict";

function byId(id) {
  return document.getElementById(id);
}

function setText(id, text) {
  var el = byId(id);
  if (!el) return;
  el.textContent = text;
}

function setFooterNote(msg) {
  setText("footerNote", msg || "");
}

function setStatus(msg) {
  setText("settingsStatus", msg || "");
}

function getCurrentLocationLabel() {
  var name = localStorage.getItem("skippy_locationName") || "";
  var group = localStorage.getItem("skippy_locationGroup") || "";
  if (!name) return "No location selected.";
  if (group) return name + " (" + group + ")";
  return name;
}

function getPresetsGroups() {
  // Your presets.js defines: var SKIPPY_PRESETS = [ {group, places:[{slug,name}]} ... ]
  if (typeof SKIPPY_PRESETS === "undefined" || !Array.isArray(SKIPPY_PRESETS)) {
    return [];
  }
  return SKIPPY_PRESETS;
}

function populateLocationSelect() {
  var select = byId("locationSelect");
  if (!select) return;

  var groups = getPresetsGroups();
  var currentSlug = localStorage.getItem("skippy_locationSlug") || "";

  select.innerHTML = "";

  if (groups.length === 0) {
    var opt0 = document.createElement("option");
    opt0.value = "";
    opt0.textContent = "No presets found";
    select.appendChild(opt0);
    return;
  }

  groups.forEach(function (g) {
    var og = document.createElement("optgroup");
    og.label = g.group || "Locations";

    var places = Array.isArray(g.places) ? g.places : [];
    places.forEach(function (p) {
      var opt = document.createElement("option");
      opt.value = p.slug;
      opt.textContent = p.name;
      if (p.slug === currentSlug) opt.selected = true;
      og.appendChild(opt);
    });

    select.appendChild(og);
  });
}

function findPlaceBySlug(slug) {
  var groups = getPresetsGroups();
  var found = null;

  groups.forEach(function (g) {
    if (found) return;
    var places = Array.isArray(g.places) ? g.places : [];
    places.forEach(function (p) {
      if (found) return;
      if (p.slug === slug) {
        found = {
          slug: p.slug,
          name: p.name,
          group: g.group || "",
        };
      }
    });
  });

  return found;
}

function saveSelectedLocation() {
  var select = byId("locationSelect");
  if (!select) return false;

  var slug = select.value || "";
  if (!slug) return false;

  var picked = findPlaceBySlug(slug);
  if (!picked) return false;

  localStorage.setItem("skippy_locationSlug", picked.slug);
  localStorage.setItem("skippy_locationName", picked.name);
  localStorage.setItem("skippy_locationGroup", picked.group || "");

  setText("currentLocationText", "Current: " + getCurrentLocationLabel());
  return true;
}

function wireLocationSettings() {
  setText("currentLocationText", "Current: " + getCurrentLocationLabel());
  populateLocationSelect();

  var saveBtn = byId("saveLocationBtn");
  if (saveBtn) {
    saveBtn.addEventListener("click", function () {
      setStatus("");
      var ok = saveSelectedLocation();
      if (!ok) {
        setStatus("Could not save location (no preset selected).");
        return;
      }
      window.location.href = "./index.html";
    });
  }

  var changePageBtn = byId("changeLocationPageBtn");
  if (changePageBtn) {
    changePageBtn.addEventListener("click", function () {
      window.location.href = "./location.html?from=settings";
    });
  }
}

function loadHomeLabel() {
  var el = byId("homeLabelInput");
  if (!el) return;
  el.value = localStorage.getItem("skippy_homeLabel") || "";
}

function saveHomeLabel() {
  var el = byId("homeLabelInput");
  if (!el) return;
  var v = (el.value || "").trim();
  localStorage.setItem("skippy_homeLabel", v);
  setStatus("Saved.");
}

function resetHomeLabel() {
  localStorage.removeItem("skippy_homeLabel");
  loadHomeLabel();
  setStatus("Reset.");
}

function wireHomeLabelSettings() {
  loadHomeLabel();

  var saveBtn = byId("saveHomeLabelBtn");
  if (saveBtn) {
    saveBtn.addEventListener("click", function () {
      saveHomeLabel();
    });
  }

  var resetBtn = byId("resetHomeLabelBtn");
  if (resetBtn) {
    resetBtn.addEventListener("click", function () {
      resetHomeLabel();
    });
  }
}

document.addEventListener("DOMContentLoaded", function () {
  setFooterNote("");
  setStatus("");
  wireLocationSettings();
  wireHomeLabelSettings();
});
