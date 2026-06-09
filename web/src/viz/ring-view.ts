/**
 * ring-view.ts — SVG Chord ring visualizer with playful drag physics.
 *
 * Subscribes to a DHTController for topology/animation state, and runs its own
 * requestAnimationFrame physics loop so nodes can be grabbed and flung: each
 * node springs elastically back to its identifier position on the ring (its
 * "home"), with fling momentum and a gentle idle float. Every edge, hop line,
 * and label is drawn from each node's *live* position, so the whole graph
 * reacts as you drag — Obsidian-style — while the ring stays meaningful (a
 * node's home angle still encodes its ID).
 *
 * Public API:
 *   - constructor(container, controller)
 *   - play()   — auto-step animation at ~600ms intervals until done
 *   - stop()   — cancel auto-play
 *   - step()   — single animation step
 *   - teardown() — unsubscribe, cancel the physics loop, remove SVG from DOM
 */

import { DHTController, DHTState, RouteAnimation } from "../controller.js";
import { RingGeometry, Point, idToPoint, fractionToPoint } from "../layout.js";
import { svgEl, clearChildren } from "./svg-utils.js";

// ---------------------------------------------------------------------------
// Visual constants
// ---------------------------------------------------------------------------

const NODE_RADIUS = 14;
const KEY_MARKER_RADIUS = 7;
const AUTO_STEP_MS = 600;

// Physics tuning (per frame, ~60fps).
const SPRING_K = 0.045; // pull toward home
const DAMPING = 0.86; // velocity retention
const FLOAT_AMP = 2.5; // idle float radius (px)
const FLOAT_SPEED = 0.0011; // idle float angular speed (per ms)

// Light-theme palette — harmonises with the soft pulselog/chattr system and the
// warm rose accent (#f43f5e).
const COLOR = {
  ringGuide: "#e5e5e5",
  node: "#ffffff",
  nodeStroke: "#d4d4d4",
  nodeSelected: "#f43f5e",
  nodeSelectedStroke: "#e11d48",
  nodeLabel: "#171717",
  nodeLabelSelected: "#ffffff",
  nodeLabelSmall: "#737373",
  successorArc: "#cbd5e1",
  fingerChord: "#e5e7eb",
  fingerHighlight: "#f59e0b",
  hopPath: "#94a3b8",
  hopCurrent: "#f43f5e",
  destination: "#16a34a",
  keyMarker: "#f59e0b",
  fileBadgeFill: "#f43f5e",
  fileBadgeText: "#ffffff",
  doneDest: "#16a34a",
  doneLabelBg: "#ffffff",
  doneLabelBorder: "#e5e5e5",
  muted: "#737373",
} as const;

// ---------------------------------------------------------------------------
// Per-node physics body
// ---------------------------------------------------------------------------

interface NodeBody {
  x: number;
  y: number;
  vx: number;
  vy: number;
  homeX: number;
  homeY: number;
  phase: number; // idle-float phase offset
}

// ---------------------------------------------------------------------------
// RingView
// ---------------------------------------------------------------------------

export class RingView {
  private _svg: SVGSVGElement;
  private _geo: RingGeometry;
  private _controller: DHTController;
  private _unsub: () => void;
  private _timer: ReturnType<typeof setInterval> | null = null;

  private _w: number;
  private _h: number;

  // Layer groups (painted in order — last is on top)
  private _layerGuide: SVGGElement;
  private _layerFingers: SVGGElement;
  private _layerSuccessors: SVGGElement;
  private _layerAnimation: SVGGElement;
  private _layerNodes: SVGGElement;
  private _layerLabels: SVGGElement;

  // Physics + interaction
  private _bodies = new Map<number, NodeBody>();
  private _lastState: DHTState | null = null;
  private _raf: number | null = null;
  private _hasRaf: boolean;
  private _reduceMotion: boolean;
  private _dragId: number | null = null;
  private _dragOffset: Point = { x: 0, y: 0 };
  private _downPt: Point = { x: 0, y: 0 };
  private _dragMoved = false;

