/**
 * chord.ts — Pure TypeScript port of the C++ Chord-style ring DHT.
 *
 * Source of truth: src/RingDHT.cpp, src/Machine.cpp, src/RoutingTable.cpp
 * No DOM dependencies; no Node.js globals.
 *
 * Design note: each ChordNode carries an optional `store` field (initially
 * undefined) so a B-tree/file-storage layer can be attached per-node in the
 * next task without restructuring this file.
 */

import { hash } from "./hash.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface FingerEntry {
  /** 1-based finger index (1..bits) */
  index: number;
  /** startId = (ownerId + 2^(index-1)) mod 2^bits */
  startId: number;
  /** targetId = id of findSuccessor(startId) */
  targetId: number;
}

export interface ChordNode {
  id: number;
  name: string;
  fingers: FingerEntry[];
  /** Reserved for the B-tree storage layer (Task 57). Not populated here. */
  store?: unknown;
}

export interface RouteResult {
  /** Ordered list of node IDs visited, including start and destination. */
  path: number[];
  /** ID of the node that is the key's successor (i.e. the responsible node). */
  destination: number;
}

// ---------------------------------------------------------------------------
// ChordRing
// ---------------------------------------------------------------------------

export class ChordRing {
  private readonly _bits: number;
  private readonly _modValue: number; // 2^bits
  /** Ring stored as a sorted array for simplicity — same semantics as the C++ linked list. */
  private _nodes: Array<{ id: number; name: string }> = [];
  /** Finger tables, indexed by node position in _nodes (kept in sync). */
  private _fingers: FingerEntry[][] = [];

  constructor(bits: number) {
    this._bits = bits;
    this._modValue = 1 << bits; // valid for bits ≤ 30 (JS bitwise ops are 32-bit signed); mirrors C++ 1ULL<<bits for our 3–8-bit range
  }

  get bits(): number {
    return this._bits;
  }

  // -------------------------------------------------------------------------
  // initialize(n) — evenly spaced IDs, names "Machine_<id>"
  // Mirrors RingDHT::initialize: spacing = floor(2^bits / n), id = i*spacing
  // -------------------------------------------------------------------------
  initialize(n: number): void {
    if (n <= 0 || n > this._modValue) {
      throw new RangeError(`n must be in [1, ${this._modValue}]`);
    }
    this._nodes = [];
    this._fingers = [];
    const spacing = Math.floor(this._modValue / n);
    for (let i = 0; i < n; i++) {
      const id = i * spacing;
      const name = `Machine_${id}`;
      this._nodes.push({ id, name });
    }
    // _nodes are already sorted (ids = 0, spacing, 2*spacing, …)
    this.rebuildFingerTables();
  }

  // -------------------------------------------------------------------------
  // addNode — insert with explicit id or auto-id = hash(name) % 2^bits
  // Mirrors RingDHT::insertMachine; rebuilds all finger tables after insert.
  // -------------------------------------------------------------------------
  addNode(name: string, id?: number): boolean {
    if (id !== undefined && (id < 0 || id >= this._modValue)) {
      return false; // explicit id outside [0, 2^bits)
    }
    const nodeId = id !== undefined ? id : hash(name, this._bits);
    if (this._nodes.some((n) => n.id === nodeId)) {
      return false; // duplicate
    }
    // Insert in sorted order (mirrors C++ linked-list insertion sort)
    let pos = this._nodes.findIndex((n) => n.id > nodeId);
    if (pos === -1) pos = this._nodes.length;
    this._nodes.splice(pos, 0, { id: nodeId, name });
    this.rebuildFingerTables();
    return true;
  }

  // -------------------------------------------------------------------------
  // removeNode — remove by id, rebuild tables
  // -------------------------------------------------------------------------
  removeNode(id: number): boolean {
    const idx = this._nodes.findIndex((n) => n.id === id);
    if (idx === -1) return false;
    this._nodes.splice(idx, 1);
    if (this._nodes.length > 0) {
      this.rebuildFingerTables();
    } else {
      this._fingers = [];
    }
    return true;
  }

  // -------------------------------------------------------------------------
  // findSuccessor(id) — smallest node.id >= id, else wrap to head
  // Mirrors RingDHT::findSuccessor: scans all nodes, finds minimum node.id >= id;
  // if none, returns head (minimum id overall).
  // -------------------------------------------------------------------------
  findSuccessor(id: number): number {
    if (this._nodes.length === 0) throw new Error("Ring is empty");
    let candidate: number | null = null;
    for (const n of this._nodes) {
      if (n.id >= id) {
        if (candidate === null || n.id < candidate) {
          candidate = n.id;
        }
      }
    }
    if (candidate === null) {
      // Wrap around: return head (smallest id)
      return this._nodes[0]!.id;
    }
    return candidate;
  }

