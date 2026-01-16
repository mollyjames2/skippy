"use strict";

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

function renderCurrent() {
  var cur = getCurrentLocation();
  var card = document.getElementById("currentCard");
  if (!card) return;

  if (!cur.slug) {
    card.style.display = "none";
    return;
  }

  card.style.display = "block";
  card.innerHTML = ""
    + '<div class="muted small">Current selection</div>'
    + '<div class="spacer"></div>'
    + '<div style="font-weight:800;">' + cur.name + '</div>'
    + '<div class="muted small">' + cur.group + '</div>';
}

function renderGroups() {
  var root = document.getElementById("groups");
  if (!root) return;

  root.innerHTML = "";

  if (typeof SKIPPY_PRESETS === "undefined" || !SKIPPY_PRESETS || !SKIPPY_PRESETS.length) {
    document.getElementById("status").textContent = "No presets found.";
    return;
  }

  SKIPPY_PRESETS.forEach(function(g) {
    var groupCard = el("div", "card", "");
    var header = el("div", "muted small", g.group);
    groupCard.appendChild(header);

    var list = el("div", "", "");
    list.style.marginTop = "10px";

    g.places.forEach(function(p) {
      var row = el("div", "row", "");

      var left = el("div", "", "");
      left.style.fontWeight = "800";
      left.textContent = p.name;

      var right = el("button", "btn", "Select");
      right.type = "button";
      right.addEventListener("click", function() {
        setCurrentLocation(p, g.group);
        document.getElementById("status").textContent = "Selected: " + p.name;
        renderCurrent();
        window.location.href = "./index.html";
      });

      row.appendChild(left);
      row.appendChild(right);

      list.appendChild(row);

      var spacer = el("div", "spacer", "");
      list.appendChild(spacer);
    });

    groupCard.appendChild(list);
    root.appendChild(groupCard);
  });
}

function main() {
  renderCurrent();
  renderGroups();
}

main();
