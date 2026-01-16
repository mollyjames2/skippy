"use strict";

// Backend API base URL (Cloudflare Worker).
// Note: This is not secret (it will be visible in browser network calls),
// but it should not be user-configurable in the UI.
var SKIPPY_API_BASE = "https://skippy-api.moja-e44.workers.dev";
