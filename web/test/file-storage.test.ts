/**
 * Tests for file insert/search/delete wired into ChordRing, plus node-removal
 * redistribution.
 *
 * Cross-checked against the C++ binary using:
 *
 *   INIT 5 4  (5 nodes, 4-bit space; ids=0,3,6,9,12)
 *   hash("a")=1, "b"=2, "c"=3, "d"=4, "e"=5, "f"=6, "g"=7
 *
 *   INSERT a 0 → key=1, path: 0→3, stored at 3
 *   INSERT b 0 → key=2, path: 0→3, stored at 3
 *   INSERT c 0 → key=3, path: 0→3, stored at 3
 *   INSERT d 0 → key=4, path: 0→3→6, stored at 6
 *   INSERT e 0 → key=5, path: 0→3→6, stored at 6
 *   INSERT f 0 → key=6, path: 0→6, stored at 6
 *   INSERT g 0 → key=7, path: 0→6→9, stored at 9
 *
 *   PRINT_BTREE 3: [1, 2, 3]
 *   PRINT_BTREE 6: [4, 5, 6]
 *   PRINT_BTREE 9: [7]
 *
 *   REMOVE_MACHINE 3 → redistributes {1,2,3} to machine 6
 *   PRINT_BTREE 6: root=[5], left=[1,2,3,4], right=[6]
 *
 *   SEARCH 1 6 → found (after redistribution)
 *   SEARCH 2 6 → found
 *   SEARCH 3 6 → found
 */
import { describe, it, expect, beforeEach } from "vitest";
import { ChordRing } from "../src/chord.js";
import { hash } from "../src/hash.js";

// ---------------------------------------------------------------------------
// Setup: 4-bit ring, 5 nodes (ids: 0,3,6,9,12)
// ---------------------------------------------------------------------------

describe("insertFile — routes and stores in destination B-tree", () => {
  let ring: ChordRing;

  beforeEach(() => {
    ring = new ChordRing(4);
    ring.initialize(5); // ids: 0,3,6,9,12
  });

  it("hash('a', 4)=1 → routes to node 3", () => {
    expect(hash("a", 4)).toBe(1);
    const r = ring.insertFile("a", 0);
    expect(r.key).toBe(1);
    expect(r.destination).toBe(3);
    expect(r.path[0]).toBe(0);
    expect(r.path[r.path.length - 1]).toBe(3);
  });

  it("inserted file is searchable from destination node", () => {
    ring.insertFile("a", 0); // key=1, dest=3
    const r = ring.searchFile(1, 0);
    expect(r.value).toBe("a");
    expect(r.destination).toBe(3);
  });

  it("filesAt(3) returns {key:1, value:'a'} after insert", () => {
    ring.insertFile("a", 0);
    const files = ring.filesAt(3);
    expect(files).toEqual([{ key: 1, value: "a" }]);
  });

  it("multiple files routed to correct nodes (mirrors C++ output)", () => {
    // a→3, b→3, c→3, d→6, e→6, f→6, g→9
    ring.insertFile("a", 0);
    ring.insertFile("b", 0);
    ring.insertFile("c", 0);
    ring.insertFile("d", 0);
    ring.insertFile("e", 0);
    ring.insertFile("f", 0);
    ring.insertFile("g", 0);

    expect(ring.filesAt(3).map((e) => e.key)).toEqual([1, 2, 3]);
    expect(ring.filesAt(6).map((e) => e.key)).toEqual([4, 5, 6]);
    expect(ring.filesAt(9).map((e) => e.key)).toEqual([7]);
    expect(ring.filesAt(0)).toEqual([]);
    expect(ring.filesAt(12)).toEqual([]);
  });

  it("btreeAt(id) exposes a node's BTree for inspection", () => {
    ring.insertFile("a", 0);
    expect(ring.btreeAt(3)).toBeDefined();
    expect(ring.btreeAt(3)!.search(1)).toBe("a");
  });
});

// ---------------------------------------------------------------------------
// searchFile
// ---------------------------------------------------------------------------

describe("searchFile — routing + hit/miss", () => {
  let ring: ChordRing;

  beforeEach(() => {
    ring = new ChordRing(4);
    ring.initialize(5);
    ring.insertFile("a", 0); // key=1, dest=3
    ring.insertFile("d", 0); // key=4, dest=6
  });

  it("search for existing key returns value and correct destination", () => {
    const r = ring.searchFile(1, 0);
    expect(r.value).toBe("a");
    expect(r.destination).toBe(3);
    expect(r.key).toBe(1);
  });

  it("search for missing key returns null", () => {
    const r = ring.searchFile(7, 0);
    expect(r.value).toBeNull();
  });

  it("search routes correctly regardless of startId", () => {
    const r = ring.searchFile(4, 6);
    expect(r.value).toBe("d");
    expect(r.destination).toBe(6);
  });
});

// ---------------------------------------------------------------------------
// deleteFile
// ---------------------------------------------------------------------------

