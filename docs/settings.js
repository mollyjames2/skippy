"use strict";

function load() {
  var homeLabel = localStorage.getItem("skippy_homeLabel") || "South West UK";
  var apiBase = localStorage.getItem("skippy_apiBase") || "";
  document.getElementById("homeLabel").value = homeLabel;
  document.getElementById("apiBase").value = apiBase;
}

function save() {
  var homeLabel = document.getElementById("homeLabel").value.trim() || "South West UK";
  var apiBase = document.getElementById("apiBase").value.trim();

  localStorage.setItem("skippy_homeLabel", homeLabel);
  localStorage.setItem("skippy_apiBase", apiBase);

  document.getElementById("status").textContent = "Saved.";
}

document.getElementById("saveBtn").addEventListener("click", save);
load();

