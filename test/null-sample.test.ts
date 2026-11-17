import type {CustomSample, ListSample, Sentence} from '#src/main.ts'

import {expect, test} from 'bun:test'

import {validateSentence} from '#src/main.ts'
import {parseSource} from '#src/parser.ts'

import {createSampler} from './helpers.ts'

test('a null list item is an empty choice with its own sampling weight', () => {
  const list: ListSample = [null, 'hello']
  const sentence = [list] as const satisfies Sentence
  let emptyCount = 0
  let helloCount = 0
  for (let seed = 0; seed < 1000; seed++) {
    const result = createSampler(sentence, seed).trace()
    expect(result).toEqual(createSampler(sentence, seed).trace())
    const selection = result.selections[0]!
    expect(selection.available).toBe(2)
    expect(selection.count).toBe(1)
    expect(selection.items).toEqual([result.text])
    if (result.text === '') {
      emptyCount++
      expect(result.fragments).toEqual([])
      expect(selection.items).toEqual([''])
    } else {
      helloCount++
      expect(result.text).toBe('hello')
      expect(result.fragments[0]?.id).toEqual([0, 1])
    }
  }
  expect(emptyCount).toBeGreaterThan(400)
  expect(helloCount).toBeGreaterThan(400)
  expect(emptyCount + helloCount).toBe(1000)
})
test('null is the same empty item in custom and list samples', () => {
  const shorthand = [[null, 'hello']] as const satisfies Sentence
  const custom = [{items: [null, 'hello']}] as const satisfies Sentence
  for (let seed = 0; seed < 300; seed++) {
    expect(createSampler(shorthand, seed).trace()).toEqual(createSampler(custom, seed).trace())
  }
})
test('a selected null does not emit enclosing prefixes or suffixes', () => {
  const sentence = [
    'Please',
    {joiner: ' '},
    {
      name: 'optional',
      items: [null, 'change'],
      prefix: '(',
      suffix: ')',
    },
    {joiner: ' '},
    'now',
  ] as const satisfies Sentence
  const output = new Set<string>
  for (let seed = 0; seed < 200; seed++) {
    const result = createSampler(sentence, seed).trace()
    output.add(result.text)
    expect(['Please now', 'Please (change) now']).toContain(result.text)
    expect(result.fragments.map(fragment => fragment.text).join('')).toBe(result.text)
  }
  expect(output).toEqual(new Set(['Please now', 'Please (change) now']))
})
test('null choices do not leave inner separators', () => {
  const sentence = [{
    name: 'palette',
    items: [null, 'red', 'blue'],
    count: 3,
    joiner: '/',
    prefix: '[',
    suffix: ']',
  }] as const satisfies Sentence
  for (let seed = 0; seed < 50; seed++) {
    const result = createSampler(sentence, seed).trace()
    expect(['[red/blue]', '[blue/red]']).toContain(result.text)
    expect(result.selections[0]?.count).toBe(3)
    expect(result.selections[0]?.items).toContain('')
    expect(result.fragments.map(fragment => fragment.text).join('')).toBe(result.text)
  }
})
test('articles look ahead past null and collapsed fallback joiners', () => {
  const sentence = [
    {token: 'a'},
    {joiner: ' '},
    [null, 'elegant'],
    {joiner: ' '},
    'painting',
  ] as const satisfies Sentence
  const outputs = new Set<string>
  for (let seed = 0; seed < 200; seed++) {
    const result = createSampler(sentence, seed).trace()
    outputs.add(result.text)
    expect(['a painting', 'an elegant painting']).toContain(result.text)
  }
  expect(outputs).toEqual(new Set(['a painting', 'an elegant painting']))
})
test('null can be chosen in nested samples without changing original source indices', () => {
  const sentence = [{
    name: 'outer',
    items: [[null, 'hello']],
    prefix: '[',
    suffix: ']',
  }] as const satisfies Sentence
  const seen = new Set<string>
  for (let seed = 0; seed < 200; seed++) {
    const result = createSampler(sentence, seed).trace()
    seen.add(result.text)
    expect(result.selections).toHaveLength(2)
    if (result.text) {
      expect(result.text).toBe('[hello]')
      expect(result.fragments.find(fragment => fragment.text === 'hello')?.id).toEqual([0, 0, 1])
    } else {
      expect(result.fragments).toHaveLength(0)
      expect(result.selections[1]?.items).toEqual([''])
    }
  }
  expect(seen).toEqual(new Set(['', '[hello]']))
})
test('repeated null positions have independent probability weight', () => {
  const sentence = [[null, null, 'hello']] as const satisfies Sentence
  let helloCount = 0
  for (let seed = 0; seed < 900; seed++) {
    if (createSampler(sentence, seed).generate() === 'hello') {
      helloCount++
    }
  }
  expect(helloCount).toBeGreaterThan(200)
  expect(helloCount).toBeLessThan(400)
})
test('null is allowed as a direct empty segment, but not as a sample configuration value', () => {
  const sentence = ['before', null, 'after'] as const satisfies Sentence
  expect(createSampler(sentence, 0).generate()).toBe('beforeafter')
  expect(validateSentence(sentence)).toBe(sentence)
  const sample: CustomSample = {items: [null, 'hi']}
  expect(validateSentence([sample])).toEqual([sample])
  expect(() => validateSentence([{
    items: ['A'],
    count: null,
  }])).toThrow(/count/)
  expect(() => validateSentence([{
    text: 'A',
    chance: null,
  }])).toThrow(/chance/)
})
test('the source parser accepts null choices and leaves them in their original positions', () => {
  for (const source of [
    "[[null, 'hello']]",
    "const sentence = [{items: [null, 'hello'], count: 1}]",
    "type Sentence = Segment[]\nconst sentence: Sentence = [[null, 'hello']] as const satisfies Sentence",
  ]) {
    const sentence = parseSource(source)
    const sample = sentence[0]
    let firstItem: unknown
    if (Array.isArray(sample)) {
      firstItem = sample[0]
    } else if (sample !== null && typeof sample === 'object' && 'items' in sample) {
      firstItem = sample.items[0]
    }
    expect(firstItem).toBeNull()
    for (let seed = 0; seed < 20; seed++) {
      expect(['', 'hello']).toContain(createSampler(sentence, seed).generate())
    }
  }
})
test('non-null invalid sample items and sparse arrays are still rejected', () => {
  for (const value of [undefined, false, 3, {text: 'hello'}]) {
    expect(() => validateSentence([[null, value]])).toThrow(/sentence\[0\]\[1\]/)
  }
  for (const value of [undefined, false, 3]) {
    expect(() => validateSentence([{items: [null, value]}])).toThrow(/sentence\[0\]\.items\[1\]/)
  }
  const sparse: Array<string | null> = [null]
  sparse.length = 2
  expect(() => validateSentence([sparse])).toThrow(/sentence\[0\]\[1\].*Sparse/)
})
test('all-null samples still select positions but produce no text or affixes', () => {
  const sentence = [{
    items: [null, null],
    count: 2,
    joiner: '|',
    prefix: '[',
    suffix: ']',
  }] as const satisfies Sentence
  const result = createSampler(sentence, 0).trace()
  expect(result.text).toBe('')
  expect(result.fragments).toEqual([])
  expect(result.selections[0]?.count).toBe(2)
  expect(result.selections[0]?.items).toEqual(['', ''])
})
