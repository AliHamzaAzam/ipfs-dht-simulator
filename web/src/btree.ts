/**
 * btree.ts — Order-5 B-tree for per-node file storage.
 *
 * Faithful TypeScript port of src/BTree.cpp / src/BTree.h.
 *
 * Order-5 constraints:
 *   - Max keys per node  : order - 1 = 4
 *   - Min keys (non-root): (order - 1) / 2 = 2   (integer division)
 *   - Max children       : order = 5
 *
 * The split/borrow/merge semantics are cross-checked against the C++ binary
 * via PRINT_BTREE after known insert/delete sequences.
 */

// ---------------------------------------------------------------------------
// Public types (inspector-friendly shapes)
// ---------------------------------------------------------------------------

export interface BTreeNodeJSON {
  keys: number[];
  values: string[];
  children: BTreeNodeJSON[];
  isLeaf: boolean;
}

// ---------------------------------------------------------------------------
// BTreeNode — internal class (mirrors BTreeNode in C++)
// ---------------------------------------------------------------------------

class BTreeNode {
  keys: number[];
  values: string[];
  children: BTreeNode[];
  isLeaf: boolean;
  readonly order: number; // max children = order; max keys = order-1

  constructor(order: number, isLeaf: boolean) {
    this.order = order;
    this.isLeaf = isLeaf;
    this.keys = [];
    this.values = [];
    this.children = [];
  }

  // -------------------------------------------------------------------------
  // findKey — first index where keys[idx] >= key  (mirrors C++ findKey)
  // -------------------------------------------------------------------------
  findKey(key: number): number {
    let idx = 0;
    while (idx < this.keys.length && this.keys[idx]! < key) {
      idx++;
    }
    return idx;
  }

  // -------------------------------------------------------------------------
  // search
  // -------------------------------------------------------------------------
  search(key: number): string | null {
    const idx = this.findKey(key);
    if (idx < this.keys.length && this.keys[idx] === key) {
      return this.values[idx]!;
    }
    if (this.isLeaf) return null;
    return this.children[idx]!.search(key);
  }

  // -------------------------------------------------------------------------
  // insertNonFull
  // -------------------------------------------------------------------------
  insertNonFull(key: number, value: string): void {
    let idx = this.keys.length - 1;

    if (this.isLeaf) {
      // Shift right to make room
      this.keys.push(0);
      this.values.push("");
      while (idx >= 0 && this.keys[idx]! > key) {
        this.keys[idx + 1] = this.keys[idx]!;
        this.values[idx + 1] = this.values[idx]!;
        idx--;
      }
      this.keys[idx + 1] = key;
      this.values[idx + 1] = value;
    } else {
      // Find child to descend into
      while (idx >= 0 && this.keys[idx]! > key) {
        idx--;
      }
      idx++;

      if (this.children[idx]!.keys.length === this.order - 1) {
        this.splitChild(idx);
        if (this.keys[idx]! < key) {
          idx++;
        }
      }
      this.children[idx]!.insertNonFull(key, value);
    }
  }

  // -------------------------------------------------------------------------
  // splitChild — mirrors C++ splitChild
  // mid = (order - 1) / 2 = 2 for order=5
  // The mid key goes up to the parent; keys after mid go to newNode.
  // -------------------------------------------------------------------------
  splitChild(idx: number): void {
    const child = this.children[idx]!;
    const mid = Math.floor((this.order - 1) / 2); // = 2 for order=5

    const newNode = new BTreeNode(this.order, child.isLeaf);

    // Copy keys after mid into newNode
    for (let j = mid + 1; j < child.keys.length; j++) {
      newNode.keys.push(child.keys[j]!);
      newNode.values.push(child.values[j]!);
    }

    // Copy children after mid into newNode (if internal)
    if (!child.isLeaf) {
      for (let j = mid + 1; j < child.children.length; j++) {
        newNode.children.push(child.children[j]!);
      }
      child.children.length = mid + 1;
    }

    const midKey = child.keys[mid]!;
    const midValue = child.values[mid]!;

    // Shrink child to keys[0..mid-1]
    child.keys.length = mid;
    child.values.length = mid;

    // Insert newNode after idx in this.children
    this.children.splice(idx + 1, 0, newNode);
    // Insert midKey at idx in this.keys
    this.keys.splice(idx, 0, midKey);
    this.values.splice(idx, 0, midValue);
  }

