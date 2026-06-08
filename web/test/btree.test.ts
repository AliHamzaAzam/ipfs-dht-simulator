/**
 * Tests for btree.ts — order-5 B-tree split/borrow/merge correctness.
 *
 * Cross-checked against the C++ reference binary (build/ipfs_dht) using:
 *
 *   INIT 1 8  (single node, 8-bit space)
 *   INSERT <file> 0  — C++ INSERT hashes the filepath (falls back to hash(name)
 *                      since the files don't exist), identical to hash(name,8)
 *   PRINT_BTREE 0    — verified structural output
 *
 * Keys used (hash("a"..8-bit)=97, "b"→98, "c"→99, "d"→100, "e"→101,
 *            "f"→102, "g"→103, "h"→104, "i"→105, "j"→106):
 *
 * After inserting a..g (keys 97..103):
 *   C++ PRINT_BTREE 0:
 *       [99]
 *           [97, 98]
 *           [100, 101, 102, 103]
 *
 * After inserting a..j (keys 97..106):
 *   C++ PRINT_BTREE 0:
 *       [99, 102]
 *           [97, 98]
 *           [100, 101]
 *           [103, 104, 105, 106]
 *
 * Borrow test (10 inserts, then delete 97, delete 98):
 *   After delete 97:  root=[102], left=[98,99,100,101], right=[103,104,105,106]
 *   After delete 98:  root=[102], left=[99,100,101], right=[103,104,105,106]
 *
 * Merge test (7 inserts, delete 99, delete 101, delete 102):
 *   After delete 99:   root=[100], left=[97,98], right=[101,102,103]
 *   After delete 101:  root=[100], left=[97,98], right=[102,103]
 *   After delete 102:  root=null, flat=[97,98,100,103]
 */
import { describe, it, expect, beforeEach } from "vitest";
import { BTree } from "../src/btree.js";

// ---------------------------------------------------------------------------
// Helper: collect keys/values in order
// ---------------------------------------------------------------------------
function entries(t: BTree) {
  return t.getAllEntries();
}

function keys(t: BTree) {
  return entries(t).map((e) => e.key);
}

// ---------------------------------------------------------------------------
// Basic insert + search + remove (leaf-only, no split needed)
// ---------------------------------------------------------------------------

describe("BTree basics — no split", () => {
  let t: BTree;
  beforeEach(() => {
    t = new BTree(5);
  });

  it("empty tree has no root and returns null on search", () => {
    expect(t.isEmpty()).toBe(true);
    expect(t.search(1)).toBeNull();
    expect(t.root).toBeNull();
  });

  it("insert and search single entry", () => {
    t.insert(10, "fileA");
    expect(t.search(10)).toBe("fileA");
    expect(t.isEmpty()).toBe(false);
  });

  it("insert 4 keys (max leaf, no split), sorted order preserved", () => {
    t.insert(40, "d");
    t.insert(10, "a");
    t.insert(30, "c");
    t.insert(20, "b");
    expect(keys(t)).toEqual([10, 20, 30, 40]);
  });

  it("remove existing key returns true", () => {
    t.insert(5, "x");
    expect(t.remove(5)).toBe(true);
    expect(t.isEmpty()).toBe(true);
  });

  it("remove non-existent key returns false", () => {
    t.insert(5, "x");
    expect(t.remove(99)).toBe(false);
  });

  it("upsert: inserting duplicate key replaces value", () => {
    t.insert(7, "old");
    t.insert(7, "new");
    expect(t.search(7)).toBe("new");
    expect(keys(t)).toEqual([7]); // still one entry
  });
});

// ---------------------------------------------------------------------------
// Split test — cross-checked vs C++ PRINT_BTREE
// ---------------------------------------------------------------------------

describe("BTree split — cross-checked vs C++ PRINT_BTREE", () => {
  it("7 inserts (keys 97–103) → root=[99], children=[97,98] and [100,101,102,103]", () => {
    // Mirrors: INIT 1 8; INSERT a..g 0; PRINT_BTREE 0
    const t = new BTree(5);
    for (let k = 97; k <= 103; k++) {
      t.insert(k, String.fromCharCode(k));
    }

    const root = t.root!;
    expect(root.keys).toEqual([99]);
    expect(root.isLeaf).toBe(false);
    expect(root.children).toHaveLength(2);
    expect(root.children[0]!.keys).toEqual([97, 98]);
    expect(root.children[0]!.isLeaf).toBe(true);
    expect(root.children[1]!.keys).toEqual([100, 101, 102, 103]);
    expect(root.children[1]!.isLeaf).toBe(true);
  });

  it("10 inserts (keys 97–106) → root=[99,102], 3 leaf children", () => {
    // Mirrors: INIT 1 8; INSERT a..j 0; PRINT_BTREE 0
    const t = new BTree(5);
    for (let k = 97; k <= 106; k++) {
      t.insert(k, String.fromCharCode(k));
    }

    const root = t.root!;
    expect(root.keys).toEqual([99, 102]);
    expect(root.isLeaf).toBe(false);
    expect(root.children).toHaveLength(3);
    expect(root.children[0]!.keys).toEqual([97, 98]);
    expect(root.children[1]!.keys).toEqual([100, 101]);
    expect(root.children[2]!.keys).toEqual([103, 104, 105, 106]);
  });

  it("getAllEntries returns sorted order after splits", () => {
    const t = new BTree(5);
    for (let k = 97; k <= 106; k++) {
      t.insert(k, String.fromCharCode(k));
    }
    expect(keys(t)).toEqual([97, 98, 99, 100, 101, 102, 103, 104, 105, 106]);
  });
});