  constructor(container: HTMLElement, controller: DHTController) {
    this._controller = controller;

    // ---- Size SVG to container ------------------------------------------
    const w = container.clientWidth || 600;
    const h = container.clientHeight || 600;
    this._w = w;
    this._h = h;
    const minDim = Math.min(w, h);
    const pad = 60; // space for labels
    const radius = Math.max(80, minDim / 2 - pad);
    const cx = w / 2;
    const cy = h / 2;

    this._geo = { cx, cy, radius, bits: controller.getState().bits };

    this._svg = svgEl("svg", {
      width: w,
      height: h,
      viewBox: `0 0 ${w} ${h}`,
      style: "display:block;touch-action:none;user-select:none;",
    });

    // Create layers
    this._layerGuide = svgEl("g");
    this._layerFingers = svgEl("g");
    this._layerSuccessors = svgEl("g");
    this._layerAnimation = svgEl("g");
    this._layerNodes = svgEl("g");
    this._layerLabels = svgEl("g");

    this._svg.appendChild(this._layerGuide);
    this._svg.appendChild(this._layerFingers);
    this._svg.appendChild(this._layerSuccessors);
    this._svg.appendChild(this._layerAnimation);
    this._svg.appendChild(this._layerNodes);
    this._svg.appendChild(this._layerLabels);

    container.appendChild(this._svg);

    // ---- Drag handling (pointer events on the SVG) ----------------------
    this._svg.addEventListener("pointermove", (e) => this._onPointerMove(e));
    this._svg.addEventListener("pointerup", () => this._finishDrag(true));
    this._svg.addEventListener("pointerleave", () => this._finishDrag(false));
    this._svg.addEventListener("pointercancel", () => this._finishDrag(false));

    // ---- Environment capabilities ---------------------------------------
    this._hasRaf = typeof requestAnimationFrame !== "undefined";
    this._reduceMotion =
      typeof matchMedia !== "undefined" &&
      matchMedia("(prefers-reduced-motion: reduce)").matches;

    // ---- Subscribe + seed -----------------------------------------------
    this._unsub = controller.subscribe((state) => this._onState(state));
    this._onState(controller.getState());

    if (this._hasRaf) this._startLoop();
  }

  // ---- Public API ----------------------------------------------------------

  /** Auto-advance animation at AUTO_STEP_MS until done. */
  play(): void {
    this.stop();
    const state = this._controller.getState();
    if (!state.animation || state.animation.done) return;

    this._timer = setInterval(() => {
      const s = this._controller.getState();
      if (!s.animation || s.animation.done) {
        this.stop();
        return;
      }
      this._controller.stepAnimation();
    }, AUTO_STEP_MS);
  }

  /** Stop auto-play. */
  stop(): void {
    if (this._timer !== null) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }

  /** Advance animation by one step. */
  step(): void {
    this._controller.stepAnimation();
  }

  /** Unsubscribe, cancel the physics loop, and remove the SVG from the DOM. */
  teardown(): void {
    this.stop();
    if (this._raf !== null && typeof cancelAnimationFrame !== "undefined") {
      cancelAnimationFrame(this._raf);
    }
    this._raf = null;
    this._unsub();
    this._svg.parentElement?.removeChild(this._svg);
  }

  // ---- State + physics loop ------------------------------------------------

  private _onState(state: DHTState): void {
    this._lastState = state;
    // Keep geo bits in sync (bits could change on reset)
    this._geo = { ...this._geo, bits: state.bits };
    this._syncBodies(state);
    // Without a rAF loop (e.g. the node test environment) draw once per state.
    if (!this._hasRaf) this._draw();
  }

  /** Reconcile physics bodies with the current node set, refreshing homes. */
  private _syncBodies(state: DHTState): void {
    const present = new Set<number>();
    for (const node of state.nodes) {
      present.add(node.id);
      const home = idToPoint(node.id, this._geo);
      const body = this._bodies.get(node.id);
      if (body) {
        body.homeX = home.x;
        body.homeY = home.y;
      } else {
        this._bodies.set(node.id, {
          x: home.x,
          y: home.y,
          vx: 0,
          vy: 0,
          homeX: home.x,
          homeY: home.y,
          phase: Math.random() * Math.PI * 2,
        });
      }
    }
    for (const id of [...this._bodies.keys()]) {
      if (!present.has(id)) this._bodies.delete(id);
    }
    if (this._dragId !== null && !present.has(this._dragId)) this._dragId = null;
  }

