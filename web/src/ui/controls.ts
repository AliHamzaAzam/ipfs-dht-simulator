/**
 * ui/controls.ts — Brutalist control panel.
 *
 * Builds the Ring / Nodes / Route / File / Hash control groups and wires every
 * action to the DHTController.  Start-node `<select>`s refresh their options
 * whenever the ring changes (via controller.subscribe).  All status feedback is
 * routed through the injected `setStatus` callback so the animation bar owns the
 * single shared status line.
 */

import { DHTController, DHTState } from "../controller.js";
import { el } from "./dom.js";

export interface ControlsOptions {
  /** Report a short message in the shared status line. */
  setStatus: (msg: string) => void;
}

export class Controls {
  readonly element: HTMLElement;
  private _controller: DHTController;
  private _setStatus: (msg: string) => void;
  private _unsub: () => void;

  /** Start-node selects that must track the current node set. */
  private _nodeSelects: HTMLSelectElement[] = [];

  private _addCounter = 1;

  constructor(controller: DHTController, opts: ControlsOptions) {
    this._controller = controller;
    this._setStatus = opts.setStatus;
    this.element = el("div", { className: "controls" });

    this._buildRingGroup();
    this._buildNodesGroup();
    this._buildRouteGroup();
    this._buildFileGroup();
    this._buildHashGroup();

    // Keep node-pickers in sync with the ring.
    this._unsub = controller.subscribe((s) => this._syncNodeSelects(s));
    this._syncNodeSelects(controller.getState());
  }

  teardown(): void {
    this._unsub();
  }

  // -------------------------------------------------------------------------
  // Ring group: bit-space + node count + rebuild
  // -------------------------------------------------------------------------

  private _buildRingGroup(): void {
    const state = this._controller.getState();

    const bitsSelect = el("select", { className: "select" }) as HTMLSelectElement;
    for (let b = 3; b <= 8; b++) {
      const opt = el("option", { value: b, text: `${b}-bit (${2 ** b} slots)` });
      if (b === state.bits) opt.selected = true;
      bitsSelect.append(opt);
    }

    const countInput = el("input", {
      className: "input input--narrow",
      type: "number",
      min: 1,
      value: Math.max(1, state.nodes.length || 5),
    }) as HTMLInputElement;

    const rebuildBtn = el("button", { className: "btn btn--primary", text: "Rebuild" });
    rebuildBtn.addEventListener("click", () => {
      const bits = Number(bitsSelect.value);
      const maxNodes = 2 ** bits;
      let n = Math.floor(Number(countInput.value));
      if (!Number.isFinite(n) || n < 1) n = 1;
      if (n > maxNodes) n = maxNodes;
      countInput.value = String(n);
      this._controller.reset(bits, n);
      this._setStatus(`Rebuilt ring: ${bits}-bit, ${n} node${n === 1 ? "" : "s"}`);
    });

    const section = this._section("Ring", [
      this._controlGroup([
        this._field("Bit-space", bitsSelect),
        this._field("Nodes", countInput),
        rebuildBtn,
      ]),
    ]);
    this.element.append(section);
  }

  // -------------------------------------------------------------------------
  // Nodes group: add / remove selected
  // -------------------------------------------------------------------------

  private _buildNodesGroup(): void {
    const nameInput = el("input", {
      className: "input",
      type: "text",
      placeholder: "name (optional)",
    }) as HTMLInputElement;

    const idInput = el("input", {
      className: "input input--narrow",
      type: "number",
      min: 0,
      placeholder: "id",
    }) as HTMLInputElement;

    const addBtn = el("button", { className: "btn btn--primary", text: "Add node" });
    addBtn.addEventListener("click", () => {
      const name = nameInput.value.trim() || `node-${this._addCounter++}`;
      const idRaw = idInput.value.trim();
      let ok: boolean;
      if (idRaw === "") {
        ok = this._controller.addNode(name);
      } else {
        const id = Math.floor(Number(idRaw));
        if (!Number.isFinite(id) || id < 0) {
          this._setStatus(`Invalid id "${idRaw}"`);
          return;
        }
        ok = this._controller.addNode(name, id);
      }
      if (ok) {
        this._setStatus(`Added node "${name}"${idRaw ? ` at id ${idRaw}` : ""}`);
        nameInput.value = "";
        idInput.value = "";
      } else {
        this._setStatus(
          `Could not add "${name}" — id taken or ring full`
        );
      }
    });

    const removeBtn = el("button", { className: "btn", text: "Remove sel." });
    removeBtn.addEventListener("click", () => {
      const sel = this._controller.getState().selectedId;
      if (sel === null) {
        this._setStatus("No node selected — click a node in the ring first");
        return;
      }
      const ok = this._controller.removeNode(sel);
      this._setStatus(ok ? `Removed node ${sel}` : `Remove failed for node ${sel}`);
    });

    const section = this._section("Nodes", [
      this._controlGroup([
        this._field("Name", nameInput, true),
        this._field("Id", idInput),
      ]),
      this._controlGroup([addBtn, removeBtn]),
    ]);
    this.element.append(section);
  }

  // -------------------------------------------------------------------------
  // Route group: key + start node
  // -------------------------------------------------------------------------

  private _buildRouteGroup(): void {
    const keyInput = el("input", {
      className: "input input--narrow",
      type: "number",
      min: 0,
      value: 0,
    }) as HTMLInputElement;

    const startSelect = this._makeNodeSelect();

    const routeBtn = el("button", { className: "btn btn--primary", text: "Route" });
    routeBtn.addEventListener("click", () => {
      const startId = this._selectedStartId(startSelect);
      if (startId === null) {
        this._setStatus("No nodes to route from — rebuild the ring");
        return;
      }
      const key = Math.floor(Number(keyInput.value));
      if (!Number.isFinite(key) || key < 0) {
        this._setStatus(`Invalid key "${keyInput.value}"`);
        return;
      }
      this._controller.startRoute(key, startId);
      this._setStatus(`Routing key ${key} from node ${startId} — Step/Play to animate`);
    });

    const section = this._section("Route", [
      this._controlGroup([
        this._field("Key", keyInput),
        this._field("Start node", startSelect, true),
        routeBtn,
      ]),
    ]);
    this.element.append(section);
  }