  // -------------------------------------------------------------------------
  // remove — mirrors C++ BTreeNode::remove
  // -------------------------------------------------------------------------
  remove(key: number): boolean {
    const idx = this.findKey(key);
    const minKeys = Math.floor((this.order - 1) / 2); // = 2 for order=5

    if (idx < this.keys.length && this.keys[idx] === key) {
      if (this.isLeaf) {
        this.removeFromLeaf(idx);
      } else {
        this.removeFromNonLeaf(idx);
      }
      return true;
    } else {
      if (this.isLeaf) return false;

      const isLast = idx === this.keys.length;

      if (this.children[idx]!.keys.length <= minKeys) {
        this.fill(idx);
      }

      // After fill, the child structure may have shifted
      if (isLast && idx > this.keys.length) {
        return this.children[idx - 1]!.remove(key);
      } else {
        return this.children[idx]!.remove(key);
      }
    }
  }

  private removeFromLeaf(idx: number): void {
    this.keys.splice(idx, 1);
    this.values.splice(idx, 1);
  }

  private removeFromNonLeaf(idx: number): void {
    const key = this.keys[idx]!;
    const minKeys = Math.floor((this.order - 1) / 2);

    if (this.children[idx]!.keys.length > minKeys) {
      // Use in-order predecessor
      this.keys[idx] = this._getPredecessor(idx);
      this.values[idx] = this._getPredecessorValue(idx);
      this.children[idx]!.remove(this.keys[idx]!);
    } else if (this.children[idx + 1]!.keys.length > minKeys) {
      // Use in-order successor
      this.keys[idx] = this._getSuccessor(idx);
      this.values[idx] = this._getSuccessorValue(idx);
      this.children[idx + 1]!.remove(this.keys[idx]!);
    } else {
      // Merge children[idx] and children[idx+1]
      this.merge(idx);
      this.children[idx]!.remove(key);
    }
  }

  private _getPredecessor(idx: number): number {
    let cur = this.children[idx]!;
    while (!cur.isLeaf) {
      cur = cur.children[cur.children.length - 1]!;
    }
    return cur.keys[cur.keys.length - 1]!;
  }

  private _getPredecessorValue(idx: number): string {
    let cur = this.children[idx]!;
    while (!cur.isLeaf) {
      cur = cur.children[cur.children.length - 1]!;
    }
    return cur.values[cur.values.length - 1]!;
  }

  private _getSuccessor(idx: number): number {
    let cur = this.children[idx + 1]!;
    while (!cur.isLeaf) {
      cur = cur.children[0]!;
    }
    return cur.keys[0]!;
  }

  private _getSuccessorValue(idx: number): string {
    let cur = this.children[idx + 1]!;
    while (!cur.isLeaf) {
      cur = cur.children[0]!;
    }
    return cur.values[0]!;
  }

  // -------------------------------------------------------------------------
  // fill — ensure children[idx] has more than minKeys; borrow or merge
  // -------------------------------------------------------------------------
  fill(idx: number): void {
    const minKeys = Math.floor((this.order - 1) / 2);

    if (idx !== 0 && this.children[idx - 1]!.keys.length > minKeys) {
      this.borrowFromPrev(idx);
    } else if (
      idx !== this.children.length - 1 &&
      this.children[idx + 1]!.keys.length > minKeys
    ) {
      this.borrowFromNext(idx);
    } else {
      if (idx !== this.children.length - 1) {
        this.merge(idx);
      } else {
        this.merge(idx - 1);
      }
    }
  }

  borrowFromPrev(idx: number): void {
    const child = this.children[idx]!;
    const sibling = this.children[idx - 1]!;

    // Shift child's keys right to make room at front
    child.keys.unshift(this.keys[idx - 1]!);
    child.values.unshift(this.values[idx - 1]!);

    // Pull sibling's last key up into parent
    this.keys[idx - 1] = sibling.keys[sibling.keys.length - 1]!;
    this.values[idx - 1] = sibling.values[sibling.values.length - 1]!;

    if (!child.isLeaf) {
      child.children.unshift(sibling.children[sibling.children.length - 1]!);
      sibling.children.pop();
    }

    sibling.keys.pop();
    sibling.values.pop();
  }

  borrowFromNext(idx: number): void {
    const child = this.children[idx]!;
    const sibling = this.children[idx + 1]!;

    // Append parent key to end of child
    child.keys.push(this.keys[idx]!);
    child.values.push(this.values[idx]!);

    // Pull sibling's first key up into parent
    this.keys[idx] = sibling.keys[0]!;
    this.values[idx] = sibling.values[0]!;

    if (!child.isLeaf) {
      child.children.push(sibling.children[0]!);
      sibling.children.shift();
    }

    sibling.keys.shift();
    sibling.values.shift();
  }

