/**
 * ui/inspector.ts — Selected-node inspector.
 *
 * Subscribes to the controller and, when a node is selected, renders that
 * node's finger table (i | start | → target) and its stored files (key → value)
 * as brutalist tables.  When nothing is selected it shows a placeholder.  Node
 * selection itself is driven by clicks in the RingView, so this panel is purely
 * reactive.
 */

import { DHTController, DHTState } from "../controller.js";
import { el, clear } from "./dom.js";

export class Inspector {
  readonly element: HTMLElement;
  private _body: HTMLElement;
  private _unsub: () => void;

  constructor(controller: DHTController) {
    this._body = el("div", { className: "inspector-body" });
    this.element = el("div", { className: "section" }, [
      el("div", { className: "section__title", text: "Inspector" }),
      this._body,
    ]);

    this._unsub = controller.subscribe((s) => this._render(s));
    this._render(controller.getState());
  }

  teardown(): void {
    this._unsub();
  }

  private _render(state: DHTState): void {
    clear(this._body);

    if (state.selectedId === null) {
      this._body.append(
        el("div", { className: "placeholder", text: "Select a node in the ring" })
      );
      return;
    }

    const node = state.nodes.find((n) => n.id === state.selectedId);
    if (!node) {
      this._body.append(
        el("div", { className: "placeholder", text: "Selected node no longer exists" })
      );
      return;
    }

    // Header: id + name
    this._body.append(
      el("div", { className: "inspector-node" }, [
        el("span", { className: "node-badge", text: `#${node.id}` }),
        el("span", { text: node.name }),
      ])
    );

    // ---- Finger table ----
    this._body.append(el("div", { className: "inspector-subtitle", text: "Finger table" }));
    if (node.fingers.length === 0) {
      this._body.append(el("div", { className: "placeholder", text: "empty" }));
    } else {
      const rows: Node[] = node.fingers.map((f) =>
        el("tr", {}, [
          el("td", { text: String(f.index) }),
          el("td", { text: String(f.startId) }),
          el("td", {}, [
            el("span", { className: "arrow", text: "→ " }),
            document.createTextNode(String(f.targetId)),
          ]),
        ])
      );
      const table = el("table", { className: "brutal-table" }, [
        el("thead", {}, [
          el("tr", {}, [
            el("th", { text: "i" }),
            el("th", { text: "start" }),
            el("th", { text: "target" }),
          ]),
        ]),
        el("tbody", {}, rows),
      ]);
      this._body.append(table);
    }

    // ---- Stored files ----
    this._body.append(el("div", { className: "inspector-subtitle", text: "Stored files" }));
    if (node.files.length === 0) {
      this._body.append(el("div", { className: "placeholder", text: "empty" }));
    } else {
      const items: Node[] = node.files.map((file) =>
        el("li", {}, [
          el("span", { className: "file-key", text: String(file.key) }),
          el("span", { className: "file-arrow", text: "→" }),
          document.createTextNode(file.value),
        ])
      );
      this._body.append(el("ul", { className: "files-list" }, items));
    }
  }
}
