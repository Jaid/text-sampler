import type {Sentence} from '../src/main.ts'

const sentence = [
  'Create',
  {joiner: ' '},
  {token: 'a'},
  {joiner: ' '},
  [null, 'elegant'],
  {joiner: ' '},
  ['painting', 'portrait', 'artwork'],
] as const satisfies Sentence

export default sentence
