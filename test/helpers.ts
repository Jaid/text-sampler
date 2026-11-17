import type {Seed, Sentence} from '#src/main.ts'

import TextSampler from '#src/main.ts'

export const createSampler = (sentence: Sentence, seed?: Seed): TextSampler => new TextSampler(sentence, seed)

export const must = <Value>(value: Value | undefined): Value => {
  if (value === undefined) {
    throw new Error('Expected a fixture value')
  }
  return value
}
