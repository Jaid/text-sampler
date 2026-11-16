export const MAX_DEPTH = 64
export const MAX_SEGMENTS = 10_000

/** Mulberry32, with a fixed stream shared by chance and sampling decisions. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    // eslint-disable-next-line unicorn/prefer-math-trunc -- Mulberry32 requires signed 32-bit wraparound, not truncation.
    state = state + 0x6D_2B_79_F5 | 0
    let value = Math.imul(state ^ state >>> 15, 1 | state)
    value ^= value + Math.imul(value ^ value >>> 7, 61 | value)
    return ((value ^ value >>> 14) >>> 0) / 4_294_967_296
  }
}
