import type {CustomSample, ListSample, Sample, Sentence} from '#src/main.ts'

import {expect, test} from 'bun:test'

import {generateSentence, textSampler, validateSentence} from '#src/main.ts'
import {parseSource} from '#src/parser.ts'

test('a list sample selects exactly one string and preserves its original indices', () => {
  const sentence = ['The', {joiner: ' '}, ['bright', 'quiet', 'starry'], {joiner: ' '}, 'night'] as const satisfies Sentence
  const seen = new Set<string>
  for (let seed = 0; seed < 40; seed++) {
    const result = generateSentence(sentence, seed)
    const selection = result.selections[0]!
    expect(selection.id).toEqual([2])
    expect(selection.path).toBe('sentence[2]')
    expect(selection.name).toBe('sentence[2]')
    expect(selection.available).toBe(3)
    expect(selection.count).toBe(1)
    expect(selection.items).toHaveLength(1)
    expect(selection.items[0]).toBe(selection.text)
    expect(result.text).toBe(`The ${selection.text} night`)
    const fragment = result.fragments.find(value => value.text === selection.text)!
    expect(fragment.id[0]).toBe(2)
    expect(fragment.id).toHaveLength(2)
    expect(fragment.ancestors).toEqual([{id: [2]}])
    expect(result.fragments.map(piece => piece.text).join('')).toBe(result.text)
    seen.add(selection.text)
  }
  expect(seen).toEqual(new Set(['bright', 'quiet', 'starry']))
})
test('a list is equivalent to a custom sample with only items, for complete results', () => {
  const shorthand = ['A', {joiner: ' '}, ['one', 'two', 'three'], '!'] as const satisfies Sentence
  const custom = ['A', {joiner: ' '}, {items: ['one', 'two', 'three']}, '!'] as const satisfies Sentence
  for (let seed = 0; seed < 200; seed++) {
    expect(generateSentence(shorthand, seed)).toEqual(generateSentence(custom, seed))
  }
})
test('list samples compose inside counted and nested custom samples', () => {
  const nested = {
    name: 'group',
    prefix: '[',
    suffix: ']',
    joiner: '|',
    count: 3,
    items: [
      ['A1', 'A2'],
      'B',
      {
        name: 'deep',
        items: [['C1', 'C2'], 'D'],
        count: 2,
        joiner: '/',
      },
    ],
  } as const satisfies CustomSample
  const expanded = {
    ...nested,
    items: [
      {items: ['A1', 'A2']},
      'B',
      {
        name: 'deep',
        items: [{items: ['C1', 'C2']}, 'D'],
        count: 2,
        joiner: '/',
      },
    ],
  } as const satisfies CustomSample
  for (const seed of [0, 1, 5, 42, 999, 4_294_967_295]) {
    const result = generateSentence([nested], seed)
    expect(result).toEqual(generateSentence([expanded], seed))
    expect(result.text.startsWith('[')).toBe(true)
    expect(result.text.endsWith(']')).toBe(true)
    const nestedItem = result.fragments.find(fragment => fragment.text === 'C1' || fragment.text === 'C2')!
    expect(nestedItem.id).toHaveLength(4)
    expect(nestedItem.id.slice(0, 3)).toEqual([0, 2, 0])
    expect(nestedItem.ancestors).toEqual([
      {
        id: [0],
        name: 'group',
      },
      {
        id: [0, 2],
        name: 'deep',
      },
      {id: [0, 2, 0]},
    ])
  }
})
test('a readonly list sample stays unchanged and can be used as a Sample', () => {
  const list: ListSample = Object.freeze(['oil painting', 'abstract landscape'])
  const sample: Sample = list
  const sentence: Sentence = Object.freeze([{
    token: 'a',
    suffix: ' ',
  }, sample])
  const before = JSON.stringify(sentence)
  for (let seed = 0; seed < 20; seed++) {
    const output = textSampler(sentence, seed)
    expect(['an oil painting', 'an abstract landscape']).toContain(output)
  }
  expect(JSON.stringify(sentence)).toBe(before)
  expect(sentence[1]).toBe(list)
})
test('list sample choices use their positions even when strings repeat', () => {
  const sentence = [['same', 'same']] as const satisfies Sentence
  const ids = new Set<number>
  for (let seed = 0; seed < 50; seed++) {
    const result = generateSentence(sentence, seed)
    expect(result.text).toBe('same')
    ids.add(result.fragments[0]!.id[1]!)
  }
  expect(ids).toEqual(new Set([0, 1]))
})
test('list samples work in editable literal and TypeScript sources', () => {
  const sources = [
    "[['morning', 'evening']]",
    "type Sentence = Segment[]\ntype ListSample = string[]\ntype Sample = CustomSample | ListSample\nconst sentence: Sentence = [['morning', 'evening']] as const satisfies Sentence",
    'const sentence = [["morning", "evening"], {joiner: " "}, ["light", "dark"]]',
  ]
  for (const source of sources) {
    const sentence = parseSource(source)
    expect(Array.isArray(sentence[0])).toBe(true)
    const result = generateSentence(sentence, 42)
    expect(result.selections.length).toBe(source.includes('light') ? 2 : 1)
    expect(result.fragments.map(piece => piece.text).join('')).toBe(result.text)
  }
})
test('indefinite articles look ahead through a selected list item', () => {
  const sentence = [{
    token: 'a',
    suffix: ' ',
  }, ['hour', 'unique painting', 'honest portrait', 'portrait']] as const satisfies Sentence
  for (let seed = 0; seed < 100; seed++) {
    const result = generateSentence(sentence, seed)
    const word = result.selections[0]!.items[0]!
    const article = word === 'unique painting' || word === 'portrait' ? 'a' : 'an'
    expect(result.text).toBe(`${article} ${word}`)
    expect(result.articleResolutions[0]?.article).toBe(article)
  }
})
test('a top-level array is a sentence, while its array entries are list samples', () => {
  expect(textSampler(['A', 'B'], 0)).toBe('AB')
  expect(['A', 'B']).toContain(textSampler([['A', 'B']], 0))
  expect(validateSentence([['A', 'B']])).toEqual([['A', 'B']])
})
test('an empty list sample requires a custom sample with count zero', () => {
  expect(() => validateSentence([[]])).toThrow(/sentence\[0\].*at least one/)
  expect(textSampler([{
    items: [],
    count: 0,
  }], 0)).toBe('')
})
test('list sample validation rejects numbers, nested arrays and semantic objects', () => {
  const invalid = [
    [['A', 9]],
    [[{text: 'A'}]],
    [[['A', 'B']]],
  ]
  for (const sentence of invalid) {
    expect(() => validateSentence(sentence)).toThrow(/sentence\[0\]\[\d+\].*only strings/)
  }
})
test('sparse lists are rejected at the missing item path', () => {
  const list: Array<unknown> = []
  list.length = 3
  list[0] = 'A'
  list[2] = 'C'
  expect(() => validateSentence([list])).toThrow(/sentence\[0\]\[1\].*Sparse/)
})
test('invalid lists are rejected even in unselected branches', () => {
  expect(() => validateSentence([{
    items: [['good', 1]],
    chance: 0,
  }])).toThrow(/sentence\[0\].items\[0\]\[1\]/)
})
test('a list sample cannot accept a custom sample object as its item', () => {
  const custom: CustomSample = {
    items: ['A', 'B'],
    count: 2,
    joiner: ' and ',
  }
  const sentence: Sentence = [custom]
  expect(textSampler(sentence, 0)).toMatch(/^[AB] and [AB]$/)
  expect(() => validateSentence([[custom]])).toThrow(/sentence\[0\]\[0\]/)
})
test('list samples reject custom properties rather than silently ignoring configuration', () => {
  const list: Array<string> & {chance?: number} = ['A', 'B']
  list.chance = 50
  expect(() => validateSentence([list])).toThrow(/sentence\[0\]\.chance.*cannot have configuration/)
})
