/**
 * Tests for chord.ts — cross-checked against the C++ reference binary.
 *
 * Ground-truth routing paths and finger tables obtained by running the
 * compiled C++ simulator (build/ipfs_dht) with the following commands:
 *
 *   INIT 5 4   → 5 nodes in 4-bit space, ids = 0, 3, 6, 9, 12
 *   PRINT_RT 0 → fingers: (1,1,3),(2,2,3),(3,4,6),(4,8,9)
 *   PRINT_RT 3 → fingers: (1,4,6),(2,5,6),(3,7,9),(4,11,12)
 *   PRINT_RT 6 → fingers: (1,7,9),(2,8,9),(3,10,12),(4,14,0)
 *   PRINT_RT 9 → fingers: (1,10,12),(2,11,12),(3,13,0),(4,1,3)
 *   PRINT_RT 12→ fingers: (1,13,0),(2,14,0),(3,0,0),(4,4,6)
 *   SEARCH 5 0 → path 0 → 3 → 6
 *   SEARCH 5 3 → path 3 → 6
 *   SEARCH 14 0→ path 0
 *   SEARCH 2 0 → path 0 → 3
 *   SEARCH 7 0 → path 0 → 6 → 9
 *   SEARCH 13 12→ path 12 → 0
 *   SEARCH 1 12→ path 12 → 0 → 3
 *   SEARCH 8 12→ path 12 → 6 → 9
 *
 *   INIT 8 5   → 8 nodes in 5-bit space, ids = 0,4,8,12,16,20,24,28
 *   SEARCH 15 0 → path 0 → 8 → 12 → 16
 *   SEARCH 1 0  → path 0 → 4
 *   SEARCH 31 0 → path 0   (successor wraps to 0)
 */
import { describe, it, expect, beforeEach } from "vitest";
import { ChordRing } from "../src/chord.js";

// ---------------------------------------------------------------------------
// findSuccessor
// ---------------------------------------------------------------------------

