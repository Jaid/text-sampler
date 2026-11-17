import type {Seed} from './types.ts'

/**
 * Normalize a seed to the generator's unsigned 32-bit state.
 * String seeds use FNV-1a over UTF-16 code units, without trimming or coercion.
 */
export function normalizeSeed(seed: Seed): number {
  if (typeof seed === 'number') {
    if (!Number.isInteger(seed) || seed < 0 || seed > 4_294_967_295) {
      throw new RangeError('Numeric seeds must be integers from 0 to 4294967295.')
    }
    return seed
  }
  if (typeof seed !== 'string') {
    throw new TypeError('Seed must be a number or a string.')
  }
  let hash = 2_166_136_261
  for (let index = 0; index < seed.length; index++) {
    // eslint-disable-next-line unicorn/prefer-code-point -- Seed hashing is defined over UTF-16 code units, including isolated surrogates.
    hash = Math.imul(hash ^ seed.charCodeAt(index), 16_777_619)
  }
  return hash >>> 0
}