  private _startLoop(): void {
    const tick = (): void => {
      this._stepPhysics();
      // Repaint only when something is actually moving. With idle float on
      // (default) the scene is always gently alive; with reduced motion the
      // loop goes quiet once every node has settled at its home.
      if (this._isActive()) this._draw();
      this._raf = requestAnimationFrame(tick);
    };
    this._raf = requestAnimationFrame(tick);
  }

  /** Whether the scene needs repainting this frame. */
  private _isActive(): boolean {
    if (this._dragId !== null) return true;
    if (!this._reduceMotion) return true; // idle float keeps it alive
    for (const b of this._bodies.values()) {
      if (Math.abs(b.vx) > 0.05 || Math.abs(b.vy) > 0.05) return true;
      if (Math.abs(b.x - b.homeX) > 0.5 || Math.abs(b.y - b.homeY) > 0.5) {
        return true;
      }
    }
    return false;
  }

  private _stepPhysics(): void {
    const t =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    for (const [id, b] of this._bodies) {
      if (id === this._dragId) continue;
      // Target = home, plus a gentle idle orbit (disabled for reduced motion).
      let tx = b.homeX;
      let ty = b.homeY;
      if (!this._reduceMotion) {
        tx += Math.cos(t * FLOAT_SPEED + b.phase) * FLOAT_AMP;
        ty += Math.sin(t * FLOAT_SPEED + b.phase) * FLOAT_AMP;
      }
      b.vx = (b.vx + (tx - b.x) * SPRING_K) * DAMPING;
      b.vy = (b.vy + (ty - b.y) * SPRING_K) * DAMPING;
      b.x += b.vx;
      b.y += b.vy;
    }
  }

  /** Live position of a node (falls back to its ring home if unknown). */
  private _pos(id: number): Point {
    const b = this._bodies.get(id);
    if (b) return { x: b.x, y: b.y };
    return idToPoint(id, this._geo);
  }

  // ---- Pointer drag --------------------------------------------------------

  private _clientToSvg(clientX: number, clientY: number): Point {
    const rect = this._svg.getBoundingClientRect();
    const rw = rect.width || this._w;
    const rh = rect.height || this._h;
    return {
      x: (clientX - rect.left) * (this._w / rw),
      y: (clientY - rect.top) * (this._h / rh),
    };
  }

  private _beginDrag(id: number, e: PointerEvent): void {
    const b = this._bodies.get(id);
    if (!b) return;
    const pt = this._clientToSvg(e.clientX, e.clientY);
    this._dragId = id;
    this._dragOffset = { x: pt.x - b.x, y: pt.y - b.y };
    this._downPt = pt;
    this._dragMoved = false;
    b.vx = 0;
    b.vy = 0;
  }

  private _onPointerMove(e: PointerEvent): void {
    if (this._dragId === null) return;
    const b = this._bodies.get(this._dragId);
    if (!b) return;
    const pt = this._clientToSvg(e.clientX, e.clientY);
    if (Math.hypot(pt.x - this._downPt.x, pt.y - this._downPt.y) > 4) {
      this._dragMoved = true;
    }
    const nx = pt.x - this._dragOffset.x;
    const ny = pt.y - this._dragOffset.y;
    // Track pointer velocity so releasing the node flings it.
    b.vx = nx - b.x;
    b.vy = ny - b.y;
    b.x = nx;
    b.y = ny;
  }

  /**
   * End a drag. A press that never moved past the threshold counts as a tap →
   * toggle selection (we drive selection from pointer events because the node
   * circles are recreated every animation frame, so a synthesised `click` would
   * not reliably land on the same element).
   */
  private _finishDrag(allowTap: boolean): void {
    if (allowTap && this._dragId !== null && !this._dragMoved) {
      const id = this._dragId;
      const sel = this._lastState?.selectedId ?? null;
      this._controller.selectNode(sel === id ? null : id);
    }
    this._dragId = null;
    this._dragMoved = false;
  }

  // ---- Main draw -----------------------------------------------------------

  private _draw(): void {
    const state = this._lastState;
    if (!state) return;
    this._renderGuide();
    this._renderFingers(state);
    this._renderSuccessors(state);
    this._renderAnimation(state);
    this._renderNodes(state);
  }

