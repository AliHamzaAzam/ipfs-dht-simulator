// Entry point — visualization and UI will be built in later tasks.
// For now, expose the ring engine on the window for manual testing in the browser console.
import { ChordRing } from "./chord.js";

const app = document.getElementById("app");
if (app) {
  app.textContent = "IPFS DHT Visualizer (initializing…)";
}

// Expose for console access during development
(globalThis as Record<string, unknown>)["ChordRing"] = ChordRing;