  // -------------------------------------------------------------------------
  // rebuildFingerTables — recompute all finger tables from scratch
  // Mirrors Machine::initializeRoutingTable + RingDHT::updateAllRoutingTables
  // Entry i (1..bits): startId = (ownerId + 2^(i-1)) mod 2^bits
  //                    targetId = findSuccessor(startId)
  // -------------------------------------------------------------------------
  rebuildFingerTables(): void {
    this._fingers = this._nodes.map((node) => {
      const fingers: FingerEntry[] = [];
      for (let i = 1; i <= this._bits; i++) {
        const offset = 1 << (i - 1); // 2^(i-1)
        const startId = (node.id + offset) % this._modValue;
        const targetId = this.findSuccessor(startId);
        fingers.push({ index: i, startId, targetId });
      }
      return fingers;
    });
  }

  // -------------------------------------------------------------------------
  // nodes() — sorted snapshot of the ring
  // -------------------------------------------------------------------------
  nodes(): ChordNode[] {
    return this._nodes.map((n, idx) => ({
      id: n.id,
      name: n.name,
      fingers: [...(this._fingers[idx] ?? [])],
    }));
  }

  // -------------------------------------------------------------------------
  // route(key, startId) — Chord greedy routing
  //
  // Precondition: key and startId are in [0, 2^bits). An out-of-range key wraps
  // via findSuccessor (matching the C++), which may surprise callers.
  //
  // Mirrors RingDHT::routeToKey:
  //   1. path = [startId]
  //   2. successor = findSuccessor(key)
  //   3. while current != successor:
  //        nextHop = getNextHop(current, key)
  //        if nextHop == null || nextHop == current → nextHop = current.next
  //        current = nextHop; path.push(current.id)
  //        if path.length > numMachines+1 → break
  // -------------------------------------------------------------------------
  route(key: number, startId: number): RouteResult {
    const start = this._nodes.find((n) => n.id === startId);
    if (!start) throw new Error(`Node ${startId} not in ring`);

    const destination = this.findSuccessor(key);
    const path: number[] = [startId];

    if (startId === destination) {
      return { path, destination };
    }

    let currentId = startId;
    const maxSteps = this._nodes.length + 1;

    while (currentId !== destination) {
      const nextHopId = this._getNextHop(currentId, key);
      const resolved =
        nextHopId === null || nextHopId === currentId
          ? this._ringNext(currentId)
          : nextHopId;
      currentId = resolved;
      path.push(currentId);
      if (path.length > maxSteps) break;
    }

    return { path, destination };
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * getNextHop — port of RoutingTable::getNextHop.
   *
   * Scans fingers from largest index (tail) to smallest (head).
   * ownerMachineId = currentId, key = the lookup key.
   *
   * Normal case  (owner < key): fingerInRange = owner < finger <= key
   * Wraparound   (owner > key): fingerInRange = finger > owner || finger <= key
   * owner == key              : fingerInRange = false (never matches)
   *
   * Returns the FIRST (from tail) finger that is in range.
   * If none found, returns head finger's targetId (entry index=1, the successor).
   * Returns null if ring is empty.
   */
  private _getNextHop(ownerId: number, key: number): number | null {
    const idx = this._nodes.findIndex((n) => n.id === ownerId);
    if (idx === -1) return null;
    const fingers = this._fingers[idx];
    if (!fingers || fingers.length === 0) return null;

    // Iterate from tail (last entry, highest index) to head
    for (let i = fingers.length - 1; i >= 0; i--) {
      const fingerId = fingers[i]!.targetId;
      let inRange: boolean;
      if (ownerId < key) {
        // Normal: owner < key
        inRange = ownerId < fingerId && fingerId <= key;
      } else if (ownerId > key) {
        // Wraparound: key is "before" owner on the ring
        inRange = fingerId > ownerId || fingerId <= key;
      } else {
        // owner == key
        inRange = false;
      }
      if (inRange) {
        return fingerId;
      }
    }

    // No matching finger — return head finger (index=1, successor)
    return fingers[0]!.targetId;
  }

  /**
   * ringNext — the next node in sorted circular order (mirrors node->next).
   */
  private _ringNext(id: number): number {
    const idx = this._nodes.findIndex((n) => n.id === id);
    if (idx === -1) throw new Error(`Node ${id} not in ring`);
    const next = this._nodes[(idx + 1) % this._nodes.length]!;
    return next.id;
  }
}
