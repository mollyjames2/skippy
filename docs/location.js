// docs/location.js
// Updated: 2026-01-20
import { SKIPPY_PRESETS } from "./presets.js";

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

function getCurrentLocation() {
  try {
    const raw = localStorage.getItem("skippy.location");
    if (!raw) return { slug: "", name: "" };
    const loc = JSON.parse(raw);
    // Backwards compatible: older versions stored {slug,name,group}.
    return {
      slug: loc.slug || "",
      name: loc.name || ""
    };
  } catch (e) {
    return { slug: "", name: "" };
  }
}

function setCurrentLocation(place) {
  localStorage.setItem(
    "skippy.location",
    JSON.stringify({
      slug: place.slug,
      name: place.name
    })
  );
}

function el(tag, className, text) {
  var n = document.createElement(tag);
  if (className) n.className = className;
  if (typeof text === "string") n.textContent = text;
  return n;
}

function wireTopbar() {
  var from = getQueryParam("from");

  var backBtn = byId("backBtn");
  if (backBtn) {
    backBtn.addEventListener("click", function () {
      // If we came from settings, go back there; otherwise go home.
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
}

function renderCurrent() {
  var cur = getCurrentLocation();
  var card = byId("currentCard");
  if (!card) return;

  if (!cur.slug) {
    card.style.display = "none";
    return;
  }

  card.style.display = "block";
  card.innerHTML =
    '<div class="muted small">Current selection</div>' +
    '<div class="spacer"></div>' +
    '<div style="font-weight:800;">' +
    cur.name +
    "</div>";
}

function renderPlaces() {
  var root = byId("places");
  var status = byId("status");
  if (!root) return;

  root.innerHTML = "";

  if (!SKIPPY_PRESETS || !SKIPPY_PRESETS.length) {
    if (status) status.textContent = "No locations found.";
    return;
  }

  // Single flat list (no groups).
  var listCard = el("div", "card", "");
  listCard.appendChild(el("div", "muted small", "Locations"));

  var list = el("div", "", "");
  list.style.marginTop = "10px";

  SKIPPY_PRESETS.forEach(function (p, idx) {
    var row = el("div", "row", "");

    var left = el("div", "", "");
    left.style.fontWeight = "800";
    left.textContent = p.name;

    var right = el("button", "btn", "Select");
    right.type = "button";
    right.addEventListener("click", function () {
      setCurrentLocation(p);

      // One-shot toast shown on Home after redirect.
      localStorage.setItem("skippy_toast", "Location set to: " + p.name);

      if (status) status.textContent = "Selected: " + p.name;
      renderCurrent();

      // Go home after selecting.
      window.location.href = "./index.html";
    });

    row.appendChild(left);
    row.appendChild(right);
    list.appendChild(row);

    // Only add spacer between rows, not after the last one.
    if (idx !== SKIPPY_PRESETS.length - 1) {
      list.appendChild(el("div", "spacer", ""));
    }
  });

  listCard.appendChild(list);
  root.appendChild(listCard);

  if (status) {
    status.textContent =
      "Tip: choose the closest anchor point — the forecast model is regional, not micro-local.";
  }
}

function main() {
  wireTopbar();
  renderCurrent();
  renderPlaces();
}

main();
