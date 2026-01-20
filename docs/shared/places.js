// docs/shared/places.js
// Updated: 2026-01-20
// Single source of truth for Skippy places.
//
// Places are intentionally NOT super granular because the underlying forecast
// model resolution (~8km) can't reliably differentiate nearby micro-locations.
// These points are "anchors" for areas rather than precise marina/beach-level
// predictions.

export const SKIPPY_PLACES = {
  // Home base
  "dartmouth": { slug: "dartmouth", name: "Dartmouth", lat: 50.3514, lon: -3.5803 },

  // South Hams coast anchors
  "salcombe": { slug: "salcombe", name: "Salcombe", lat: 50.2375, lon: -3.7684 },
  "kingsbridge": { slug: "kingsbridge", name: "Kingsbridge", lat: 50.2851, lon: -3.7767 },
  "bantham": { slug: "bantham", name: "Bantham", lat: 50.2794, lon: -3.8880 },
  "hope-cove": { slug: "hope-cove", name: "Hope Cove", lat: 50.2376, lon: -3.8585 },

  // Plymouth Sound anchors
  "plymouth": { slug: "plymouth", name: "Plymouth", lat: 50.3714, lon: -4.1427 },
  "wembury": { slug: "wembury", name: "Wembury", lat: 50.3169, lon: -4.0786 },
  "river-yealm": { slug: "river-yealm", name: "River Yealm", lat: 50.3330, lon: -4.0710 },

  // Torbay anchors
  "brixham": { slug: "brixham", name: "Brixham", lat: 50.3945, lon: -3.5151 },
  "torquay": { slug: "torquay", name: "Torquay", lat: 50.4619, lon: -3.5253 },

  // Teign
  "teignmouth": { slug: "teignmouth", name: "Teignmouth", lat: 50.5488, lon: -3.4985 },

  // Exe anchors
  "exmouth": { slug: "exmouth", name: "Exmouth", lat: 50.6170, lon: -3.4120 },

};
