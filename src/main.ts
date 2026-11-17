import type {Sentence} from './types.ts'

import {generateSentence} from './generate.ts'

/**
 * Generate exact text from a sentence and an unsigned 32-bit seed.
 */
export function textSampler(sentence: Sentence, seed: number): string {
  return generateSentence(sentence, seed).text
}

export default textSampler

export {generateSentence} from './generate.ts'
export type * from './types.ts'

export {SentenceValidationError, validateSentence} from './validate.ts'
