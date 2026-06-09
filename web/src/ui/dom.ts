/**
 * ui/dom.ts — Tiny typed DOM helpers shared by the UI panels.
 *
 * DOM is only permitted in `ui/`, `viz/`, and `main.ts` (see project rules),
 * so these helpers live here rather than in `src/`.
 */

type Attrs = Record<string, string | number | boolean>;

/**
 * Create an element, apply attributes/className/text, and append children.
 * `className` and `text` are convenience keys on the attrs object.
 */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  children: (Node | string)[] = []
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "className") {
      node.className = String(v);
    } else if (k === "text") {
      node.textContent = String(v);
    } else {
      node.setAttribute(k, String(v));
    }
  }
  for (const child of children) {
    node.append(child);
  }
  return node;
}

/** Remove all children of a node. */
export function clear(node: Node): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}
