import type {GenerationResult, IndefiniteArticle, InnerJoiner, JoinSegment, OuterJoiner, Sample, Segment, Sentence, TextSegment} from '#src/main.ts'

import {expect, test} from 'bun:test'

import textSampler, {generateSentence, textSampler as namedTextSampler, SentenceValidationError, validateSentence} from '#src/main.ts'

import {goldenCases, goldenSentence} from './fixtures/golden.ts'
import {must} from './helpers.ts'

const freezeDeep = <Value>(value: Value): Value => {
  if (value !== null && typeof value === 'object') {
    Object.freeze(value)
    for (const child of Object.values(value)) {
      freezeDeep(child)
    }
  }
  return value
}
test('the default API returns text and named generation retains provenance', () => {
  const sentence: Sentence = ['Make ', {
    token: 'a',
    suffix: ' ',
  }, {
    name: 'subject',
    text: 'hourglass',
  }]
  const text: string = textSampler(sentence, 42)
  const result: GenerationResult = generateSentence(sentence, 42)
  expect(text).toBe('Make an hourglass')
  expect(namedTextSampler(sentence, 42)).toBe(text)
  expect(result.text).toBe(text)
  expect(result.fragments.map(fragment => fragment.text).join('')).toBe(text)
  expect(result.fragments.find(fragment => fragment.name === 'subject')?.id).toEqual([2])
})
test('public input types accept independently declared readonly arrays', () => {
  const choices: ReadonlyArray<Segment> = Object.freeze([{
    text: 'hour',
    an: undefined,
  }])
  const prefix: OuterJoiner = {
    text: ' ',
    merge: undefined,
  }
  const joiner: InnerJoiner = {
    between: ', ',
    first: undefined,
    last: undefined,
  }
  const sample: Sample = {
    items: choices,
    prefix,
    joiner,
    count: undefined,
    chance: undefined,
  }
  const readonlySentence: ReadonlyArray<Segment> = Object.freeze([{
    token: 'a',
    suffix: ' ',
  } as const, sample])
  const sentence: Sentence = readonlySentence
  expect(textSampler(sentence, 0)).toBe('an hour')
})
test('standalone semantic types include their shared configuration', () => {
  const opening: TextSegment = {
    name: 'opening',
    text: 'Make',
    suffix: ' ',
    chance: 100,
  }
  const article: IndefiniteArticle = {
    name: 'article',
    token: 'a',
    prefix: ' ',
    suffix: ' ',
    chance: 100,
  }
  const gap: JoinSegment = {
    name: 'gap',
    joiner: ' ',
    chance: 100,
  }
  const subject: Sample = {
    name: 'subject',
    items: ['hourglass'],
    prefix: ' ',
    suffix: '.',
    chance: 100,
  }
  expect(textSampler([opening, article, gap, subject], 0)).toBe('Make an hourglass.')
})
test('validation returns the original input without normalizing its properties', () => {
  const sentence = [{
    text: 'kept',
    name: undefined,
    prefix: undefined,
    chance: undefined,
  }]
  expect(validateSentence(sentence)).toBe(sentence)
  for (const key of ['name', 'prefix', 'chance']) {
    expect(Object.hasOwn(must(sentence[0]), key)).toBe(true)
  }
})
test('optional undefined values behave exactly like omitted values', () => {
  const omitted = [{
    token: 'a',
    suffix: ' ',
  }, {
    items: [{text: 'hour'}],
    prefix: {text: ' '},
  }, {joiner: ' / '}, {
    items: ['A', 'B'],
    count: 2,
    joiner: {between: '|'},
  }] as const satisfies Sentence
  const explicit = [
    {
      token: 'a',
      name: undefined,
      chance: undefined,
      prefix: undefined,
      suffix: ' ',
    },
    {
      name: undefined,
      chance: undefined,
      count: undefined,
      joiner: undefined,
      prefix: {
        text: ' ',
        merge: undefined,
      },
      suffix: undefined,
      items: [{
        text: 'hour',
        an: undefined,
        name: undefined,
        chance: undefined,
        prefix: undefined,
        suffix: undefined,
      }],
    },
    {
      joiner: ' / ',
      name: undefined,
      chance: undefined,
      prefix: undefined,
      suffix: undefined,
    },
    {
      items: ['A', 'B'],
      count: 2,
      joiner: {
        between: '|',
        first: undefined,
        last: undefined,
      },
    },
  ] as const satisfies Sentence
  for (const seed of [0, 42, 123]) {
    expect(generateSentence(explicit, seed)).toEqual(generateSentence(omitted, seed))
  }
  expect(validateSentence(explicit)).toBe(explicit)
})
test('null remains invalid for optional properties', () => {
  for (const key of ['name', 'chance', 'prefix', 'suffix', 'an']) {
    expect(() => validateSentence([{
      text: 'A',
      [key]: null,
    }])).toThrow(SentenceValidationError)
  }
  for (const key of ['count', 'joiner']) {
    expect(() => validateSentence([{
      items: ['A'],
      [key]: null,
    }])).toThrow(SentenceValidationError)
  }
  expect(() => validateSentence([{
    text: 'A',
    suffix: {
      text: ' ',
      merge: null,
    },
  }])).toThrow(SentenceValidationError)
  for (const key of ['first', 'last']) {
    expect(() => validateSentence([{
      items: ['A'],
      joiner: {
        between: ', ',
        [key]: null,
      },
    }])).toThrow(SentenceValidationError)
  }
})
test('sparse arrays are rejected at their missing segment path', () => {
  const sentence: Array<unknown> = []
  sentence.length = 2
  sentence[1] = 'A'
  const items: Array<unknown> = []
  items.length = 2
  items[1] = 'A'
  for (const [value, path] of [[sentence, 'sentence[0]'], [[{
    items,
    count: 0,
  }], 'sentence[0].items[0]']] as const) {
    let caught: unknown
    try {
      validateSentence(value)
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(SentenceValidationError)
    if (!(caught instanceof SentenceValidationError)) {
      throw new Error('Expected a validation error')
    }
    expect(caught.path).toBe(path)
  }
  expect(() => validateSentence([undefined])).toThrow(SentenceValidationError)
  expect(() => validateSentence([{
    items: [undefined],
    count: 0,
  }])).toThrow(SentenceValidationError)
})
test('validation errors identify the invalid data path and remain TypeErrors', () => {
  let caught: unknown
  try {
    validateSentence([{items: [{
      text: 'A',
      chance: 101,
    }]}])
  } catch (error) {
    caught = error
  }
  expect(caught).toBeInstanceOf(TypeError)
  if (!(caught instanceof SentenceValidationError)) {
    throw new Error('Expected a validation error')
  }
  expect(caught.path).toBe('sentence[0].items[0].chance')
})
test('seed validation rejects values outside the unsigned 32-bit integer range', () => {
  for (const seed of [-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, 4_294_967_296]) {
    expect(() => textSampler(['A'], seed)).toThrow(RangeError)
    expect(() => generateSentence(['A'], seed)).toThrow(RangeError)
  }
  expect(textSampler(['A'], 0)).toBe('A')
  expect(textSampler(['A'], 4_294_967_295)).toBe('A')
})
test('deep-frozen shared inputs remain unchanged through validation and generation', () => {
  const shared = {
    name: 'shared',
    text: 'hour',
    suffix: ' ',
  } as const
  const sentence = freezeDeep([
    {
      name: 'article',
      token: 'a',
      suffix: ' ',
    },
    {
      name: 'outer',
      items: [shared, shared],
      count: 2,
      joiner: {between: 'and '},
    },
    {
      name: 'gap',
      joiner: ' ',
    },
    {
      name: 'optional',
      chance: 0,
      items: ['hidden'],
    },
    {
      name: 'end',
      text: 'ends',
      prefix: {
        text: ' ',
        merge: true,
      },
    },
  ] as const satisfies Sentence)
  const before = structuredClone(sentence)
  expect(validateSentence(sentence)).toBe(sentence)
  const first = generateSentence(sentence, 123)
  expect(first.text).toBe('an hour and hour ends')
  expect(textSampler(sentence, 123)).toBe(first.text)
  expect(generateSentence(sentence, 123)).toEqual(first)
  expect(sentence).toEqual(before)
  expect(sentence[1].items[0]).toBe(sentence[1].items[1])
})
test('recursive cycles are rejected while repeated references are valid', () => {
  const cyclic: {items: Array<unknown>} = {items: []}
  cyclic.items.push(cyclic)
  expect(() => validateSentence([cyclic])).toThrow(/circular|cycle/i)
  const shared = {text: 'A'}
  expect(validateSentence([shared, shared])).toEqual([shared, shared])
})
test('inherited discriminators cannot change the validated semantic kind', () => {
  for (const [key, value] of [['items', ['inherited']], ['token', 'a'], ['text', 'inherited'], ['joiner', ' ']] as const) {
    const own = key === 'text' ? {items: ['actual']} : {text: 'actual'}
    const segment: unknown = Object.assign(Object.create({[key]: value}), own)
    expect(() => validateSentence([segment])).toThrow(SentenceValidationError)
  }
})
test('the extracted package preserves the established seeded fixture', () => {
  for (const fixture of goldenCases) {
    const result = generateSentence(goldenSentence, fixture.seed)
    expect(textSampler(goldenSentence, fixture.seed)).toBe(fixture.text)
    expect(result.text).toBe(fixture.text)
    const style = result.selections.find(selection => selection.name === 'style')
    expect(style?.items).toEqual(fixture.style)
    expect(style?.skipReason === 'chance').toBe(fixture.skipped)
  }
})
