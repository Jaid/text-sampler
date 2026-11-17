import type {Sentence} from 'text-sampler'

import textSampler, {generateSentence} from 'text-sampler'

const sentence = [
  'Please make ',
  {
    token: 'a',
    suffix: ' ',
  },
  {
    name: 'qualities',
    items: ['elegant', 'detailed', 'luminous'],
    count: {
      min: 0,
      max: 2,
    },
    joiner: ' ',
    suffix: ' ',
  },
  {
    name: 'medium',
    items: ['oil painting', 'artwork'],
  },
] as const satisfies Sentence
const seed = 42
const text = textSampler(sentence, seed)
const result = generateSentence(sentence, seed)
console.log(text)
console.log(result.fragments)
