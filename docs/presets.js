"use strict";

// Presets are grouped for UI only.
// We store slug + name in localStorage.
// Later we can add lat, lon, tide_station_id for each preset.
var SKIPPY_PRESETS = [
  {
    group: "Plymouth",
    places: [
      { slug: "plymouth", name: "Plymouth" },
      { slug: "royal-william-yard", name: "Royal William Yard" },
      { slug: "turnchapel", name: "Turnchapel" },
      { slug: "oreston", name: "Oreston" },
      { slug: "wembury", name: "Wembury" },
      { slug: "river-yealm", name: "River Yealm" },
    ],
  },
  {
    group: "Newton Ferrers and Noss Mayo",
    places: [
      { slug: "newton-ferrers", name: "Newton Ferrers" },
      { slug: "noss-mayo", name: "Noss Mayo" },
    ],
  },
  {
    group: "Bigbury and Avon",
    places: [
      { slug: "bigbury-on-sea", name: "Bigbury-on-Sea" },
      { slug: "river-avon-bantham", name: "River Avon (Bantham)" },
      { slug: "bantham", name: "Bantham" },
      { slug: "hope-cove", name: "Hope Cove" },
    ],
  },
  {
    group: "Salcombe and Kingsbridge",
    places: [
      { slug: "salcombe", name: "Salcombe" },
      { slug: "kingsbridge", name: "Kingsbridge" },
      { slug: "kingsbridge-estuary", name: "Kingsbridge Estuary" },
    ],
  },
  {
    group: "Dartmouth and River Dart",
    places: [
      { slug: "dartmouth", name: "Dartmouth" },
      { slug: "kingswear", name: "Kingswear" },
      { slug: "dittisham", name: "Dittisham" },
      { slug: "totnes", name: "Totnes" },
    ],
  },
  {
    group: "Torbay",
    places: [
      { slug: "brixham", name: "Brixham" },
      { slug: "paignton", name: "Paignton" },
      { slug: "torquay", name: "Torquay" },
    ],
  },
  {
    group: "Teignmouth and Shaldon",
    places: [
      { slug: "teignmouth", name: "Teignmouth" },
      { slug: "shaldon", name: "Shaldon" },
    ],
  },
  {
    group: "Exe Estuary",
    places: [
      { slug: "dawlish", name: "Dawlish" },
      { slug: "dawlish-warren", name: "Dawlish Warren" },
      { slug: "exmouth", name: "Exmouth" },
      { slug: "starcross", name: "Starcross" },
      { slug: "topsham", name: "Topsham" },
    ],
  },
];
