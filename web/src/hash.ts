/**
 * Polynomial rolling hash that exactly matches HashFunction::hash() in the
 * C++ reference for the bits ≤ 64 branch (our entire supported range).
 *
 * Formula (from HashFunction.cpp):
 *   modValue = 1 << bits          (2^bits)
 *   h = 0
 *   for each char c:
 *     h = ((h * 31) % modValue + (unsigned char)c) % modValue
 *
 * Valid range: bits in [1, 30].  For bits > 30 the intermediate product
 * h*31 can exceed Number.MAX_SAFE_INTEGER (2^53-1); the visualizer only
 * needs up to ~20-bit spaces, so this is not a concern in practice.
 * For larger spaces a BigInt variant would be needed.
 */
export function hash(input: string, bits: number): number {
  const modValue = 1 << bits; // 2^bits
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i) & 0xff; // unsigned char
    h = ((h * 31) % modValue + c) % modValue;
  }
  return h;
}
