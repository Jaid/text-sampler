import type {Seed, Sentence, TextSamplerInput, TextSamplerOptions} from '#src/main.ts'

import {expect, spyOn, test} from 'bun:test'

import TextSampler, {SentenceValidationError} from '#src/main.ts'
import * as publicApi from '#src/main.ts'

import {goldenSentence} from './fixtures/golden.ts'

const sentence = [
  'The ',
  ['sky', 'dog', 'cat'],
  ' is ',
  ['blue', 'green', 'red'],
  '.',
] as const satisfies Sentence
test('the minimal example constructs a reusable TextSampler without options', () => {
  const sampler = new TextSampler(sentence)
  expect(sampler.generate()).toMatch(/^The (cat|dog|sky) is (blue|green|red)\.$/)
  expect(sampler.seed).toBeUndefined()
  expect(sampler.sentence).toBe(sentence)
})
test('constructor seed shorthands and options objects produce identical traces', () => {
  for (const seed of [0, 1, 42, 4_294_967_295, '', 'gallery', '🎨 漢字', '42']) {
    const options: TextSamplerOptions = {seed}
    const input: TextSamplerInput = seed
    const shorthand = new TextSampler(goldenSentence, input)
    const expanded = new TextSampler(goldenSentence, options)
    expect(shorthand.trace()).toEqual(expanded.trace())
    expect(shorthand.generate()).toBe(expanded.generate())
    expect(shorthand.seed).toBe(seed)
    expect(shorthand.trace().seed).toBe(seed)
  }
})
test('each seeded run restarts the random stream instead of advancing the instance', () => {
  const sampler = new TextSampler(goldenSentence, 'gallery')
  const expected = sampler.trace()
  for (let index = 0; index < 10; index++) {
    expect(sampler.generate()).toBe(expected.text)
    expect(sampler.trace()).toEqual(expected)
  }
})
test('generate and trace share one generation algorithm for every seed form', () => {
  const sampler = new TextSampler(goldenSentence, 'default')
  for (const seed of [0, 42, '', 'override', '🎨', 4_294_967_295]) {
    const result = sampler.trace(seed)
    expect(sampler.generate(seed)).toBe(result.text)
    expect(result.fragments.map(fragment => fragment.text).join('')).toBe(result.text)
    expect(result.seed).toBe(seed)
  }
})
test('per-call overrides never change the instance default', () => {
  const sampler = new TextSampler(goldenSentence, {seed: 'default'})
  const original = sampler.trace()
  for (const seed of [0, '', 12, 'override']) {
    const independentlySeeded = new TextSampler(goldenSentence, seed)
    expect(sampler.generate(seed)).toBe(independentlySeeded.generate())
    expect(sampler.trace(seed)).toEqual(independentlySeeded.trace())
    expect(sampler.seed).toBe('default')
    expect(sampler.trace()).toEqual(original)
  }
})
test('undefined method arguments use the default, including zero and empty-string defaults', () => {
  for (const seed of [0, '']) {
    const sampler = new TextSampler(goldenSentence, seed)
    expect(sampler.generate(undefined)).toBe(sampler.generate())
    expect(sampler.trace(undefined)).toEqual(sampler.trace())
    expect(sampler.trace(undefined).seed).toBe(seed)
  }
})
test('unseeded runs draw a fresh seed once per call and can be replayed', () => {
  const random = spyOn(Math, 'random').mockReturnValueOnce(0).mockReturnValueOnce(0.5).mockReturnValueOnce(0.25)
  try {
    const sampler = new TextSampler(goldenSentence)
    expect(random).not.toHaveBeenCalled()
    const first = sampler.trace()
    const second = sampler.trace()
    expect(first.seed).toBe(0)
    expect(second.seed).toBe(2_147_483_648)
    expect(random).toHaveBeenCalledTimes(2)
    expect(sampler.trace(first.seed)).toEqual(first)
    expect(sampler.generate(second.seed)).toBe(second.text)
    expect(random).toHaveBeenCalledTimes(2)
    const expected = new TextSampler(goldenSentence, 1_073_741_824)
    expect(sampler.generate()).toBe(expected.generate())
    expect(random).toHaveBeenCalledTimes(3)
    expect(sampler.seed).toBeUndefined()
  } finally {
    random.mockRestore()
  }
})
test('trace is a new run, not the last generated result', () => {
  const random = spyOn(Math, 'random').mockReturnValueOnce(0).mockReturnValueOnce(0.5)
  try {
    const sampler = new TextSampler(goldenSentence)
    sampler.generate()
    const result = sampler.trace()
    expect(result.seed).toBe(2_147_483_648)
    expect(random).toHaveBeenCalledTimes(2)
  } finally {
    random.mockRestore()
  }
})
test('seeded construction and seeded runs never call Math.random', () => {
  const random = spyOn(Math, 'random').mockImplementation(() => {
    throw new Error('Unexpected ambient randomness')
  })
  try {
    for (const seed of [0, 42, '', 'gallery']) {
      const sampler = new TextSampler(goldenSentence, seed)
      const result = sampler.trace()
      expect(sampler.generate()).toBe(result.text)
      expect(sampler.generate('override')).toBe(sampler.trace('override').text)
    }
    const unseeded = new TextSampler(goldenSentence)
    expect(unseeded.generate(0)).toBe(unseeded.trace(0).text)
    expect(random).not.toHaveBeenCalled()
  } finally {
    random.mockRestore()
  }
})
test('constructor options are read once and are never mutated', () => {
  const options = {seed: 'original'}
  const sampler = new TextSampler(goldenSentence, options)
  const original = sampler.trace()
  options.seed = 'edited'
  expect(sampler.seed).toBe('original')
  expect(sampler.trace()).toEqual(original)
  sampler.generate('temporary')
  expect(options).toEqual({seed: 'edited'})
  const frozen = new TextSampler(goldenSentence, Object.freeze({seed: 'original'}))
  expect(frozen.trace()).toEqual(original)
})
test('trace results are fresh objects and mutating one cannot affect subsequent runs', () => {
  const sampler = new TextSampler(goldenSentence, 42)
  const first = sampler.trace()
  const expected = structuredClone(first)
  const second = sampler.trace()
  expect(first).not.toBe(second)
  expect(first.fragments).not.toBe(second.fragments)
  expect(first.selections).not.toBe(second.selections)
  Object.assign(first, {text: 'mutated'})
  Object.assign(first.fragments[0]!, {text: 'changed'})
  expect(sampler.trace()).toEqual(expected)
  expect(sampler.generate()).toBe(expected.text)
})
test('instances do not share random state', () => {
  const first = new TextSampler(goldenSentence, 'shared')
  const second = new TextSampler(goldenSentence, {seed: 'shared'})
  const original = first.trace()
  second.generate('different')
  first.trace(0)
  expect(first.trace()).toEqual(original)
  expect(second.trace()).toEqual(original)
})
test('strings are case-sensitive exact seeds rather than coerced numbers', () => {
  const choices = Array.from({length: 32}, (_, index) => String(index))
  const sampler = new TextSampler([{
    items: choices,
    count: 8,
  }])
  const seeds = [42, '42', '', ' ', 'gallery', 'Gallery', 'é', 'e\u{301}', '🎨'] as const
  const outputs = new Set(seeds.map(seed => sampler.generate(seed)))
  expect(outputs.size).toBe(seeds.length)
  for (const seed of seeds) {
    const independent = new TextSampler(sampler.sentence, seed)
    expect(independent.trace()).toEqual(sampler.trace(seed))
  }
})
test('invalid numeric seeds fail at construction and on both methods', () => {
  const sampler = new TextSampler(sentence, 42)
  const original = sampler.trace()
  for (const seed of [-1, 0.5, NaN, Infinity, -Infinity, 4_294_967_296]) {
    expect(() => new TextSampler(sentence, seed)).toThrow(RangeError)
    expect(() => new TextSampler(sentence, {seed})).toThrow(RangeError)
    expect(() => sampler.generate(seed)).toThrow(RangeError)
    expect(() => sampler.trace(seed)).toThrow(RangeError)
    expect(sampler.trace()).toEqual(original)
  }
})
test('invalid constructor configuration and non-seed overrides fail without fallback', () => {
  const sampler = new TextSampler(sentence, 42)
  for (const invalid of [null, false, [], {}, {seed: undefined}, {seed: null}, {seed: {}}, {seed: true}]) {
    expect(() => {
      // @ts-expect-error TS2345 Invalid JavaScript caller input is deliberately tested.
      new TextSampler(sentence, invalid)
    }).toThrow(TypeError)
  }
  for (const invalid of [null, false, [], {seed: 0}]) {
    expect(() => {
      // @ts-expect-error TS2345 Method overrides accept seeds, not options objects.
      sampler.generate(invalid)
    }).toThrow(TypeError)
    expect(() => {
      // @ts-expect-error TS2345 Method overrides accept seeds, not options objects.
      sampler.trace(invalid)
    }).toThrow(TypeError)
  }
  expect(sampler.seed).toBe(42)
})
test('sentence validation runs at construction and detects invalid edits before generation', () => {
  const mutable: Array<Sentence[number]> = ['valid']
  const sampler = new TextSampler(mutable, 0)
  expect(sampler.generate()).toBe('valid')
  mutable[0] = {
    text: 'invalid',
    chance: 101,
  }
  expect(() => sampler.generate()).toThrow(SentenceValidationError)
  expect(() => sampler.trace()).toThrow(SentenceValidationError)
  expect(() => new TextSampler(mutable)).toThrow(SentenceValidationError)
})
test('all-null and empty sentences remain traceable with string seeds', () => {
  for (const source of [[], [null], [[null]], [{
    items: [null, null],
    count: 2,
  }]] as const) {
    const sampler = new TextSampler(source, '')
    expect(sampler.generate()).toBe('')
    expect(sampler.trace().seed).toBe('')
    expect(sampler.trace().fragments).toEqual([])
  }
})
test('the public module exports the class rather than the former function API', () => {
  expect(publicApi.default).toBe(TextSampler)
  expect(Object.hasOwn(publicApi, 'textSampler')).toBe(false)
  expect(Object.hasOwn(publicApi, 'generateSentence')).toBe(false)
})
test('string seeds have a stable UTF-16 mapping, including empty strings and surrogates', () => {
  const sampler = new TextSampler(goldenSentence)
  const cases = [
    ['', 2_166_136_261],
    ['hello', 1_335_831_723],
    ['gallery', 2_060_279_869],
    ['42', 2_279_835_011],
    ['🎨', 1_227_783_593],
    ['漢字', 1_026_738_934],
    ['\u{D800}', 75_617_567],
  ] as const
  for (const [seed, numericState] of cases) {
    expect(sampler.trace(seed)).toEqual({
      ...sampler.trace(numericState),
      seed,
    })
  }
})