describe("findSuccessor()", () => {
  let ring: ChordRing;
  beforeEach(() => {
    ring = new ChordRing(4);
    ring.initialize(5); // ids: 0, 3, 6, 9, 12
  });

  it("exact match returns that node", () => {
    expect(ring.findSuccessor(0)).toBe(0);
    expect(ring.findSuccessor(3)).toBe(3);
    expect(ring.findSuccessor(12)).toBe(12);
  });

  it("between two nodes returns next higher", () => {
    expect(ring.findSuccessor(1)).toBe(3);
    expect(ring.findSuccessor(4)).toBe(6);
    expect(ring.findSuccessor(7)).toBe(9);
    expect(ring.findSuccessor(10)).toBe(12);
  });

  it("wraparound: id > max node returns head (0)", () => {
    expect(ring.findSuccessor(13)).toBe(0);
    expect(ring.findSuccessor(14)).toBe(0);
    expect(ring.findSuccessor(15)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// initialize() — evenly spaced ids
// ---------------------------------------------------------------------------

describe("initialize()", () => {
  it("4-bit space, 5 nodes → ids 0,3,6,9,12", () => {
    const ring = new ChordRing(4);
    ring.initialize(5);
    const ids = ring.nodes().map((n) => n.id);
    expect(ids).toEqual([0, 3, 6, 9, 12]);
  });

  it("5-bit space, 8 nodes → ids 0,4,8,12,16,20,24,28", () => {
    const ring = new ChordRing(5);
    ring.initialize(8);
    const ids = ring.nodes().map((n) => n.id);
    expect(ids).toEqual([0, 4, 8, 12, 16, 20, 24, 28]);
  });

  it("nodes are named Machine_<id>", () => {
    const ring = new ChordRing(4);
    ring.initialize(5);
    const names = ring.nodes().map((n) => n.name);
    expect(names).toEqual(["Machine_0", "Machine_3", "Machine_6", "Machine_9", "Machine_12"]);
  });
});

// ---------------------------------------------------------------------------
// Finger table construction
// C++ reference: INIT 5 4 → PRINT_RT <id>
// ---------------------------------------------------------------------------

describe("finger tables — bits=4, initialize(5)", () => {
  let ring: ChordRing;
  beforeEach(() => {
    ring = new ChordRing(4);
    ring.initialize(5);
  });

  function fingersOf(id: number) {
    const node = ring.nodes().find((n) => n.id === id);
    if (!node) throw new Error(`Node ${id} not found`);
    return node.fingers.map((f) => ({ i: f.index, start: f.startId, succ: f.targetId }));
  }

  it("machine 0 fingers", () => {
    expect(fingersOf(0)).toEqual([
      { i: 1, start: 1, succ: 3 },
      { i: 2, start: 2, succ: 3 },
      { i: 3, start: 4, succ: 6 },
      { i: 4, start: 8, succ: 9 },
    ]);
  });

  it("machine 3 fingers", () => {
    expect(fingersOf(3)).toEqual([
      { i: 1, start: 4, succ: 6 },
      { i: 2, start: 5, succ: 6 },
      { i: 3, start: 7, succ: 9 },
      { i: 4, start: 11, succ: 12 },
    ]);
  });

  it("machine 6 fingers", () => {
    expect(fingersOf(6)).toEqual([
      { i: 1, start: 7, succ: 9 },
      { i: 2, start: 8, succ: 9 },
      { i: 3, start: 10, succ: 12 },
      { i: 4, start: 14, succ: 0 }, // wraparound
    ]);
  });

  it("machine 9 fingers", () => {
    expect(fingersOf(9)).toEqual([
      { i: 1, start: 10, succ: 12 },
      { i: 2, start: 11, succ: 12 },
      { i: 3, start: 13, succ: 0 }, // wraparound
      { i: 4, start: 1,  succ: 3 }, // wraparound (9+8=17 → 17%16=1)
    ]);
  });

  it("machine 12 fingers", () => {
    expect(fingersOf(12)).toEqual([
      { i: 1, start: 13, succ: 0 }, // wraparound
      { i: 2, start: 14, succ: 0 }, // wraparound
      { i: 3, start: 0,  succ: 0 }, // 12+4=16 → 16%16=0; findSuccessor(0)=0
      { i: 4, start: 4,  succ: 6 },
    ]);
  });
});

// ---------------------------------------------------------------------------
// route() — hop paths
// All paths verified against the C++ binary.
// ---------------------------------------------------------------------------

describe("route() — bits=4, initialize(5)", () => {
  let ring: ChordRing;
  beforeEach(() => {
    ring = new ChordRing(4);
    ring.initialize(5);
  });

  it("SEARCH 5 0 → path [0,3,6], dest=6", () => {
    const r = ring.route(5, 0);
    expect(r.path).toEqual([0, 3, 6]);
    expect(r.destination).toBe(6);
  });

  it("SEARCH 5 3 → path [3,6], dest=6", () => {
    const r = ring.route(5, 3);
    expect(r.path).toEqual([3, 6]);
    expect(r.destination).toBe(6);
  });

  it("SEARCH 14 0 → path [0], dest=0 (wraparound: succ(14)=0)", () => {
    const r = ring.route(14, 0);
    expect(r.path).toEqual([0]);
    expect(r.destination).toBe(0);
  });

  it("SEARCH 2 0 → path [0,3], dest=3", () => {
    const r = ring.route(2, 0);
    expect(r.path).toEqual([0, 3]);
    expect(r.destination).toBe(3);
  });

  it("SEARCH 7 0 → path [0,6,9], dest=9", () => {
    const r = ring.route(7, 0);
    expect(r.path).toEqual([0, 6, 9]);
    expect(r.destination).toBe(9);
  });

  it("SEARCH 13 12 → path [12,0], dest=0", () => {
    const r = ring.route(13, 12);
    expect(r.path).toEqual([12, 0]);
    expect(r.destination).toBe(0);
  });

  it("SEARCH 1 12 → path [12,0,3], dest=3", () => {
    const r = ring.route(1, 12);
    expect(r.path).toEqual([12, 0, 3]);
    expect(r.destination).toBe(3);
  });

  it("SEARCH 8 12 → path [12,6,9], dest=9", () => {
    const r = ring.route(8, 12);
    expect(r.path).toEqual([12, 6, 9]);
    expect(r.destination).toBe(9);
  });
});

describe("route() — bits=5, initialize(8)", () => {
  let ring: ChordRing;
  beforeEach(() => {
    ring = new ChordRing(5);
    ring.initialize(8); // ids: 0,4,8,12,16,20,24,28
  });

  it("SEARCH 15 0 → path [0,8,12,16], dest=16", () => {
    const r = ring.route(15, 0);
    expect(r.path).toEqual([0, 8, 12, 16]);
    expect(r.destination).toBe(16);
  });

  it("SEARCH 1 0 → path [0,4], dest=4", () => {
    const r = ring.route(1, 0);
    expect(r.path).toEqual([0, 4]);
    expect(r.destination).toBe(4);
  });

  it("SEARCH 31 0 → path [0], dest=0 (wraparound: succ(31)=0)", () => {
    const r = ring.route(31, 0);
    expect(r.path).toEqual([0]);
    expect(r.destination).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// addNode / removeNode
// ---------------------------------------------------------------------------

describe("addNode() and removeNode()", () => {
  it("addNode with explicit id inserts sorted", () => {
    const ring = new ChordRing(4);
    ring.initialize(3); // ids: 0, 5, 10 (spacing = floor(16/3) = 5)
    ring.addNode("NewNode", 7);
    const ids = ring.nodes().map((n) => n.id);
    expect(ids).toContain(7);
    // Must remain sorted
    const sorted = [...ids].sort((a, b) => a - b);
    expect(ids).toEqual(sorted);
  });

  it("addNode duplicate id returns false", () => {
    const ring = new ChordRing(4);
    ring.initialize(5);
    expect(ring.addNode("Dup", 0)).toBe(false);
  });

  it("removeNode removes node and returns true", () => {
    const ring = new ChordRing(4);
    ring.initialize(5);
    expect(ring.removeNode(6)).toBe(true);
    const ids = ring.nodes().map((n) => n.id);
    expect(ids).not.toContain(6);
    expect(ids).toHaveLength(4);
  });

  it("removeNode non-existent returns false", () => {
    const ring = new ChordRing(4);
    ring.initialize(5);
    expect(ring.removeNode(99)).toBe(false);
  });

  it("finger tables rebuilt after addNode", () => {
    const ring = new ChordRing(4);
    ring.initialize(5);
    ring.addNode("Extra", 2);
    // findSuccessor(1) should now find 2 (not 3)
    expect(ring.findSuccessor(1)).toBe(2);
    // machine 0 finger 1: startId=1, targetId=2
    const machine0 = ring.nodes().find((n) => n.id === 0)!;
    expect(machine0.fingers[0]!.targetId).toBe(2);
  });

  it("finger tables rebuilt after removeNode", () => {
    const ring = new ChordRing(4);
    ring.initialize(5);
    ring.removeNode(3);
    // findSuccessor(1) should now find 6 (not 3)
    expect(ring.findSuccessor(1)).toBe(6);
  });

  it("addNode rejects an explicit id outside [0, 2^bits)", () => {
    const ring = new ChordRing(4); // ids 0..15
    ring.initialize(3);
    expect(ring.addNode("Neg", -1)).toBe(false);
    expect(ring.addNode("Big", 16)).toBe(false);
    expect(ring.nodes().every((n) => n.id >= 0 && n.id < 16)).toBe(true);
  });

  it("initialize throws when n is out of [1, 2^bits]", () => {
    const ring = new ChordRing(4); // 16 ids
    expect(() => ring.initialize(20)).toThrow(RangeError);
    expect(() => ring.initialize(0)).toThrow(RangeError);
  });
});
