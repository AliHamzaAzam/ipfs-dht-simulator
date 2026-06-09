// @vitest-environment jsdom
/**
 * controls.test.ts — Behavior tests for the brutalist control panel.
 *
 * Uses jsdom (per-file override) so the Controls panel can build real DOM and
 * we can simulate clicks/inputs.  We assert effects through the controller's
 * observable state (getState) rather than spying on private methods.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { DHTController } from "../src/controller.js";
import { Controls } from "../src/ui/controls.js";

let statusMsg = "";
function makeControls(controller: DHTController): Controls {
  statusMsg = "";
  return new Controls(controller, { setStatus: (m) => (statusMsg = m) });
}

function byText<T extends Element>(root: ParentNode, selector: string, text: string): T {
  const matches = Array.from(root.querySelectorAll(selector)).filter(
    (e) => (e.textContent ?? "").trim() === text
  );
  if (matches.length === 0) throw new Error(`No <${selector}> with text "${text}"`);
  return matches[0] as unknown as T;
}

describe("Controls", () => {
  let controller: DHTController;

  beforeEach(() => {
    controller = new DHTController(4);
    controller.reset(4, 3);
  });

  it("Add node increases the node count", () => {
    const controls = makeControls(controller);
    const before = controller.getState().nodes.length;

    const nameInput = controls.element.querySelector(
      'input[placeholder="name (optional)"]'
    ) as HTMLInputElement;
    nameInput.value = "alpha";
    nameInput.dispatchEvent(new Event("input"));

    byText<HTMLButtonElement>(controls.element, "button", "Add node").click();

    const state = controller.getState();
    expect(state.nodes.length).toBe(before + 1);
    expect(state.nodes.some((n) => n.name === "alpha")).toBe(true);
  });

  it("Add node with an explicit id places the node at that id", () => {
    const controls = makeControls(controller);
    // pick an id not currently used
    const used = new Set(controller.getState().nodes.map((n) => n.id));
    let freeId = 0;
    while (used.has(freeId)) freeId++;

    const idInput = controls.element.querySelector(
      'input[placeholder="id"]'
    ) as HTMLInputElement;
    idInput.value = String(freeId);
    idInput.dispatchEvent(new Event("input"));

    byText<HTMLButtonElement>(controls.element, "button", "Add node").click();

    expect(controller.getState().nodes.some((n) => n.id === freeId)).toBe(true);
  });

  it("Remove sel. with no selection shows a hint and does not remove", () => {
    const controls = makeControls(controller);
    const before = controller.getState().nodes.length;

    byText<HTMLButtonElement>(controls.element, "button", "Remove sel.").click();

    expect(controller.getState().nodes.length).toBe(before);
    expect(statusMsg.toLowerCase()).toContain("no node selected");
  });

  it("Remove sel. removes the currently selected node", () => {
    const controls = makeControls(controller);
    const target = controller.getState().nodes[0]!.id;
    controller.selectNode(target);
    const before = controller.getState().nodes.length;

    byText<HTMLButtonElement>(controls.element, "button", "Remove sel.").click();

    const state = controller.getState();
    expect(state.nodes.length).toBe(before - 1);
    expect(state.nodes.some((n) => n.id === target)).toBe(false);
  });

  it("Rebuild with bits=3, n=4 yields 4 nodes in a 3-bit ring", () => {
    const controls = makeControls(controller);

    const bitsSelect = controls.element.querySelector("select") as HTMLSelectElement;
    bitsSelect.value = "3";
    const countInput = controls.element.querySelector(
      'input[type="number"]'
    ) as HTMLInputElement;
    countInput.value = "4";

    byText<HTMLButtonElement>(controls.element, "button", "Rebuild").click();

    const state = controller.getState();
    expect(state.bits).toBe(3);
    expect(state.nodes.length).toBe(4);
  });

  it("Rebuild clamps node count to 2^bits", () => {
    const controls = makeControls(controller);

    const bitsSelect = controls.element.querySelector("select") as HTMLSelectElement;
    bitsSelect.value = "3"; // max 8 nodes
    const countInput = controls.element.querySelector(
      'input[type="number"]'
    ) as HTMLInputElement;
    countInput.value = "100";

    byText<HTMLButtonElement>(controls.element, "button", "Rebuild").click();

    expect(controller.getState().nodes.length).toBe(8);
  });

  it("Hash inspector live-shows controller.hashName(value)", () => {
    const controls = makeControls(controller);
    const input = controls.element.querySelector(
      'input[placeholder="any string"]'
    ) as HTMLInputElement;

    input.value = "ipfs";
    input.dispatchEvent(new Event("input"));

    const readout = input
      .closest(".section")!
      .querySelector(".hash-key") as HTMLElement;
    expect(readout.textContent).toBe(String(controller.hashName("ipfs")));
  });

  it("Route button starts a route animation toward the entered key", () => {
    const controls = makeControls(controller);
    // the route group's key input is the only number input inside the Route section
    const routeSection = Array.from(controls.element.querySelectorAll(".section")).find(
      (s) => (s.querySelector(".section__title")?.textContent ?? "") === "Route"
    )!;
    const routeKey = routeSection.querySelector(
      'input[type="number"]'
    ) as HTMLInputElement;
    routeKey.value = "5";

    byText<HTMLButtonElement>(controls.element, "button", "Route").click();

    const anim = controller.getState().animation;
    expect(anim).not.toBeNull();
    expect(anim!.kind).toBe("route");
    expect(anim!.key).toBe(5);
  });

  it("Insert button starts an insert animation for the named file", () => {
    const controls = makeControls(controller);
    const fileSection = Array.from(controls.element.querySelectorAll(".section")).find(
      (s) => (s.querySelector(".section__title")?.textContent ?? "") === "File"
    )!;
    const nameInput = fileSection.querySelector(
      'input[type="text"]'
    ) as HTMLInputElement;
    nameInput.value = "report.pdf";
    nameInput.dispatchEvent(new Event("input"));

    byText<HTMLButtonElement>(controls.element, "button", "Insert").click();

    const anim = controller.getState().animation;
    expect(anim).not.toBeNull();
    expect(anim!.kind).toBe("insert");
    expect(anim!.value).toBe("report.pdf");
    expect(anim!.key).toBe(controller.hashName("report.pdf"));
  });

  it("node-select options refresh when the ring changes", () => {
    const controls = makeControls(controller);
    const routeSection = Array.from(controls.element.querySelectorAll(".section")).find(
      (s) => (s.querySelector(".section__title")?.textContent ?? "") === "Route"
    )!;
    const startSelect = routeSection.querySelector("select") as HTMLSelectElement;
    const before = startSelect.options.length;

    controller.addNode("extra-node");

    expect(startSelect.options.length).toBe(before + 1);
  });
});
