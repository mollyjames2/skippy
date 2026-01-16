"use strict";

function load() {
  var homeLabel = localStorage.getItem("skippy_homeLabel") || "South West UK";
  document.getElementById("homeLabel").value = homeLabel;
}

function save() {
  var homeLabel = document.getElementById("homeLabel").value.trim() || "South West UK";
  localStorage.setItem("skippy_homeLabel", homeLabel);
  document.getElementById("status").textContent = "Saved.";
}

document.getElementById("saveBtn").addEventListener("click", save);
load();

