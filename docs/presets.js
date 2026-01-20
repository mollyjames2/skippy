// docs/presets.js
// Updated: 2026-01-20
import { SKIPPY_PLACES } from "./shared/places.js";

// Presets are the locations shown in the location picker.
//
// This list is intentionally NOT very granular because the underlying forecast
// model resolution (~8km) can't reliably differentiate nearby micro-locations.
//
// Ordered: Dartmouth first.
export const SKIPPY_PRESETS = [
  // Home base
  SKIPPY_PLACES["dartmouth"],

  // South Hams coast anchors
  SKIPPY_PLACES["salcombe"],
  SKIPPY_PLACES["kingsbridge"],
  SKIPPY_PLACES["bantham"],
  SKIPPY_PLACES["hope-cove"],

  // Plymouth Sound anchors
  SKIPPY_PLACES["plymouth"],
  SKIPPY_PLACES["wembury"],
  SKIPPY_PLACES["river-yealm"],

  // Torbay anchors
  SKIPPY_PLACES["brixham"],
  SKIPPY_PLACES["torquay"],

  // Teign
  SKIPPY_PLACES["teignmouth"],

  // Exe
  SKIPPY_PLACES["exmouth"],
];
