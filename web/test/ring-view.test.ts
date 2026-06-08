/**
 * ring-view.test.ts — Smoke tests for the SVG ring visualizer.
 *
 * vitest is configured with environment:"node", so we provide a minimal DOM
 * shim manually rather than importing jsdom.  We only verify observable
 * side-effects (element creation, subscribe/unsubscribe, teardown) — not
 * pixel-perfect rendering.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { DHTController } from "../src/controller.js";

// ---------------------------------------------------------------------------
// Minimal DOM shim (sufficient for createElementNS + appendChild)
// ---------------------------------------------------------------------------

type FakeEl = {
  tagName: string;
  attrs: Record<string, string>;
  children: FakeEl[];
  listeners: Record<string, Array<(e: unknown) => void>>;
  parentElement: FakeEl | null;
  style: Record<string, string>;
  firstChild: FakeEl | null;
  textContent: string;
  setAttribute(k: string, v: string): void;
  getAttribute(k: string): string | null;
  appendChild(child: FakeEl): FakeEl;
  removeChild(child: FakeEl): FakeEl;
  addEventListener(type: string, fn: (e: unknown) => void): void;
  querySelector(sel: string): FakeEl | null;
  querySelectorAll(sel: string): FakeEl[];
};

function makeEl(tag: string): FakeEl {
  const el: FakeEl = {
    tagName: tag,
    attrs: {},
    children: [],
    listeners: {},
    parentElement: null,
    style: new Proxy({} as Record<string, string>, {
      set(t, k, v) { t[String(k)] = v; return true; },
      get(t, k) { return t[String(k)] ?? ""; },
    }),
    get firstChild() { return el.children[0] ?? null; },
    set textContent(v: string) { el.attrs["__text"] = v; },
    get textContent() { return el.attrs["__text"] ?? ""; },
    setAttribute(k, v) { el.attrs[k] = v; },
    getAttribute(k) { return el.attrs[k] ?? null; },
    appendChild(child: FakeEl) {
      child.parentElement = el;
      el.children.push(child);
      return child;
    },
    removeChild(child: FakeEl) {
      const idx = el.children.indexOf(child);
      if (idx !== -1) el.children.splice(idx, 1);
      child.parentElement = null;
      return child;
    },
    addEventListener(type, fn) {
      if (!el.listeners[type]) el.listeners[type] = [];
      el.listeners[type]!.push(fn);
    },
    querySelector(sel: string) {
      // Simple tag-only selector
      const tag = sel.toLowerCase();
      function search(node: FakeEl): FakeEl | null {
        for (const c of node.children) {
          if (c.tagName.toLowerCase() === tag) return c;
          const found = search(c);
          if (found) return found;
        }
        return null;
      }
      return search(el);
    },
    querySelectorAll(sel: string) {
      const tag = sel.toLowerCase();
      const results: FakeEl[] = [];
      function search(node: FakeEl): void {
        for (const c of node.children) {
          if (c.tagName.toLowerCase() === tag) results.push(c);
          search(c);
        }
      }
      search(el);
      return results;
    },
  };
  return el;
}

// Patch globals before importing RingView
let savedDoc: unknown;
let savedWin: unknown;

function installShim(container: FakeEl): void {
  savedDoc = (globalThis as Record<string, unknown>)["document"];
  savedWin = (globalThis as Record<string, unknown>)["window"];

  const fakeDoc = {
    createElementNS(_ns: string, tag: string) { return makeEl(tag); },
    getElementById(_id: string) { return container; },
  };
  (globalThis as Record<string, unknown>)["document"] = fakeDoc;
  (globalThis as Record<string, unknown>)["window"] = {};
}

function uninstallShim(): void {
  (globalThis as Record<string, unknown>)["document"] = savedDoc;
  (globalThis as Record<string, unknown>)["window"] = savedWin;
}

// ---------------------------------------------------------------------------
// Lazy import — module must be imported after shim is installed so that
// document.createElementNS resolves to our fake.
// ---------------------------------------------------------------------------
let RingViewClass: typeof import("../src/viz/index.js")["RingView"];

async function getView(ctrl: DHTController, container: FakeEl) {
  if (!RingViewClass) {
    const mod = await import("../src/viz/index.js");
    RingViewClass = mod.RingView;
  }
  // RingView reads container.clientWidth/clientHeight; add them
  (container as unknown as Record<string, unknown>)["clientWidth"] = 600;
  (container as unknown as Record<string, unknown>)["clientHeight"] = 600;
  return new RingViewClass(container as unknown as HTMLElement, ctrl);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("RingView — DOM smoke (node env, minimal shim)", () => {
  let container: FakeEl;

  beforeEach(() => {
    container = makeEl("div");
    installShim(container);
  });

  afterEach(() => {
    uninstallShim();
  });

  it("appends an svg element to the container", async () => {
    const ctrl = new DHTController(4);
    ctrl.reset(4, 5);
    const view = await getView(ctrl, container);
    expect(container.querySelector("svg")).not.toBeNull();
    view.teardown();
  });

  it("teardown removes the svg element from the container", async () => {
    const ctrl = new DHTController(4);
    ctrl.reset(4, 5);
    const view = await getView(ctrl, container);
    expect(container.querySelector("svg")).not.toBeNull();
    view.teardown();
    expect(container.querySelector("svg")).toBeNull();
  });

  it("renders circle elements for each node", async () => {
    const ctrl = new DHTController(4);
    ctrl.reset(4, 5);
    const view = await getView(ctrl, container);
    const circles = container.querySelectorAll("circle");
    // 5 node circles + guide circle + possible file badges/highlights
    expect(circles.length).toBeGreaterThanOrEqual(5);
    view.teardown();
  });

  it("re-renders on state change when a node is added", async () => {
    const ctrl = new DHTController(4);
    ctrl.reset(4, 3);
    const view = await getView(ctrl, container);
    const before = container.querySelectorAll("circle").length;
    ctrl.addNode("NewNode", 9);
    const after = container.querySelectorAll("circle").length;
    expect(after).toBeGreaterThan(before);
    view.teardown();
  });

  it("step() advances animation without throwing", async () => {
    const ctrl = new DHTController(4);
    ctrl.reset(4, 5);
    const startId = ctrl.getState().nodes[0]!.id;
    ctrl.startRoute(7, startId);
    const view = await getView(ctrl, container);
    expect(() => view.step()).not.toThrow();
    view.teardown();
  });

  it("play() and stop() do not throw", async () => {
    const ctrl = new DHTController(4);
    ctrl.reset(4, 5);
    const startId = ctrl.getState().nodes[0]!.id;
    ctrl.startInsertFile("test.txt", startId);
    const view = await getView(ctrl, container);
    expect(() => view.play()).not.toThrow();
    expect(() => view.stop()).not.toThrow();
    view.teardown();
  });

  it("selectNode updates selectedId on the controller", async () => {
    const ctrl = new DHTController(4);
    ctrl.reset(4, 5);
    const view = await getView(ctrl, container);
    const id = ctrl.getState().nodes[2]!.id;
    ctrl.selectNode(id);
    expect(ctrl.getState().selectedId).toBe(id);
    view.teardown();
  });

  it("finishAnimation renders done state without throwing", async () => {
    const ctrl = new DHTController(4);
    ctrl.reset(4, 5);
    const startId = ctrl.getState().nodes[0]!.id;
    ctrl.startInsertFile("done.txt", startId);
    ctrl.finishAnimation();
    const view = await getView(ctrl, container);
    expect(container.querySelector("svg")).not.toBeNull();
    view.teardown();
  });
});