describe("deleteFile — removes from B-tree", () => {
  let ring: ChordRing;

  beforeEach(() => {
    ring = new ChordRing(4);
    ring.initialize(5);
    ring.insertFile("a", 0); // key=1, dest=3
    ring.insertFile("b", 0); // key=2, dest=3
  });

  it("delete existing key returns value and key is gone", () => {
    const r = ring.deleteFile(1, 0);
    expect(r.value).toBe("a");
    expect(r.destination).toBe(3);
    // Now searching should return null
    expect(ring.searchFile(1, 0).value).toBeNull();
  });

  it("delete non-existent key returns null value", () => {
    const r = ring.deleteFile(99, 0);
    expect(r.value).toBeNull();
  });

  it("remaining keys still searchable after partial delete", () => {
    ring.deleteFile(1, 0); // remove key=1 ("a")
    expect(ring.searchFile(2, 0).value).toBe("b"); // key=2 still there
  });
});

// ---------------------------------------------------------------------------
// removeNode redistribution — cross-checked vs C++ REMOVE_MACHINE 3
// ---------------------------------------------------------------------------

describe("removeNode — redistributes B-tree to ring-next successor", () => {
  let ring: ChordRing;

  beforeEach(() => {
    ring = new ChordRing(4);
    ring.initialize(5); // ids: 0,3,6,9,12
    ring.insertFile("a", 0); // key=1 → node 3
    ring.insertFile("b", 0); // key=2 → node 3
    ring.insertFile("c", 0); // key=3 → node 3
    ring.insertFile("d", 0); // key=4 → node 6
    ring.insertFile("e", 0); // key=5 → node 6
    ring.insertFile("f", 0); // key=6 → node 6
    ring.insertFile("g", 0); // key=7 → node 9
  });

  it("removeNode returns true and node is removed", () => {
    expect(ring.removeNode(3)).toBe(true);
    expect(ring.nodes().map((n) => n.id)).not.toContain(3);
  });

  it("files from removed node 3 move to successor node 6", () => {
    ring.removeNode(3);
    // C++: PRINT_BTREE 6 → root=[5], left=[1,2,3,4], right=[6]
    const keys6 = ring.filesAt(6).map((e) => e.key);
    // All of 1,2,3 (from node 3) and 4,5,6 (already at node 6) should be present
    expect(keys6).toContain(1);
    expect(keys6).toContain(2);
    expect(keys6).toContain(3);
    expect(keys6).toContain(4);
    expect(keys6).toContain(5);
    expect(keys6).toContain(6);
  });

  it("B-tree shape at node 6 after redistribution matches C++ PRINT_BTREE 6", () => {
    ring.removeNode(3);
    // C++ output: root=[5], left=[1,2,3,4], right=[6]
    const bt6 = ring.btreeAt(6)!;
    const root = bt6.root!;
    expect(root.keys).toEqual([5]);
    expect(root.isLeaf).toBe(false);
    expect(root.children[0]!.keys).toEqual([1, 2, 3, 4]);
    expect(root.children[1]!.keys).toEqual([6]);
  });

  it("previously-inserted files at node 6 are still searchable after redistribution", () => {
    ring.removeNode(3);
    // key=1 (was at node 3) is now at node 6; ring routes key=1 to findSuccessor(1)=6 now
    const r1 = ring.searchFile(1, 6);
    expect(r1.value).toBe("a");
    expect(r1.destination).toBe(6);

    const r4 = ring.searchFile(4, 0);
    expect(r4.value).toBe("d");
    expect(r4.destination).toBe(6);
  });

  it("files at other nodes (9, 12) are unaffected by the removal", () => {
    ring.removeNode(3);
    expect(ring.filesAt(9).map((e) => e.key)).toEqual([7]);
    expect(ring.filesAt(12)).toEqual([]);
  });

  it("node 3's B-tree is cleaned up (no store after removal)", () => {
    ring.removeNode(3);
    expect(ring.btreeAt(3)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// addNode starts with empty B-tree (C++ does not re-key on join)
// ---------------------------------------------------------------------------

describe("addNode — new node starts with empty B-tree", () => {
  it("newly added node has empty store", () => {
    const ring = new ChordRing(4);
    ring.initialize(5);
    ring.insertFile("a", 0); // key=1 → node 3
    ring.addNode("NewMachine", 2); // insert between 0 and 3
    // Node 2 should have empty B-tree; existing files at node 3 are not re-keyed
    expect(ring.filesAt(2)).toEqual([]);
    // key=1 is still at node 3 (was placed before addNode, C++ does not re-key)
    expect(ring.filesAt(3)).toEqual([{ key: 1, value: "a" }]);
  });
});

// ---------------------------------------------------------------------------
// Edge: single-node ring redistribution (no successor → no redistribution)
// ---------------------------------------------------------------------------

describe("removeNode with single node — no crash, cleans up", () => {
  it("removing the only node leaves an empty ring", () => {
    const ring = new ChordRing(4);
    ring.initialize(1); // single node at id=0
    ring.insertFile("a", 0);
    expect(ring.removeNode(0)).toBe(true);
    expect(ring.nodes()).toHaveLength(0);
    expect(ring.btreeAt(0)).toBeUndefined();
  });
});
