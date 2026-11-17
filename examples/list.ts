import type {Sentence} from '../src/main.ts'

const sentence = [
  'Create ',
  {
    token: 'a',
    suffix: ' ',
  },
  ['oil painting', 'abstract portrait', 'abstract landscape'],
] as const satisfies Sentence

export default sentence
