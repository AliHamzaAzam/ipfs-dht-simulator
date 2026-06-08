/**
 * main.ts — Entry point.
 *
 * Instantiates a DHTController, mounts the SVG ring visualizer, and attaches
 * temporary dev buttons so the visualization can be exercised via `npm run dev`.
 * The inspector panels, brutalist styling, and final control layout are next task.
 */

import { DHTController } from "./controller.js";
import { RingView } from "./viz/index.js";

// ---------------------------------------------------------------------------
// Minimal page structure (temp dev layout — replaced in next task)
// ---------------------------------------------------------------------------

const app = document.getElementById("app")!;
app.style.cssText = `
  display: flex;
  flex-direction: column;
  align-items: center;
  min-height: 100vh;
  background: #0f172a;
  color: #e2e8f0;
  font-family: monospace;
  padding: 16px;
  box-sizing: border-box;
`;

// Title
const title = document.createElement("h1");
title.textContent = "IPFS DHT Visualizer";
title.style.cssText = "margin: 0 0 12px; font-size: 18px; color: #38bdf8; letter-spacing: 0.05em;";
app.appendChild(title);

// Ring container
const ringContainer = document.createElement("div");
ringContainer.style.cssText = `
  width: 560px;
  height: 560px;
  background: #1e293b;
  border: 1px solid #334155;
  border-radius: 4px;
`;
app.appendChild(ringContainer);

// Dev controls bar
const controls = document.createElement("div");
controls.style.cssText = `
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 16px;
  justify-content: center;
  max-width: 600px;
`;
app.appendChild(controls);

// Status line
const statusEl = document.createElement("div");
statusEl.style.cssText = `
  margin-top: 10px;
  font-size: 12px;
  color: #94a3b8;
  min-height: 20px;
  text-align: center;
`;
app.appendChild(statusEl);

function setStatus(msg: string): void {
  statusEl.textContent = msg;
}

// ---------------------------------------------------------------------------
// Button factory
// ---------------------------------------------------------------------------

function makeBtn(label: string, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.textContent = label;
  btn.style.cssText = `
    padding: 6px 12px;
    background: #1e293b;
    color: #e2e8f0;
    border: 1px solid #475569;
    border-radius: 3px;
    cursor: pointer;
    font-family: monospace;
    font-size: 12px;
  `;
  btn.addEventListener("mouseenter", () => { btn.style.borderColor = "#38bdf8"; });
  btn.addEventListener("mouseleave", () => { btn.style.borderColor = "#475569"; });
  btn.addEventListener("click", onClick);
  controls.appendChild(btn);
  return btn;
}

// ---------------------------------------------------------------------------
// Controller + view
// ---------------------------------------------------------------------------

const controller = new DHTController(4);
controller.reset(4, 5);

let view = new RingView(ringContainer, controller);

// ---------------------------------------------------------------------------
// Dev buttons
// ---------------------------------------------------------------------------

// Reset ring
makeBtn("Reset (4-bit, 5 nodes)", () => {
  view.stop();
  controller.reset(4, 5);
  setStatus("Ring reset: bits=4, 5 evenly-spaced nodes");
});

// Add node
makeBtn("Add node", () => {
  const name = `Node_${Date.now() % 1000}`;
  const ok = controller.addNode(name);
  setStatus(ok ? `Added ${name}` : `Could not add ${name} (id collision?)`);
});

// Remove selected
makeBtn("Remove selected", () => {
  const sel = controller.getState().selectedId;
  if (sel === null) { setStatus("No node selected — click a node first"); return; }
  const ok = controller.removeNode(sel);
  setStatus(ok ? `Removed node ${sel}` : `Remove failed`);
});

// Route a key
makeBtn("Route key=7", () => {
  const state = controller.getState();
  if (state.nodes.length === 0) { setStatus("No nodes — reset first"); return; }
  const startId = state.nodes[0]!.id;
  controller.startRoute(7, startId);
  setStatus(`Routing key=7 from node ${startId} — use Step/Play to animate`);
});

// Insert file
makeBtn("Insert 'hello.txt'", () => {
  const state = controller.getState();
  if (state.nodes.length === 0) { setStatus("No nodes — reset first"); return; }
  const startId = state.nodes[0]!.id;
  controller.startInsertFile("hello.txt", startId);
  const key = controller.hashName("hello.txt");
  setStatus(`Inserting "hello.txt" (key=${key}) from node ${startId}`);
});

// Search file
makeBtn("Search 'hello.txt'", () => {
  const state = controller.getState();
  if (state.nodes.length === 0) { setStatus("No nodes — reset first"); return; }
  const startId = state.nodes[0]!.id;
  const key = controller.hashName("hello.txt");
  controller.startSearchFile(key, startId);
  setStatus(`Searching "hello.txt" (key=${key}) from node ${startId}`);
});

// Delete file
makeBtn("Delete 'hello.txt'", () => {
  const state = controller.getState();
  if (state.nodes.length === 0) { setStatus("No nodes — reset first"); return; }
  const startId = state.nodes[0]!.id;
  const key = controller.hashName("hello.txt");
  controller.startDeleteFile(key, startId);
  setStatus(`Deleting "hello.txt" (key=${key}) from node ${startId}`);
});

// Step animation
makeBtn("Step ▶", () => {
  const state = controller.getState();
  if (!state.animation) { setStatus("No animation in progress"); return; }
  if (state.animation.done) { setStatus("Animation already complete"); return; }
  view.step();
});

// Play animation
makeBtn("Play ▶▶", () => {
  const state = controller.getState();
  if (!state.animation) { setStatus("No animation — start a route/insert/search first"); return; }
  setStatus("Auto-playing animation…");
  view.play();
});

// Finish animation
makeBtn("Finish ⏭", () => {
  controller.finishAnimation();
  setStatus("Animation finished");
});

// Re-mount view (demonstrates teardown)
makeBtn("Teardown + Remount", () => {
  view.teardown();
  view = new RingView(ringContainer, controller);
  setStatus("Visualization re-mounted");
});

setStatus("Ready — click a node to select it, or use the buttons above");