// ---------------------------------------------------------------------------
// Borrow test — cross-checked vs C++ PRINT_BTREE
// -------------------------------------------------------------------------
// 10 inserts (97–106) → root=[99,102], children=[97,98],[100,101],[103..106]
// delete 97 → left child underflows (1 key < minKeys=2)
//           → borrowFromNext triggered (right sibling via merge path in C++)
//           → C++ actual result: root=[102], left=[98,99,100,101], right=[103..106]
// delete 98 → root=[102], left=[99,100,101], right=[103,104,105,106]
// ---------------------------------------------------------------------------

describe("BTree borrow — cross-checked vs C++ PRINT_BTREE", () => {
  let t: BTree;
  beforeEach(() => {
    t = new BTree(5);
    for (let k = 97; k <= 106; k++) {
      t.insert(k, String.fromCharCode(k));
    }
  });

  it("delete 97 → root=[102], left=[98,99,100,101], right=[103,104,105,106]", () => {
    // C++ output after: DELETE 97 0; PRINT_BTREE 0
    t.remove(97);
    const root = t.root!;
    expect(root.keys).toEqual([102]);
    expect(root.children[0]!.keys).toEqual([98, 99, 100, 101]);
    expect(root.children[1]!.keys).toEqual([103, 104, 105, 106]);
  });

  it("delete 97 then 98 → root=[102], left=[99,100,101], right=[103,104,105,106]", () => {
    t.remove(97);
    t.remove(98);
    const root = t.root!;
    expect(root.keys).toEqual([102]);
    expect(root.children[0]!.keys).toEqual([99, 100, 101]);
    expect(root.children[1]!.keys).toEqual([103, 104, 105, 106]);
  });
});

// ---------------------------------------------------------------------------
// Merge test — cross-checked vs C++ PRINT_BTREE
// -------------------------------------------------------------------------
// 7 inserts (97–103) → root=[99], left=[97,98], right=[100,101,102,103]
// delete 99 (root key, non-leaf) → predecessor=98, successor=100; right>minKeys →
//   use successor: root=[100], left=[97,98], right=[101,102,103]
// delete 101 → right=[102,103]: root=[100], left=[97,98], right=[102,103]
// delete 102 → right=[103] (1 key < minKeys=2), left=[97,98] (2=minKeys), merge:
//   C++ result: flat leaf [97,98,100,103]
// ---------------------------------------------------------------------------

describe("BTree merge — cross-checked vs C++ PRINT_BTREE", () => {
  let t: BTree;
  beforeEach(() => {
    t = new BTree(5);
    for (let k = 97; k <= 103; k++) {
      t.insert(k, String.fromCharCode(k));
    }
  });

  it("initial state: root=[99], children=[97,98] and [100,101,102,103]", () => {
    const root = t.root!;
    expect(root.keys).toEqual([99]);
    expect(root.children[0]!.keys).toEqual([97, 98]);
    expect(root.children[1]!.keys).toEqual([100, 101, 102, 103]);
  });

  it("delete 99 → root=[100], left=[97,98], right=[101,102,103]", () => {
    t.remove(99);
    const root = t.root!;
    expect(root.keys).toEqual([100]);
    expect(root.children[0]!.keys).toEqual([97, 98]);
    expect(root.children[1]!.keys).toEqual([101, 102, 103]);
  });

  it("delete 99, 101 → root=[100], left=[97,98], right=[102,103]", () => {
    t.remove(99);
    t.remove(101);
    const root = t.root!;
    expect(root.keys).toEqual([100]);
    expect(root.children[0]!.keys).toEqual([97, 98]);
    expect(root.children[1]!.keys).toEqual([102, 103]);
  });

  it("delete 99, 101, 102 → merge to flat leaf [97,98,100,103]", () => {
    // C++ output: [97, 98, 100, 103] (root collapses to single leaf)
    t.remove(99);
    t.remove(101);
    t.remove(102);
    const root = t.root!;
    expect(root.isLeaf).toBe(true);
    expect(root.keys).toEqual([97, 98, 100, 103]);
  });

  it("getAllEntries is empty after removing all keys", () => {
    const t2 = new BTree(5);
    t2.insert(1, "a");
    t2.insert(2, "b");
    t2.remove(1);
    t2.remove(2);
    expect(t2.isEmpty()).toBe(true);
    expect(t2.getAllEntries()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// toJSON / root accessor (structural inspector output)
// ---------------------------------------------------------------------------

describe("BTree.toJSON / root", () => {
  it("toJSON matches root", () => {
    const t = new BTree(5);
    t.insert(5, "five");
    t.insert(3, "three");
    expect(t.toJSON()).toEqual(t.root);
  });

  it("root reflects correct leaf flag and values", () => {
    const t = new BTree(5);
    t.insert(10, "x");
    const r = t.root!;
    expect(r.isLeaf).toBe(true);
    expect(r.keys).toEqual([10]);
    expect(r.values).toEqual(["x"]);
    expect(r.children).toEqual([]);
  });
});
