/**
 * ring-view.ts — SVG Chord ring visualizer.
 *
 * Subscribes to a DHTController and re-renders the ring on every state change.
 * Public API:
 *   - constructor(container, controller)
 *   - play()   — auto-step animation at ~600ms intervals until done
 *   - stop()   — cancel auto-play
 *   - step()   — single animation step
 *   - teardown() — unsubscribe + remove SVG from DOM
 */

import { DHTController, DHTState, RouteAnimation } from "../controller.js";
import { RingGeometry, idToPoint, fractionToPoint } from "../layout.js";
import { svgEl, setAttrs, clearChildren } from "./svg-utils.js";

// ---------------------------------------------------------------------------
// Visual constants
// ---------------------------------------------------------------------------

const NODE_RADIUS = 14;
const KEY_MARKER_RADIUS = 7;
const AUTO_STEP_MS = 600;

const COLOR = {
  ringGuide: "#334155",
  ringEdge: "#475569",
  node: "#1e293b",
  nodeStroke: "#94a3b8",
  nodeSelected: "#0ea5e9",
  nodeSelectedStroke: "#38bdf8",
  nodeLabel: "#e2e8f0",
  nodeLabelSmall: "#94a3b8",
  successorArc: "#334155",
  fingerChord: "#334155",
  fingerHighlight: "#f59e0b",
  hopPath: "#64748b",
  hopCurrent: "#38bdf8",
  destination: "#10b981",
  keyMarker: "#f59e0b",
  fileBadgeFill: "#0ea5e9",
  fileBadgeText: "#fff",
  doneDest: "#10b981",
} as const;

// ---------------------------------------------------------------------------
// RingView
// ---------------------------------------------------------------------------

export class RingView {
  private _svg: SVGSVGElement;
  private _geo: RingGeometry;
  private _controller: DHTController;
  private _unsub: () => void;
  private _timer: ReturnType<typeof setInterval> | null = null;

  // Layer groups (painted in order — last is on top)
  private _layerGuide: SVGGElement;
  private _layerFingers: SVGGElement;
  private _layerSuccessors: SVGGElement;
  private _layerAnimation: SVGGElement;
  private _layerNodes: SVGGElement;
  private _layerLabels: SVGGElement;