  // -------------------------------------------------------------------------
  // File group: name + start node + insert/search/delete
  // -------------------------------------------------------------------------

  private _buildFileGroup(): void {
    const nameInput = el("input", {
      className: "input",
      type: "text",
      placeholder: "file name",
      value: "hello.txt",
    }) as HTMLInputElement;

    const keyReadout = el("span", { className: "hash-key" });
    const readout = el("div", { className: "hash-readout" }, [
      "key = ",
      keyReadout,
    ]);

    const refreshKey = (): void => {
      const name = nameInput.value;
      keyReadout.textContent = name ? String(this._controller.hashName(name)) : "—";
    };
    nameInput.addEventListener("input", refreshKey);
    refreshKey();

    const startSelect = this._makeNodeSelect();

    const opStart = (): number | null => this._selectedStartId(startSelect);

    const insertBtn = el("button", { className: "btn btn--primary", text: "Insert" });
    insertBtn.addEventListener("click", () => {
      const startId = opStart();
      const name = nameInput.value.trim();
      if (startId === null) return this._setStatus("No start node — rebuild the ring");
      if (!name) return this._setStatus("Enter a file name first");
      this._controller.startInsertFile(name, startId);
      const key = this._controller.hashName(name);
      this._setStatus(`Inserting "${name}" (key ${key}) from node ${startId}`);
    });

    const searchBtn = el("button", { className: "btn", text: "Search" });
    searchBtn.addEventListener("click", () => {
      const startId = opStart();
      const name = nameInput.value.trim();
      if (startId === null) return this._setStatus("No start node — rebuild the ring");
      if (!name) return this._setStatus("Enter a file name first");
      const key = this._controller.hashName(name);
      this._controller.startSearchFile(key, startId);
      this._setStatus(`Searching "${name}" (key ${key}) from node ${startId}`);
    });

    const deleteBtn = el("button", { className: "btn", text: "Delete" });
    deleteBtn.addEventListener("click", () => {
      const startId = opStart();
      const name = nameInput.value.trim();
      if (startId === null) return this._setStatus("No start node — rebuild the ring");
      if (!name) return this._setStatus("Enter a file name first");
      const key = this._controller.hashName(name);
      this._controller.startDeleteFile(key, startId);
      this._setStatus(`Deleting "${name}" (key ${key}) from node ${startId}`);
    });

    const section = this._section("File", [
      this._controlGroup([
        this._field("Name", nameInput, true),
        this._field("Start node", startSelect),
      ]),
      readout,
      this._controlGroup([insertBtn, searchBtn, deleteBtn]),
    ]);
    this.element.append(section);
  }

  // -------------------------------------------------------------------------
  // Hash inspector group: string → key (live)
  // -------------------------------------------------------------------------

  private _buildHashGroup(): void {
    const input = el("input", {
      className: "input",
      type: "text",
      placeholder: "any string",
    }) as HTMLInputElement;

    const keyOut = el("span", { className: "hash-key", text: "—" });
    const readout = el("div", { className: "hash-readout" }, ["hash → ", keyOut]);

    input.addEventListener("input", () => {
      const v = input.value;
      keyOut.textContent = v ? String(this._controller.hashName(v)) : "—";
    });

    const section = this._section("Hash inspector", [
      this._controlGroup([this._field("String", input, true)]),
      readout,
    ]);
    this.element.append(section);
  }

  // -------------------------------------------------------------------------
  // Node-select syncing
  // -------------------------------------------------------------------------

  private _makeNodeSelect(): HTMLSelectElement {
    const sel = el("select", { className: "select" }) as HTMLSelectElement;
    this._nodeSelects.push(sel);
    return sel;
  }

  /** Read the chosen start node id from a select, or null if empty. */
  private _selectedStartId(sel: HTMLSelectElement): number | null {
    if (sel.value === "") return null;
    const id = Number(sel.value);
    return Number.isFinite(id) ? id : null;
  }

  /** Rebuild every node-select's options, preserving the prior choice if it
   * still exists. */
  private _syncNodeSelects(state: DHTState): void {
    const ids = state.nodes.map((n) => n.id).sort((a, b) => a - b);
    for (const sel of this._nodeSelects) {
      const prev = sel.value;
      while (sel.firstChild) sel.removeChild(sel.firstChild);
      for (const node of state.nodes) {
        const opt = el("option", { value: node.id, text: `${node.id} (${node.name})` });
        sel.append(opt);
      }
      // Restore previous selection if still present, else default to the first.
      if (prev !== "" && ids.includes(Number(prev))) {
        sel.value = prev;
      } else if (ids.length > 0) {
        sel.value = String(ids[0]);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Layout helpers
  // -------------------------------------------------------------------------

  private _section(title: string, children: Node[]): HTMLElement {
    return el("div", { className: "section" }, [
      el("div", { className: "section__title", text: title }),
      ...children,
    ]);
  }

  private _controlGroup(children: Node[]): HTMLElement {
    return el("div", { className: "control-group" }, children);
  }

  private _field(label: string, control: HTMLElement, grow = false): HTMLElement {
    return el("label", { className: grow ? "field field--grow" : "field" }, [
      el("span", { className: "field__label", text: label }),
      control,
    ]);
  }
}
