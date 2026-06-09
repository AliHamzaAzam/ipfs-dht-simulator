/**
 * main.ts — Entry point.
 *
 * Composes the brutalist terminal-frame layout: a dark "ring screen" pane that
 * hosts the SVG RingView + animation bar, and a light side pane with the
 * controls + inspector.  All panels share one DHTController and one status
 * line (owned by the animation bar).
 */

import "./styles/main.css";

import { DHTController } from "./controller.js";
import { RingView } from "./viz/index.js";
import { Controls, Inspector, AnimationBar } from "./ui/index.js";
import { el } from "./ui/dom.js";

// ---------------------------------------------------------------------------
// Controller + initial ring
// ---------------------------------------------------------------------------

const controller = new DHTController(4);
controller.reset(4, 5);

// ---------------------------------------------------------------------------
// Layout: terminal frame
// ---------------------------------------------------------------------------

const app = document.getElementById("app")!;

// Title bar
const titlebar = el("div", { className: "terminal-titlebar" }, [
  el("div", { className: "terminal-dots" }, [
    el("span", { className: "terminal-dot terminal-dot--red" }),
    el("span", { className: "terminal-dot terminal-dot--yellow" }),
    el("span", { className: "terminal-dot terminal-dot--green" }),
  ]),
  el("div", { className: "terminal-title" }, [
    document.createTextNode("IPFS DHT Visualizer"),
    el("span", { className: "sep", text: "▸" }),
    document.createTextNode("Chord Ring"),
  ]),
]);

// Ring screen (dark) pane — RingView mounts into ringContainer.
const ringContainer = el("div", { className: "ring-screen" });
const screenPane = el("div", { className: "pane pane--screen" }, [ringContainer]);

// Side pane (light): controls + inspector.
const sidePane = el("div", { className: "pane pane--side" });

const paneContainer = el("div", { className: "pane-container" }, [screenPane, sidePane]);

const frame = el("div", { className: "terminal-frame" }, [titlebar, paneContainer]);
app.append(frame);

// ---------------------------------------------------------------------------
// Mount RingView + UI panels
// ---------------------------------------------------------------------------

const view = new RingView(ringContainer, controller);

// Animation bar lives under the screen, on the dark pane.
const animationBar = new AnimationBar(controller, view);
screenPane.append(animationBar.element);

// Controls + inspector populate the side pane.
const controls = new Controls(controller, {
  setStatus: (msg) => animationBar.setStatus(msg),
});
const inspector = new Inspector(controller);
sidePane.append(controls.element, inspector.element);

animationBar.setStatus("Ready — click a node to inspect it, or start a route/file op");

// ---------------------------------------------------------------------------
// HMR cleanup (dev only) — keep subscriptions from leaking on hot reload.
// ---------------------------------------------------------------------------

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    controls.teardown();
    inspector.teardown();
    animationBar.teardown();
    view.teardown();
  });
}