  constructor(container: HTMLElement, controller: DHTController) {
    this._controller = controller;

    // ---- Size SVG to container ------------------------------------------
    const w = container.clientWidth || 600;
    const h = container.clientHeight || 600;
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
      style: "display:block;",
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

    // ---- Subscribe ---------------------------------------------------------
    this._unsub = controller.subscribe((state) => this._render(state));
    // Initial render
    this._render(controller.getState());
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

  /** Unsubscribe from controller and remove SVG from DOM. */
  teardown(): void {
    this.stop();
    this._unsub();
    this._svg.parentElement?.removeChild(this._svg);
  }

  // ---- Main render ---------------------------------------------------------

  private _render(state: DHTState): void {
    // Keep geo bits in sync (bits could change on reset)
    this._geo = { ...this._geo, bits: state.bits };

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
      "stroke-width": 1,
      "stroke-dasharray": "4 4",
      opacity: 0.4,
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
      const src = idToPoint(node.id, this._geo);
      for (const finger of node.fingers) {
        // Skip the finger that is the immediate successor — that's drawn as
        // the successor arc.
        if (finger.targetId === this._ringNext(state, node.id)) continue;

        const isHighlighted =
          node.id === highlightSrc && finger.targetId === highlightTarget;

        const dst = idToPoint(finger.targetId, this._geo);
        const line = svgEl("line", {
          x1: src.x,
          y1: src.y,
          x2: dst.x,
          y2: dst.y,
          stroke: isHighlighted ? COLOR.fingerHighlight : COLOR.fingerChord,
          "stroke-width": isHighlighted ? 2.5 : 0.8,
          opacity: isHighlighted ? 0.9 : 0.18,
          "stroke-dasharray": isHighlighted ? "none" : "3 3",
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

      const src = idToPoint(node.id, this._geo);
      const dst = idToPoint(nextId, this._geo);

      const line = svgEl("line", {
        x1: src.x,
        y1: src.y,
        x2: dst.x,
        y2: dst.y,
        stroke: COLOR.successorArc,
        "stroke-width": 1.5,
        opacity: 0.5,
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

    // Key position on ring
    const keyPos = fractionToPoint(anim.key / modValue, this._geo);
    const keyCircle = svgEl("circle", {
      cx: keyPos.x,
      cy: keyPos.y,
      r: KEY_MARKER_RADIUS,
      fill: COLOR.keyMarker,
      opacity: 0.85,
      stroke: "#fff",
      "stroke-width": 1,
    });
    this._layerAnimation.appendChild(keyCircle);

    // Key label
    const keyLabel = svgEl("text", {
      x: keyPos.x,
      y: keyPos.y - KEY_MARKER_RADIUS - 5,
      "text-anchor": "middle",
      "font-size": 10,
      fill: COLOR.keyMarker,
      "font-family": "monospace",
    });
    keyLabel.textContent = `k=${anim.key}`;
    this._layerAnimation.appendChild(keyLabel);

    // Destination node highlight ring
    const destPos = idToPoint(anim.destination, this._geo);
    const destRing = svgEl("circle", {
      cx: destPos.x,
      cy: destPos.y,
      r: NODE_RADIUS + 6,
      fill: "none",
      stroke: anim.done ? COLOR.doneDest : COLOR.destination,
      "stroke-width": 2,
      opacity: 0.7,
    });
    this._layerAnimation.appendChild(destRing);

    // Draw hop path lines (0..step inclusive)
    const hopsToShow = Math.min(anim.step + 1, anim.path.length - 1);
    for (let i = 0; i < hopsToShow; i++) {
      const fromId = anim.path[i];
      const toId = anim.path[i + 1];
      if (fromId === undefined || toId === undefined) break;

      const isCurrent = i === anim.step - 1;
      const from = idToPoint(fromId, this._geo);
      const to = idToPoint(toId, this._geo);

      const line = svgEl("line", {
        x1: from.x,
        y1: from.y,
        x2: to.x,
        y2: to.y,
        stroke: isCurrent ? COLOR.hopCurrent : COLOR.hopPath,
        "stroke-width": isCurrent ? 3 : 1.8,
        opacity: isCurrent ? 1 : 0.5,
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
      fill: "#94a3b8",
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
      opacity: highlight ? 1 : 0.5,
    });
    this._layerAnimation.appendChild(arrow);
  }

  private _renderDoneLabel(anim: RouteAnimation, destPos: { x: number; y: number }): void {
    let msg = "";
    if (anim.kind === "insert") {
      msg = `✓ stored "${anim.value ?? ""}" at node ${anim.destination}`;
    } else if (anim.kind === "search") {
      msg = anim.value != null
        ? `✓ found "${anim.value}" at node ${anim.destination}`
        : `✗ not found at node ${anim.destination}`;
    } else if (anim.kind === "delete") {
      msg = anim.value != null
        ? `✓ deleted "${anim.value}" from node ${anim.destination}`
        : `✗ key not found at node ${anim.destination}`;
    } else {
      msg = `✓ routed to node ${anim.destination}`;
    }

    const bg = svgEl("rect", {
      x: destPos.x - 110,
      y: destPos.y - NODE_RADIUS - 36,
      width: 220,
      height: 22,
      rx: 4,
      fill: "#0f172a",
      opacity: 0.85,
    });
    const txt = svgEl("text", {
      x: destPos.x,
      y: destPos.y - NODE_RADIUS - 20,
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
      const pt = idToPoint(node.id, this._geo);
      const isSelected = node.id === state.selectedId;
      const isCurrentHop = node.id === currentHopId;
      const isAnimStart = anim ? node.id === anim.startId : false;

      // Node circle
      const circle = svgEl("circle", {
        cx: pt.x,
        cy: pt.y,
        r: NODE_RADIUS,
        fill: isSelected ? COLOR.nodeSelected : COLOR.node,
        stroke: isSelected ? COLOR.nodeSelectedStroke : COLOR.nodeStroke,
        "stroke-width": isCurrentHop ? 3 : isSelected ? 2.5 : 1.5,
        style: "cursor:pointer;transition:stroke-width 0.15s",
      });

      // Click → selectNode
      circle.addEventListener("click", () => {
        this._controller.selectNode(
          state.selectedId === node.id ? null : node.id
        );
      });

      this._layerNodes.appendChild(circle);

      // Pulsing ring for current hop
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
        fill: COLOR.nodeLabel,
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
          stroke: "#0f172a",
          "stroke-width": 1,
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
