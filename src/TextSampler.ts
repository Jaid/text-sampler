import type {GenerationResult, Seed, Sentence, TextSamplerInput} from './types.ts'

import tinyhand from 'tinyhand'

import {generateSentence} from './generate.ts'
import {normalizeSeed} from './seed.ts'
import {validateSentence} from './validate.ts'

/**
 * Generate text from a reusable sentence, with an optional default seed.
 */
export default class TextSampler {
  readonly seed: Seed | undefined
  readonly sentence: Sentence

  constructor(sentence: Sentence, options?: TextSamplerInput) {
    this.sentence = validateSentence(sentence)
    if (options !== undefined) {
      const {seed} = tinyhand('seed', options)
      normalizeSeed(seed)
      this.seed = seed
    }
  }

  /**
   * Generate text using a call-specific seed, the instance seed, or a fresh seed.
   * A call-specific seed does not change the instance's default.
   */
  generate(seed?: Seed): string {
    return this.trace(seed).text
  }

  /**
   * Run generation and return the text, seed, selections and source provenance.
   * Uses the same seed rules as generate; it does not inspect a previous run.
   */
  trace(seed?: Seed): GenerationResult {
    const selectedSeed = seed === undefined ? this.seed : seed
    return generateSentence(this.sentence, selectedSeed === undefined ? Math.floor(Math.random() * 4_294_967_296) : selectedSeed)
  }
}
