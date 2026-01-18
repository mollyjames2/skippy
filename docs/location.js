// docs/location.js
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
  var slug = localStorage.getItem("skippy_locationSlug") || "";
  var name = localStorage.getItem("skippy_locationName") || "";
  var group = localStorage.getItem("skippy_locationGroup") || "";
  return { slug: slug, name: name, group: group };
}

function setCurrentLocation(place, groupName) {
  localStorage.setItem("skippy_locationSlug", place.slug);
  localStorage.setItem("skippy_locationName", place.name);
  localStorage.setItem("skippy_locationGroup", groupName);
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
    '<div style="font-weight:800;">' + cur.name + "</div>" +
    '<div class="muted small">' + cur.group + "</div>";
}

function renderGroups() {
  var root = byId("groups");
  var status = byId("status");
  if (!root) return;

  root.innerHTML = "";

  if (!SKIPPY_PRESETS || !SKIPPY_PRESETS.length) {
    if (status) status.textContent = "No presets found.";
    return;
  }

  SKIPPY_PRESETS.forEach(function (g) {
    var groupCard = el("div", "card", "");
    var header = el("div", "muted small", g.group);
    groupCard.appendChild(header);

    var list = el("div", "", "");
    list.style.marginTop = "10px";

    g.places.forEach(function (p, idx) {
      var row = el("div", "row", "");

      var left = el("div", "", "");
      left.style.fontWeight = "800";
      left.textContent = p.name;

      var right = el("button", "btn", "Select");
      right.type = "button";
      right.addEventListener("click", function () {
        setCurrentLocation(p, g.group);

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
      if (idx !== g.places.length - 1) {
        list.appendChild(el("div", "spacer", ""));
      }
    });

    groupCard.appendChild(list);
    root.appendChild(groupCard);
  });
}

function main() {
  wireTopbar();
  renderCurrent();
  renderGroups();
}

main();