  // ---- Guide circle -------------------------------------------------------

  private _renderGuide(): void {
    clearChildren(this._layerGuide);
    const { cx, cy, radius } = this._geo;
    const circle = svgEl("circle", {
      cx,
      cy,
      r: radius,
      fill: "none",
      stroke: COLOR.ringGuide,
      "stroke-width": 1.5,
      "stroke-dasharray": "4 6",
      opacity: 0.9,
    });
    this._layerGuide.appendChild(circle);
  }

  // ---- Finger chords (faint, behind successors) ---------------------------

  private _renderFingers(state: DHTState): void {
    clearChildren(this._layerFingers);
    if (state.nodes.length < 2) return;

    const anim = state.animation;
    // Determine which (source, target) finger is highlighted during animation
    let highlightSrc: number | null = null;
    let highlightTarget: number | null = null;
    if (anim && !anim.done && anim.step < anim.path.length - 1) {
      highlightSrc = anim.path[anim.step] ?? null;
      highlightTarget = anim.path[anim.step + 1] ?? null;
    }

    for (const node of state.nodes) {
      const src = this._pos(node.id);
      for (const finger of node.fingers) {
        const isHighlighted =
          node.id === highlightSrc && finger.targetId === highlightTarget;

        // Skip the finger that is the immediate successor — that's drawn as
        // the successor arc — unless this is the highlighted hop, otherwise a
        // route that forwards via the successor finger would show no highlight.
        if (finger.targetId === this._ringNext(state, node.id) && !isHighlighted)
          continue;

        const dst = this._pos(finger.targetId);
        const line = svgEl("line", {
          x1: src.x,
          y1: src.y,
          x2: dst.x,
          y2: dst.y,
          stroke: isHighlighted ? COLOR.fingerHighlight : COLOR.fingerChord,
          "stroke-width": isHighlighted ? 2.5 : 1,
          opacity: isHighlighted ? 0.95 : 0.5,
          "stroke-dasharray": isHighlighted ? "none" : "3 4",
        });
        this._layerFingers.appendChild(line);
      }
    }
  }

  // ---- Successor arcs (ring order edges) ----------------------------------

  private _renderSuccessors(state: DHTState): void {
    clearChildren(this._layerSuccessors);
    if (state.nodes.length < 2) return;

    for (const node of state.nodes) {
      const nextId = this._ringNext(state, node.id);
      if (nextId === node.id) continue;

      const src = this._pos(node.id);
      const dst = this._pos(nextId);

      const line = svgEl("line", {
        x1: src.x,
        y1: src.y,
        x2: dst.x,
        y2: dst.y,
        stroke: COLOR.successorArc,
        "stroke-width": 2,
        opacity: 0.8,
        "stroke-linecap": "round",
      });
      this._layerSuccessors.appendChild(line);
    }
  }

  // ---- Animation layer ----------------------------------------------------

