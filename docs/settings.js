"use strict";

function load() {
  // Remove legacy setting from older versions
  localStorage.removeItem("skippy_apiBase");

  var homeLabel = localStorage.getItem("skippy_homeLabel") || "South Devon UK";
  document.getElementById("homeLabel").value = homeLabel;
  document.getElementById("status").textContent = "";
}

function save() {
  var homeLabel = document.getElementById("homeLabel").value.trim() ||
    "South Devon UK";
  localStorage.setItem("skippy_homeLabel", homeLabel);

  // Remove legacy setting from older versions
  localStorage.removeItem("skippy_apiBase");

  document.getElementById("status").textContent = "Saved.";
}

document.getElementById("saveBtn").addEventListener("click", save);
load();
