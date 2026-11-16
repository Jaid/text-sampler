import type {Sentence} from '#src/main.ts'

// Captured from the reviewed playground before extracting the package.
export const goldenSentence = [
  {
    text: 'Paint',
    suffix: ' ',
  },
  {
    token: 'a',
    prefix: ' ',
    suffix: ' ',
  },
  {
    name: 'style',
    chance: 50,
    items: ['elegant', 'bold', 'unique'],
    count: {
      min: 0,
      max: 2,
    },
    joiner: ' ',
    prefix: ' ',
    suffix: ' ',
  },
  {joiner: ' '},
  {
    name: 'subject',
    items: ['portrait', 'abstract landscape', 'oil painting'],
    prefix: ' ',
  },
  '.',
] as const satisfies Sentence

export const goldenCases = [
  {
    seed: 0,
    text: 'Paint a portrait.',
    style: [],
    skipped: false,
  },
  {
    seed: 1,
    text: 'Paint a portrait.',
    style: [],
    skipped: true,
  },
  {
    seed: 8,
    text: 'Paint an elegant oil painting.',
    style: ['elegant'],
    skipped: false,
  },
  {
    seed: 9,
    text: 'Paint an elegant unique oil painting.',
    style: ['elegant', 'unique'],
    skipped: false,
  },
  {
    seed: 42,
    text: 'Paint an abstract landscape.',
    style: [],
    skipped: true,
  },
  {
    seed: 4_294_967_295,
    text: 'Paint a portrait.',
    style: [],
    skipped: true,
  },
] as const
