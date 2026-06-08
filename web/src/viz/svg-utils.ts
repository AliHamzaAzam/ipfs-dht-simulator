/**
 * svg-utils.ts — Tiny SVG DOM helpers (createElementNS wrappers).
 * No logic, no state — just convenience.
 */

const NS = "http://www.w3.org/2000/svg";

export function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {}
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(NS, tag) as SVGElementTagNameMap[K];
  for (const [k, v] of Object.entries(attrs)) {
    el.setAttribute(k, String(v));
  }
  return el;
}

export function setAttrs(
  el: SVGElement,
  attrs: Record<string, string | number>
): void {
  for (const [k, v] of Object.entries(attrs)) {
    el.setAttribute(k, String(v));
  }
}

/** Remove all children of an SVG element. */
export function clearChildren(el: SVGElement): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}
