// docs/presets.js
import { SKIPPY_PLACES } from "./common/places.js";

// Presets are grouped for UI only.
// Places come from SKIPPY_PLACES (single source of truth).
export const SKIPPY_PRESETS = [
  {
    group: "Plymouth",
    places: [
      SKIPPY_PLACES["plymouth"],
      SKIPPY_PLACES["royal-william-yard"],
      SKIPPY_PLACES["turnchapel"],
      SKIPPY_PLACES["oreston"],
      SKIPPY_PLACES["wembury"],
      SKIPPY_PLACES["river-yealm"]
    ]
  },
  {
    group: "Newton Ferrers and Noss Mayo",
    places: [
      SKIPPY_PLACES["newton-ferrers"],
      SKIPPY_PLACES["noss-mayo"]
    ]
  },
  {
    group: "Bigbury and Avon",
    places: [
      SKIPPY_PLACES["bigbury-on-sea"],
      SKIPPY_PLACES["river-avon-bantham"],
      SKIPPY_PLACES["bantham"],
      SKIPPY_PLACES["hope-cove"]
    ]
  },
  {
    group: "Salcombe and Kingsbridge",
    places: [
      SKIPPY_PLACES["salcombe"],
      SKIPPY_PLACES["kingsbridge"],
      SKIPPY_PLACES["kingsbridge-estuary"]
    ]
  },
  {
    group: "Dartmouth and River Dart",
    places: [
      SKIPPY_PLACES["dartmouth"],
      SKIPPY_PLACES["kingswear"],
      SKIPPY_PLACES["dittisham"],
      SKIPPY_PLACES["totnes"]
    ]
  },
  {
    group: "Torbay",
    places: [
      SKIPPY_PLACES["brixham"],
      SKIPPY_PLACES["paignton"],
      SKIPPY_PLACES["torquay"]
    ]
  },
  {
    group: "Teignmouth and Shaldon",
    places: [
      SKIPPY_PLACES["teignmouth"],
      SKIPPY_PLACES["shaldon"]
    ]
  },
  {
    group: "Exe Estuary",
    places: [
      SKIPPY_PLACES["dawlish"],
      SKIPPY_PLACES["dawlish-warren"],
      SKIPPY_PLACES["exmouth"],
      SKIPPY_PLACES["starcross"],
      SKIPPY_PLACES["topsham"]
    ]
  }
];

