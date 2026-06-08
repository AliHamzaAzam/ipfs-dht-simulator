/**
 * Tests for hash.ts — cross-checked against the C++ reference binary.
 *
 * Reference values obtained by running:
 *   INIT 5 4 → HASH <str>   (4-bit space, modValue=16)
 *   INIT 5 8 → HASH <str>   (8-bit space, modValue=256)
 */
import { describe, it, expect } from "vitest";
import { hash } from "../src/hash.js";

describe("hash()", () => {
  // 4-bit space (modValue = 16)
  // C++ output: "hello"→2, "world"→2, "test"→2  (all collide at 2 in 4-bit space)
  it("4-bit: 'hello' → 2", () => {
    expect(hash("hello", 4)).toBe(2);
  });
  it("4-bit: 'world' → 2", () => {
    expect(hash("world", 4)).toBe(2);
  });
  it("4-bit: 'test' → 2", () => {
    expect(hash("test", 4)).toBe(2);
  });

  // 8-bit space (modValue = 256)
  // C++ output: "hello"→210, "world"→146, "test"→146, "Machine_0"→24, "abc"→98
  it("8-bit: 'hello' → 210", () => {
    expect(hash("hello", 8)).toBe(210);
  });
  it("8-bit: 'world' → 146", () => {
    expect(hash("world", 8)).toBe(146);
  });
  it("8-bit: 'test' → 146", () => {
    expect(hash("test", 8)).toBe(146);
  });
  it("8-bit: 'Machine_0' → 24", () => {
    expect(hash("Machine_0", 8)).toBe(24);
  });
  it("8-bit: 'abc' → 98", () => {
    expect(hash("abc", 8)).toBe(98);
  });

  // Empty string: h stays 0
  it("empty string → 0", () => {
    expect(hash("", 8)).toBe(0);
  });

  // Single char 'A' (65): h = ((0*31)%256 + 65)%256 = 65
  it("8-bit: 'A' → 65", () => {
    expect(hash("A", 8)).toBe(65);
  });

  // Verify modular reduction — result must always be in [0, 2^bits)
  it("result is within [0, 2^bits)", () => {
    for (const bits of [4, 8, 12, 16]) {
      const limit = 1 << bits;
      for (const s of ["hello", "world", "foo", "bar", "baz"]) {
        const v = hash(s, bits);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(limit);
      }
    }
  });
});
