/**
 * ui/animation-bar.ts — Step / Play / Pause / Finish controls + status + legend.
 *
 * Step/Play drive the RingView; Pause stops auto-play; Finish jumps the
 * controller animation to done.  The status line subscribes to the controller
 * and reflects the current animation (kind, step n/total, done message).  The
 * Step/Play buttons disable when there is no animation or it is already done.
 *
 * The status line is also the single shared status line for the whole UI: other
 * panels report through `setStatus`, and any live animation overrides that text
 * on the next state change.
 */

import { DHTController, DHTState, RouteAnimation } from "../controller.js";
import { RingView } from "../viz/index.js";
import { el } from "./dom.js";

export class AnimationBar {
  readonly element: HTMLElement;
  private _controller: DHTController;
  private _view: RingView;
  private _unsub: () => void;

  private _stepBtn: HTMLButtonElement;
  private _playBtn: HTMLButtonElement;
  private _pauseBtn: HTMLButtonElement;
  private _finishBtn: HTMLButtonElement;
  private _status: HTMLElement;

  constructor(controller: DHTController, view: RingView) {
    this._controller = controller;
    this._view = view;

    this._stepBtn = el("button", { className: "btn btn--screen", text: "▶ Step" }) as HTMLButtonElement;
    this._playBtn = el("button", { className: "btn btn--screen", text: "▶▶ Play" }) as HTMLButtonElement;
    this._pauseBtn = el("button", { className: "btn btn--screen", text: "❚❚ Pause" }) as HTMLButtonElement;
    this._finishBtn = el("button", { className: "btn btn--screen", text: "⏭ Finish" }) as HTMLButtonElement;

    this._stepBtn.addEventListener("click", () => this._view.step());
    this._playBtn.addEventListener("click", () => this._view.play());
    this._pauseBtn.addEventListener("click", () => this._view.stop());
    this._finishBtn.addEventListener("click", () => this._controller.finishAnimation());

    this._status = el("div", { className: "animation-bar__status" });

    const controlsRow = el("div", { className: "animation-bar__controls" }, [
      this._stepBtn,
      this._playBtn,
      this._pauseBtn,
      this._finishBtn,
    ]);

    this.element = el("div", { className: "animation-bar" }, [
      controlsRow,
      this._status,
      this._buildLegend(),
    ]);

    this._unsub = controller.subscribe((s) => this._render(s));
    this._render(controller.getState());
  }

  teardown(): void {
    this._unsub();
  }

  /** Set the status line directly (used by other panels for one-off messages). */
  setStatus(msg: string): void {
    this._status.textContent = msg;
    this._status.classList.remove("is-done");
  }

  private _render(state: DHTState): void {
    const anim = state.animation;
    const active = anim !== null && !anim.done;

    this._stepBtn.disabled = !active;
    this._playBtn.disabled = !active;
    this._pauseBtn.disabled = anim === null;
    this._finishBtn.disabled = !active;

    if (anim) {
      this._status.textContent = this._describe(anim);
      this._status.classList.toggle("is-done", anim.done);
    }
    // When there is no animation, leave whatever message panels last set.
  }

  private _describe(anim: RouteAnimation): string {
    const kind = anim.kind.toUpperCase();
    if (!anim.done) {
      const total = Math.max(1, anim.path.length - 1);
      return `${kind} key ${anim.key}: hop ${anim.step + 1} / ${total} (now at node ${anim.path[anim.step] ?? anim.startId})`;
    }
    switch (anim.kind) {
      case "insert":
        return `INSERT done — stored "${anim.value ?? ""}" at node ${anim.destination}`;
      case "search":
        return anim.value != null
          ? `SEARCH done — found "${anim.value}" at node ${anim.destination}`
          : `SEARCH done — key ${anim.key} not found at node ${anim.destination}`;
      case "delete":
        return anim.value != null
          ? `DELETE done — removed "${anim.value}" from node ${anim.destination}`
          : `DELETE done — key ${anim.key} not found at node ${anim.destination}`;
      default:
        return `ROUTE done — key ${anim.key} resolved to node ${anim.destination}`;
    }
  }

  private _buildLegend(): HTMLElement {
    const item = (cls: string, label: string): HTMLElement =>
      el("span", { className: "legend__item" }, [
        el("span", { className: `legend__swatch ${cls}` }),
        document.createTextNode(label),
      ]);

    return el("div", { className: "legend" }, [
      item("legend__swatch--hop", "current hop"),
      item("legend__swatch--finger", "highlighted finger"),
      item("legend__swatch--dest", "destination"),
      item("legend__swatch--key", "key marker"),
    ]);
  }
}
