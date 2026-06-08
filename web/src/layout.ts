/**
 * layout.ts — Pure ring geometry (no DOM, no rendering).
 *
 * Maps DHT identifiers and arbitrary fractions to (x, y) Cartesian coordinates
 * on the ring circle.  Convention: id 0 sits at 12 o'clock, identifiers
 * advance clockwise.
 *
 * Angle formula:
 *   theta(id) = -π/2 + 2π * (id / 2^bits)
 *
 * This places id 0 at the top (cos(−π/2) = 0, sin(−π/2) = −1 → up in screen
 * space where y increases downward, but the formula is correct for SVG/canvas
 * where y=0 is the top):
 *   x = cx + radius * cos(theta)
 *   y = cy + radius * sin(theta)
 */

export interface Point {
  x: number;
  y: number;
}

export interface RingGeometry {
  cx: number;
  cy: number;
  radius: number;
  bits: number;
}

/**
 * Position of an identifier on the ring circle.
 * id 0 is at the top (12 o'clock); identifiers advance clockwise.
 *
 * @param id    DHT identifier in [0, 2^bits)
 * @param geo   Ring geometry (centre, radius, bit-width)
 */
export function idToPoint(id: number, geo: RingGeometry): Point {
  const modValue = Math.pow(2, geo.bits);
  const fraction = id / modValue;
  return fractionToPoint(fraction, geo);
}

/**
 * Position of an arbitrary angle fraction t in [0, 1) on the ring circle.
 * t = 0 maps to 12 o'clock; t increases clockwise.
 *
 * @param t     Normalised position in [0, 1) around the ring
 * @param geo   Ring geometry
 */
export function fractionToPoint(t: number, geo: RingGeometry): Point {
  // Start at −90° (top) and advance clockwise (positive angle in standard math)
  const angle = -Math.PI / 2 + 2 * Math.PI * t;
  return {
    x: geo.cx + geo.radius * Math.cos(angle),
    y: geo.cy + geo.radius * Math.sin(angle),
  };
}