  private _renderAnimation(state: DHTState): void {
    clearChildren(this._layerAnimation);
    const anim = state.animation;
    if (!anim) return;

    const modValue = Math.pow(2, state.bits);

    // Key position on ring (fixed — the key's slot, not a node)
    const keyPos = fractionToPoint(anim.key / modValue, this._geo);
    const keyCircle = svgEl("circle", {
      cx: keyPos.x,
      cy: keyPos.y,
      r: KEY_MARKER_RADIUS,
      fill: COLOR.keyMarker,
      opacity: 0.95,
      stroke: "#fff",
      "stroke-width": 1.5,
    });
    this._layerAnimation.appendChild(keyCircle);

    // Key label
    const keyLabel = svgEl("text", {
      x: keyPos.x,
      y: keyPos.y - KEY_MARKER_RADIUS - 5,
      "text-anchor": "middle",
      "font-size": 10,
      fill: "#b45309",
      "font-family": "monospace",
      "font-weight": "bold",
    });
    keyLabel.textContent = `k=${anim.key}`;
    this._layerAnimation.appendChild(keyLabel);

    // Destination node highlight ring (follows the live node position)
    const destPos = this._pos(anim.destination);
    const destRing = svgEl("circle", {
      cx: destPos.x,
      cy: destPos.y,
      r: NODE_RADIUS + 6,
      fill: "none",
      stroke: anim.done ? COLOR.doneDest : COLOR.destination,
      "stroke-width": 2.5,
      opacity: 0.8,
    });
    this._layerAnimation.appendChild(destRing);

    // Draw hop path lines (0..step inclusive)
    const hopsToShow = Math.min(anim.step + 1, anim.path.length - 1);
    for (let i = 0; i < hopsToShow; i++) {
      const fromId = anim.path[i];
      const toId = anim.path[i + 1];
      if (fromId === undefined || toId === undefined) break;

      // At step 0 the first hop is the one being drawn; afterwards the current
      // hop is the most recently completed one (step - 1).
      const isCurrent = anim.step === 0 ? i === 0 : i === anim.step - 1;
      const from = this._pos(fromId);
      const to = this._pos(toId);

      const line = svgEl("line", {
        x1: from.x,
        y1: from.y,
        x2: to.x,
        y2: to.y,
        stroke: isCurrent ? COLOR.hopCurrent : COLOR.hopPath,
        "stroke-width": isCurrent ? 3 : 1.8,
        opacity: isCurrent ? 1 : 0.55,
        "stroke-linecap": "round",
      });
      this._layerAnimation.appendChild(line);

      // Arrowhead at end of line
      this._appendArrowhead(from.x, from.y, to.x, to.y, isCurrent);
    }

    // "Done" annotation
    if (anim.done) {
      this._renderDoneLabel(anim, destPos);
    }

    // Step counter
    const stepLabel = svgEl("text", {
      x: this._geo.cx,
      y: this._geo.cy + this._geo.radius + 45,
      "text-anchor": "middle",
      "font-size": 12,
      fill: COLOR.muted,
      "font-family": "monospace",
    });
    const kindLabel = anim.kind.toUpperCase();
    stepLabel.textContent = anim.done
      ? `${kindLabel} done`
      : `${kindLabel} step ${anim.step + 1} / ${anim.path.length - 1}`;
    this._layerAnimation.appendChild(stepLabel);
  }

