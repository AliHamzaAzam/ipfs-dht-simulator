/**
 * Tests for layout.ts — pure ring geometry.
 *
 * bits=2 gives 4 positions (id 0..3) with clean 90° increments, making exact
 * floating-point verification straightforward.
 *
 * Ring: cx=100, cy=100, radius=100
 *   id 0 → top    (12 o'clock): x=100, y=0
 *   id 1 → right  (3 o'clock):  x=200, y=100
 *   id 2 → bottom (6 o'clock):  x=100, y=200
 *   id 3 → left   (9 o'clock):  x=0,   y=100
 */
import { describe, it, expect } from "vitest";
import { idToPoint, fractionToPoint, RingGeometry } from "../src/layout.js";

const EPS = 1e-9;

function approx(a: number, b: number): boolean {
  return Math.abs(a - b) < EPS;
}

const geo: RingGeometry = { cx: 100, cy: 100, radius: 100, bits: 2 };

describe("idToPoint — bits=2, centred at (100,100), r=100", () => {
  it("id 0 → top (100, 0)", () => {
    const p = idToPoint(0, geo);
    expect(approx(p.x, 100)).toBe(true);
    expect(approx(p.y, 0)).toBe(true);
  });

  it("id 1 → right (200, 100)", () => {
    const p = idToPoint(1, geo);
    expect(approx(p.x, 200)).toBe(true);
    expect(approx(p.y, 100)).toBe(true);
  });

  it("id 2 → bottom (100, 200)", () => {
    const p = idToPoint(2, geo);
    expect(approx(p.x, 100)).toBe(true);
    expect(approx(p.y, 200)).toBe(true);
  });

  it("id 3 → left (0, 100)", () => {
    const p = idToPoint(3, geo);
    expect(approx(p.x, 0)).toBe(true);
    expect(approx(p.y, 100)).toBe(true);
  });
});

describe("idToPoint — bits=4, 5 nodes, centred at (200,200), r=150", () => {
  const geo4: RingGeometry = { cx: 200, cy: 200, radius: 150, bits: 4 };
  // id 0 is still at the top regardless of ring size
  it("id 0 → top (cx, cy - radius)", () => {
    const p = idToPoint(0, geo4);
    expect(approx(p.x, 200)).toBe(true);
    expect(approx(p.y, 50)).toBe(true);
  });

  // id 8 = modValue/2 → bottom (halfway around the ring)
  it("id 8 (=2^4/2) → bottom (cx, cy + radius)", () => {
    const p = idToPoint(8, geo4);
    expect(approx(p.x, 200)).toBe(true);
    expect(approx(p.y, 350)).toBe(true);
  });

  // id 4 = modValue/4 → right (quarter way)
  it("id 4 (=2^4/4) → right (cx + radius, cy)", () => {
    const p = idToPoint(4, geo4);
    expect(approx(p.x, 350)).toBe(true);
    expect(approx(p.y, 200)).toBe(true);
  });
});

describe("fractionToPoint", () => {
  it("t=0 → top (same as id=0)", () => {
    const p = fractionToPoint(0, geo);
    expect(approx(p.x, 100)).toBe(true);
    expect(approx(p.y, 0)).toBe(true);
  });

  it("t=0.25 → right", () => {
    const p = fractionToPoint(0.25, geo);
    expect(approx(p.x, 200)).toBe(true);
    expect(approx(p.y, 100)).toBe(true);
  });

  it("t=0.5 → bottom", () => {
    const p = fractionToPoint(0.5, geo);
    expect(approx(p.x, 100)).toBe(true);
    expect(approx(p.y, 200)).toBe(true);
  });

  it("t=0.75 → left", () => {
    const p = fractionToPoint(0.75, geo);
    expect(approx(p.x, 0)).toBe(true);
    expect(approx(p.y, 100)).toBe(true);
  });

  it("idToPoint and fractionToPoint agree for all bits=2 ids", () => {
    for (let id = 0; id < 4; id++) {
      const p1 = idToPoint(id, geo);
      const p2 = fractionToPoint(id / 4, geo);
      expect(approx(p1.x, p2.x)).toBe(true);
      expect(approx(p1.y, p2.y)).toBe(true);
    }
  });
});
