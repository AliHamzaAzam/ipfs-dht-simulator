/**
 * controller.ts — Headless DHT state controller.
 *
 * Wraps a ChordRing and exposes playground operations plus an observable state
 * that the visualization / UI can subscribe to.  No DOM, no rendering.
 *
 * ## Commit-on-done design for insert / delete animations
 *
 * When `startInsertFile` or `startDeleteFile` is called the controller computes
 * the full routing path immediately (using `ring.route`) so the animation knows
 * every hop up front.  However the B-tree mutation (the actual `ring.insertFile`
 * / `ring.deleteFile` call) is deferred until the animation transitions to
 * `done = true`, which happens either via:
 *   - `stepAnimation()` advancing past the last hop, or
 *   - `finishAnimation()` jumping straight to done.
 *
 * Rationale: the visualizer shows packets travelling hop-by-hop; the file
 * should visually "arrive" at the destination exactly when the animation ends.
 * A pending insert/delete is stored in `_pendingMutation` and committed at that
 * point.  `startSearchFile` and `startRoute` have no side-effects on the ring,
 * so they commit nothing.
 */

import { ChordRing, FingerEntry } from "./chord.js";
import { hash } from "./hash.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface RouteAnimation {
  kind: "route" | "insert" | "search" | "delete";
  key: number;
  startId: number;
  /** Ordered list of node IDs visited (includes start and destination). */
  path: number[];
  /** ID of the responsible node. */
  destination: number;
  /** Current hop index within path (0 = at startId, path.length-1 = done). */
  step: number;
  /** Value associated with the operation (insert name, search/delete result). */
  value?: string | null;
  /** True once the animation has reached the destination. */
  done: boolean;
}

export interface DHTState {
  bits: number;
  nodes: {
    id: number;
    name: string;
    fingers: FingerEntry[];
    files: { key: number; value: string }[];
  }[];
  selectedId: number | null;
  animation: RouteAnimation | null;
}

// ---------------------------------------------------------------------------
// Internal pending-mutation descriptor
// ---------------------------------------------------------------------------

type PendingMutation =
  | { kind: "insert"; key: number; value: string; destination: number }
  | { kind: "delete"; key: number; destination: number };

// ---------------------------------------------------------------------------
// DHTController
// ---------------------------------------------------------------------------

export class DHTController {
  private _ring: ChordRing;
  private _selectedId: number | null = null;
  private _animation: RouteAnimation | null = null;
  private _pendingMutation: PendingMutation | null = null;
  private _listeners: Set<(s: DHTState) => void> = new Set();

  constructor(bits: number = 4) {
    this._ring = new ChordRing(bits);
  }

  // -------------------------------------------------------------------------
  // State snapshot
  // -------------------------------------------------------------------------

  getState(): DHTState {
    return {
      bits: this._ring.bits,
      nodes: this._ring.nodes().map((n) => ({
        id: n.id,
        name: n.name,
        fingers: [...n.fingers],
        files: [...this._ring.filesAt(n.id)],
      })),
      selectedId: this._selectedId,
      animation: this._animation ? { ...this._animation, path: [...this._animation.path] } : null,
    };
  }

  // -------------------------------------------------------------------------
  // Subscribe / unsubscribe
  // -------------------------------------------------------------------------

  /**
   * Register a listener that is called with the new state on every mutation.
   * Returns an unsubscribe function.
   */
  subscribe(listener: (s: DHTState) => void): () => void {
    this._listeners.add(listener);
    return () => {
      this._listeners.delete(listener);
    };
  }

  // -------------------------------------------------------------------------
  // Ring operations
  // -------------------------------------------------------------------------

  /**
   * Reinitialise the ring with evenly-spaced nodes.
   * Clears any in-flight animation and pending mutation.
   */
  reset(bits: number, numMachines: number): void {
    this._ring = new ChordRing(bits);
    this._ring.initialize(numMachines);
    this._animation = null;
    this._pendingMutation = null;
    this._selectedId = null;
    this._notify();
  }

  /** Add a node by name (and optional explicit id). Returns false on failure. */
  addNode(name: string, id?: number): boolean {
    const ok = this._ring.addNode(name, id);
    if (ok) this._notify();
    return ok;
  }

  /** Remove a node by id. Returns false if the id is not present. */
  removeNode(id: number): boolean {
    const ok = this._ring.removeNode(id);
    if (ok) {
      // Deselect if the removed node was selected
      if (this._selectedId === id) this._selectedId = null;
      // Cancel any animation that involves this node (start, destination, or
      // any intermediate hop in the path).
      if (this._animation && this._animation.path.includes(id)) {
        this._animation = null;
        this._pendingMutation = null;
      }
      this._notify();
    }
    return ok;
  }

  /** Set the inspector-selected node (pass null to deselect). */
  selectNode(id: number | null): void {
    this._selectedId = id;
    this._notify();
  }

  // -------------------------------------------------------------------------
  // Animation starters
  // -------------------------------------------------------------------------

  /**
   * Start a pure route animation (no B-tree side-effect).
   * Computes the path and sets animation at step 0.
   * If an animation with a pending mutation is already in flight, it is
   * committed first (no silent data loss).
   */
  startRoute(key: number, startId: number): void {
    // Commit any in-flight animation so we don't silently drop it
    if (this._animation && !this._animation.done && this._pendingMutation) {
      this.finishAnimation();
    }
    const { path, destination } = this._ring.route(key, startId);
    this._animation = {
      kind: "route",
      key,
      startId,
      path,
      destination,
      step: 0,
      done: path.length === 1,
    };
    this._pendingMutation = null;
    this._notify();
  }

