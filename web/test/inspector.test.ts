// @vitest-environment jsdom
/**
 * inspector.test.ts — Behavior tests for the selected-node inspector.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { DHTController } from "../src/controller.js";
import { Inspector } from "../src/ui/inspector.js";

describe("Inspector", () => {
  let controller: DHTController;

  beforeEach(() => {
    controller = new DHTController(4);
    controller.reset(4, 5);
  });

  it("shows a placeholder when no node is selected", () => {
    const inspector = new Inspector(controller);
    expect(controller.getState().selectedId).toBeNull();
    const placeholder = inspector.element.querySelector(".placeholder");
    expect(placeholder).not.toBeNull();
    expect((placeholder!.textContent ?? "").toLowerCase()).toContain("select a node");
    // No finger table rows when unselected.
    expect(inspector.element.querySelectorAll(".brutal-table tbody tr").length).toBe(0);
  });

  it("renders one finger row per finger when a node is selected", () => {
    const inspector = new Inspector(controller);
    const node = controller.getState().nodes[0]!;
    controller.selectNode(node.id);

    const rows = inspector.element.querySelectorAll(".brutal-table tbody tr");
    expect(rows.length).toBe(node.fingers.length);
    expect(node.fingers.length).toBe(4); // 4-bit ring → 4 fingers

    // First row shows the first finger's index/start/target.
    const firstFinger = node.fingers[0]!;
    const cells = rows[0]!.querySelectorAll("td");
    expect(cells[0]!.textContent).toBe(String(firstFinger.index));
    expect(cells[1]!.textContent).toBe(String(firstFinger.startId));
    expect(cells[2]!.textContent ?? "").toContain(String(firstFinger.targetId));
  });

  it("shows the selected node's stored files", () => {
    const inspector = new Inspector(controller);
    const startId = controller.getState().nodes[0]!.id;

    // Insert + finish so the file commits to its destination node.
    controller.startInsertFile("photo.png", startId);
    controller.finishAnimation();

    const dest = controller.getState().animation!.destination;
    controller.selectNode(dest);

    const fileItems = inspector.element.querySelectorAll(".files-list li");
    expect(fileItems.length).toBeGreaterThanOrEqual(1);
    const text = Array.from(fileItems)
      .map((li) => li.textContent ?? "")
      .join(" ");
    expect(text).toContain("photo.png");
    expect(text).toContain(String(controller.hashName("photo.png")));
  });

  it("shows 'empty' for a node with no files", () => {
    const inspector = new Inspector(controller);
    // Select a node and ensure it has no files (fresh ring → none stored).
    const node = controller.getState().nodes[0]!;
    controller.selectNode(node.id);

    // The "Stored files" subtitle should be followed by an 'empty' placeholder.
    const placeholders = Array.from(
      inspector.element.querySelectorAll(".placeholder")
    ).map((p) => (p.textContent ?? "").trim());
    expect(placeholders).toContain("empty");
  });

  it("reacts to deselection by returning to the placeholder", () => {
    const inspector = new Inspector(controller);
    const node = controller.getState().nodes[0]!;
    controller.selectNode(node.id);
    expect(inspector.element.querySelector(".brutal-table")).not.toBeNull();

    controller.selectNode(null);
    expect(inspector.element.querySelector(".brutal-table")).toBeNull();
    expect(inspector.element.querySelector(".placeholder")).not.toBeNull();
  });
});