  private _appendArrowhead(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    highlight: boolean
  ): void {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1) return;
    const ux = dx / len;
    const uy = dy / len;
    // Back the tip off from the node edge
    const tipX = x2 - ux * (NODE_RADIUS + 2);
    const tipY = y2 - uy * (NODE_RADIUS + 2);
    const size = 8;
    const p1x = tipX - ux * size + uy * (size / 2);
    const p1y = tipY - uy * size - ux * (size / 2);
    const p2x = tipX - ux * size - uy * (size / 2);
    const p2y = tipY - uy * size + ux * (size / 2);
    const arrow = svgEl("polygon", {
      points: `${tipX},${tipY} ${p1x},${p1y} ${p2x},${p2y}`,
      fill: highlight ? COLOR.hopCurrent : COLOR.hopPath,
      opacity: highlight ? 1 : 0.55,
    });
    this._layerAnimation.appendChild(arrow);
  }

  private _renderDoneLabel(
    anim: RouteAnimation,
    destPos: { x: number; y: number }
  ): void {
    let msg = "";
    if (anim.kind === "insert") {
      msg = `✓ stored "${anim.value ?? ""}" at node ${anim.destination}`;
    } else if (anim.kind === "search") {
      msg =
        anim.value != null
          ? `✓ found "${anim.value}" at node ${anim.destination}`
          : `✗ not found at node ${anim.destination}`;
    } else if (anim.kind === "delete") {
      msg =
        anim.value != null
          ? `✓ deleted "${anim.value}" from node ${anim.destination}`
          : `✗ key not found at node ${anim.destination}`;
    } else {
      msg = `✓ routed to node ${anim.destination}`;
    }

    const bg = svgEl("rect", {
      x: destPos.x - 110,
      y: destPos.y - NODE_RADIUS - 38,
      width: 220,
      height: 22,
      rx: 2,
      fill: COLOR.doneLabelBg,
      stroke: COLOR.doneLabelBorder,
      "stroke-width": 2,
    });
    const txt = svgEl("text", {
      x: destPos.x,
      y: destPos.y - NODE_RADIUS - 22,
      "text-anchor": "middle",
      "font-size": 11,
      fill: COLOR.doneDest,
      "font-family": "monospace",
    });
    txt.textContent = msg;
    this._layerAnimation.appendChild(bg);
    this._layerAnimation.appendChild(txt);
  }

  // ---- Node markers + labels ----------------------------------------------

  private _renderNodes(state: DHTState): void {
    clearChildren(this._layerNodes);
    clearChildren(this._layerLabels);

    const anim = state.animation;
    const currentHopId =
      anim && !anim.done ? (anim.path[anim.step] ?? null) : null;

    for (const node of state.nodes) {
      const pt = this._pos(node.id);
      const isSelected = node.id === state.selectedId;
      const isCurrentHop = node.id === currentHopId;
      const isAnimStart = anim ? node.id === anim.startId : false;
      const isDragging = node.id === this._dragId;

      // Node circle
      const circle = svgEl("circle", {
        cx: pt.x,
        cy: pt.y,
        r: NODE_RADIUS,
        fill: isSelected ? COLOR.nodeSelected : COLOR.node,
        stroke: isSelected ? COLOR.nodeSelectedStroke : COLOR.nodeStroke,
        "stroke-width": isCurrentHop ? 3 : isSelected ? 2.5 : 2,
        style: `cursor:${isDragging ? "grabbing" : "grab"};`,
      });

      // Pointer down → start a drag; a press with no movement is treated as a
      // tap that toggles selection (see _finishDrag).
      circle.addEventListener("pointerdown", (e) =>
        this._beginDrag(node.id, e as PointerEvent)
      );

      this._layerNodes.appendChild(circle);

      // Pulsing ring for current hop / anim start
      if (isCurrentHop || isAnimStart) {
        const pulse = svgEl("circle", {
          cx: pt.x,
          cy: pt.y,
          r: NODE_RADIUS + 8,
          fill: "none",
          stroke: COLOR.hopCurrent,
          "stroke-width": 1.5,
          opacity: 0.5,
        });
        this._layerNodes.appendChild(pulse);
      }

      // Node id label inside circle
      const idLabel = svgEl("text", {
        x: pt.x,
        y: pt.y + 4,
        "text-anchor": "middle",
        "font-size": 11,
        "font-weight": "bold",
        fill: isSelected ? COLOR.nodeLabelSelected : COLOR.nodeLabel,
        "font-family": "monospace",
        style: "pointer-events:none;user-select:none;",
      });
      idLabel.textContent = String(node.id);
      this._layerLabels.appendChild(idLabel);

      // Name label below node (always visible, small)
      const nameLabel = svgEl("text", {
        x: pt.x,
        y: pt.y + NODE_RADIUS + 13,
        "text-anchor": "middle",
        "font-size": 9,
        fill: isSelected ? COLOR.nodeSelected : COLOR.nodeLabelSmall,
        "font-family": "sans-serif",
        style: "pointer-events:none;user-select:none;",
      });
      nameLabel.textContent = node.name;
      this._layerLabels.appendChild(nameLabel);

      // File badge (count of stored files)
      if (node.files.length > 0) {
        const bx = pt.x + NODE_RADIUS - 2;
        const by = pt.y - NODE_RADIUS + 2;
        const badge = svgEl("circle", {
          cx: bx,
          cy: by,
          r: 7,
          fill: COLOR.fileBadgeFill,
          stroke: "#fff",
          "stroke-width": 1.5,
        });
        const badgeText = svgEl("text", {
          x: bx,
          y: by + 4,
          "text-anchor": "middle",
          "font-size": 8,
          "font-weight": "bold",
          fill: COLOR.fileBadgeText,
          "font-family": "monospace",
          style: "pointer-events:none;user-select:none;",
        });
        badgeText.textContent = String(node.files.length);
        this._layerLabels.appendChild(badge);
        this._layerLabels.appendChild(badgeText);
      }
    }
  }

  // ---- Helpers ------------------------------------------------------------

  /** Get the ring-next node id (circular successor in sorted order). */
  private _ringNext(state: DHTState, id: number): number {
    const ids = state.nodes.map((n) => n.id).sort((a, b) => a - b);
    const idx = ids.indexOf(id);
    if (idx === -1 || ids.length === 0) return id;
    return ids[(idx + 1) % ids.length] ?? id;
  }
}