  /**
   * Start an insert animation.
   * The B-tree mutation is deferred until the animation reaches done.
   * If an animation with a pending mutation is already in flight, it is
   * committed first (no silent data loss).
   */
  startInsertFile(name: string, startId: number): void {
    // Commit any in-flight animation so we don't silently drop it
    if (this._animation && !this._animation.done && this._pendingMutation) {
      this.finishAnimation();
    }
    const key = hash(name, this._ring.bits);
    const { path, destination } = this._ring.route(key, startId);
    this._animation = {
      kind: "insert",
      key,
      startId,
      path,
      destination,
      step: 0,
      value: name,
      done: path.length === 1,
    };
    // Pin destination at start time so _commitMutation always inserts exactly
    // where the animation showed, regardless of ring changes mid-animation.
    this._pendingMutation = { kind: "insert", key, value: name, destination };
    // If the route is a single step (already at destination), commit now
    if (path.length === 1) {
      this._commitMutation();
    }
    this._notify();
  }

  /**
   * Start a search animation.
   * Reads the destination's B-tree immediately (no state mutation).
   * If an animation with a pending mutation is already in flight, it is
   * committed first (no silent data loss).
   *
   * @param key    Pre-hashed numeric DHT key.  Use `hashName(name)` to derive
   *               it from a file name string.
   * @param startId  ID of the node that initiates the search.
   */
  startSearchFile(key: number, startId: number): void {
    // Commit any in-flight animation so we don't silently drop it
    if (this._animation && !this._animation.done && this._pendingMutation) {
      this.finishAnimation();
    }
    const { path, destination } = this._ring.route(key, startId);
    const files = this._ring.filesAt(destination);
    const entry = files.find((f) => f.key === key);
    this._animation = {
      kind: "search",
      key,
      startId,
      path,
      destination,
      step: 0,
      value: entry?.value ?? null,
      done: path.length === 1,
    };
    this._pendingMutation = null;
    this._notify();
  }

  /**
   * Start a delete animation.
   * The B-tree mutation is deferred until the animation reaches done.
   * If an animation with a pending mutation is already in flight, it is
   * committed first (no silent data loss).
   *
   * @param key    Pre-hashed numeric DHT key.  Use `hashName(name)` to derive
   *               it from a file name string.
   * @param startId  ID of the node that initiates the delete.
   */
  startDeleteFile(key: number, startId: number): void {
    // Commit any in-flight animation so we don't silently drop it
    if (this._animation && !this._animation.done && this._pendingMutation) {
      this.finishAnimation();
    }
    const { path, destination } = this._ring.route(key, startId);
    // Peek at the current value so the animation can show what was deleted
    const files = this._ring.filesAt(destination);
    const entry = files.find((f) => f.key === key);
    this._animation = {
      kind: "delete",
      key,
      startId,
      path,
      destination,
      step: 0,
      value: entry?.value ?? null,
      done: path.length === 1,
    };
    // Pin destination at start time so _commitMutation always removes from
    // exactly the node the animation showed, regardless of ring changes.
    this._pendingMutation = { kind: "delete", key, destination };
    if (path.length === 1) {
      this._commitMutation();
    }
    this._notify();
  }

  // -------------------------------------------------------------------------
  // Animation control
  // -------------------------------------------------------------------------

  /**
   * Advance the animation by one hop.
   * When the animation reaches the final hop (destination) it is marked done
   * and any pending B-tree mutation is committed.
   */
  stepAnimation(): void {
    if (!this._animation || this._animation.done) return;
    const next = this._animation.step + 1;
    const atEnd = next >= this._animation.path.length - 1;
    this._animation = {
      ...this._animation,
      step: next,
      done: atEnd,
    };
    if (atEnd) {
      this._commitMutation();
    }
    this._notify();
  }

  /**
   * Jump to the end of the animation, committing any pending mutation.
   */
  finishAnimation(): void {
    if (!this._animation || this._animation.done) return;
    this._animation = {
      ...this._animation,
      step: this._animation.path.length - 1,
      done: true,
    };
    this._commitMutation();
    this._notify();
  }

  // -------------------------------------------------------------------------
  // Hash inspector
  // -------------------------------------------------------------------------

  /** Return hash(name, bits) — useful for the hash-inspector panel. */
  hashName(name: string): number {
    return hash(name, this._ring.bits);
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /** Commit the pending B-tree mutation (insert or delete) directly to the
   * pre-computed destination node (no re-routing), then clear it.
   */
  private _commitMutation(): void {
    if (!this._pendingMutation) return;
    const mut = this._pendingMutation;
    this._pendingMutation = null;
    if (mut.kind === "insert") {
      this._ring.insertAt(mut.destination, mut.key, mut.value);
    } else {
      this._ring.removeAt(mut.destination, mut.key);
    }
  }

  /** Snapshot state and broadcast to all registered listeners.
   * Each listener receives an independent snapshot so mutations in one
   * listener cannot corrupt the snapshot seen by subsequent listeners.
   */
  private _notify(): void {
    for (const listener of this._listeners) {
      listener(this.getState());
    }
  }
}