  // -------------------------------------------------------------------------
  // merge — merge children[idx] and children[idx+1] via parent key[idx]
  // -------------------------------------------------------------------------
  merge(idx: number): void {
    const child = this.children[idx]!;
    const sibling = this.children[idx + 1]!;

    // Pull parent's separator key down into child
    child.keys.push(this.keys[idx]!);
    child.values.push(this.values[idx]!);

    // Append sibling's keys/values into child
    for (let i = 0; i < sibling.keys.length; i++) {
      child.keys.push(sibling.keys[i]!);
      child.values.push(sibling.values[i]!);
    }

    // Append sibling's children into child (if internal)
    if (!child.isLeaf) {
      for (const c of sibling.children) {
        child.children.push(c);
      }
      sibling.children.length = 0;
    }

    // Remove separator key from parent
    this.keys.splice(idx, 1);
    this.values.splice(idx, 1);

    // Remove sibling pointer from parent
    this.children.splice(idx + 1, 1);
  }

  // -------------------------------------------------------------------------
  // getAllEntries — in-order traversal (left subtree → key → right subtree)
  // -------------------------------------------------------------------------
  getAllEntries(entries: Array<{ key: number; value: string }>): void {
    for (let i = 0; i < this.keys.length; i++) {
      if (!this.isLeaf) {
        this.children[i]!.getAllEntries(entries);
      }
      entries.push({ key: this.keys[i]!, value: this.values[i]! });
    }
    if (!this.isLeaf) {
      this.children[this.keys.length]!.getAllEntries(entries);
    }
  }

  // -------------------------------------------------------------------------
  // toJSON — deep structural snapshot for the inspector UI
  // -------------------------------------------------------------------------
  toJSON(): BTreeNodeJSON {
    return {
      keys: [...this.keys],
      values: [...this.values],
      children: this.children.map((c) => c.toJSON()),
      isLeaf: this.isLeaf,
    };
  }
}

// ---------------------------------------------------------------------------
// BTree — public class (mirrors C++ BTree with order=5)
// ---------------------------------------------------------------------------

export class BTree {
  private _root: BTreeNode | null = null;
  private readonly _order: number;

  constructor(order = 5) {
    this._order = order;
  }

  // -------------------------------------------------------------------------
  // insert(key, value)
  // If key already exists, remove it first (C++ behaviour: upsert).
  // If root is full (order-1 keys), split before descending.
  // -------------------------------------------------------------------------
  insert(key: number, value: string): void {
    if (this._root === null) {
      this._root = new BTreeNode(this._order, true);
      this._root.keys.push(key);
      this._root.values.push(value);
      return;
    }

    // Upsert: remove old entry if key exists.
    // After remove the root may become null (single-entry tree), so re-check.
    const existing = this.search(key);
    if (existing !== null) {
      this.remove(key);
    }

    if (this._root === null) {
      // Tree was emptied by the remove above (single-entry upsert case)
      this._root = new BTreeNode(this._order, true);
      this._root.keys.push(key);
      this._root.values.push(value);
      return;
    }

    if (this._root.keys.length === this._order - 1) {
      // Root is full — grow the tree upward
      const newRoot = new BTreeNode(this._order, false);
      newRoot.children.push(this._root);
      newRoot.splitChild(0);

      const i = newRoot.keys[0]! < key ? 1 : 0;
      newRoot.children[i]!.insertNonFull(key, value);

      this._root = newRoot;
    } else {
      this._root.insertNonFull(key, value);
    }
  }

  // -------------------------------------------------------------------------
  // search(key) → value | null
  // -------------------------------------------------------------------------
  search(key: number): string | null {
    if (this._root === null) return null;
    return this._root.search(key);
  }

  // -------------------------------------------------------------------------
  // remove(key) → true if removed, false if not found
  // -------------------------------------------------------------------------
  remove(key: number): boolean {
    if (this._root === null) return false;

    const result = this._root.remove(key);

    // Shrink tree if root is now empty
    if (this._root.keys.length === 0) {
      const oldRoot = this._root;
      if (this._root.isLeaf) {
        this._root = null;
      } else {
        this._root = this._root.children[0]!;
        oldRoot.children.length = 0; // prevent double-free in C++ style
      }
    }

    return result;
  }

  // -------------------------------------------------------------------------
  // getAllEntries() → sorted { key, value }[] (mirrors C++ getAllEntries)
  // -------------------------------------------------------------------------
  getAllEntries(): Array<{ key: number; value: string }> {
    const entries: Array<{ key: number; value: string }> = [];
    if (this._root !== null) {
      this._root.getAllEntries(entries);
    }
    return entries;
  }

  isEmpty(): boolean {
    return this._root === null;
  }

  // -------------------------------------------------------------------------
  // Structural accessors for the inspector UI
  // -------------------------------------------------------------------------

  /** Returns the root node JSON (pure data, no DOM, no cycles). */
  get root(): BTreeNodeJSON | null {
    return this._root ? this._root.toJSON() : null;
  }

  /** Alias for root — both forms surfaced for flexibility. */
  toJSON(): BTreeNodeJSON | null {
    return this.root;
  }
}
