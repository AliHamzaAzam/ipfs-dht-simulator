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
 * Valid range: bits in [1, 30].  The binding constraint is `1 << bits`: JS
 * bitwise operators use a 32-bit SIGNED int, so `1 << 31` is negative and would
 * corrupt modValue. (The product h*31 stays under Number.MAX_SAFE_INTEGER up to
 * ~bit 48, so the shift is the real limit.) The visualizer uses only 3–8-bit
 * spaces; larger spaces would need 2**bits plus a BigInt hash body.
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
