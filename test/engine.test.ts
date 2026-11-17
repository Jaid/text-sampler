import {expect, test} from 'bun:test'

import {generateSentence as generateValidatedSentence, validateSentence} from '#src/main.ts'
import {parseSource} from '#src/parser.ts'

import gallery from '../examples/gallery.ts'
import {EXAMPLES, TYPE_DEFINITIONS} from './fixtures/playground.ts'
import {must} from './helpers.ts'

const DEFAULT_SOURCE = `const sentence = ${JSON.stringify(gallery)}`
// Dynamic validation fixtures deliberately start as unknown data.
const generateSentence = (sentence: unknown, seed: number) => generateValidatedSentence(validateSentence(sentence), seed)
test('every playground example and the complete current schema generate successfully', () => {
  for (const example of EXAMPLES) {
    const sentence = parseSource(example.source)
    for (const seed of [0, 1, 42, 1337, 10_000, 4_294_967_295]) {
      const result = generateSentence(sentence, seed)
      expect(result.text.length > 0).toBeTruthy()
      expect(result).toEqual(generateSentence(sentence, seed))
    }
  }
  const sentence = parseSource(`${TYPE_DEFINITIONS}\n\n${DEFAULT_SOURCE}`)
  expect(sentence.length).toBe(gallery.length)
  expect(generateSentence(sentence, 42).text).toMatch(/^Please /)
})
test('the revised TypeScript intersections and joiner types parse without evaluating types', () => {
  const sentence = parseSource(`
    type Sentence = Segment[]
    type Segment = string | SemanticSegment
    type SemanticSegment = Sample | (SegmentMetadata & SegmentConfiguration & (IndefiniteArticle | TextSegment | JoinSegment))
    type SegmentMetadata = {name?: string}
    type SegmentConfiguration = {prefix?: OuterJoiner; suffix?: OuterJoiner; chance?: number}
    type IndefiniteArticle = {token: 'a'}
    type TextSegment = {text: string; an?: boolean}
    type JoinSegment = {joiner: string}
    type OuterJoiner = string | {text: string; merge?: boolean}
    type InnerJoiner = string | {between: string; first?: string; last?: string}
    type Sample = CustomSample | ListSample
    type ListSample = string[]
    type CustomSample = SegmentMetadata & SegmentConfiguration & {
      joiner?: InnerJoiner
      count?: number | {min: number; max: number}
      items: Segment[]
    }
    const sentence: Sentence = [
      'Please ',
      {name: 'instruction_word', items: ['change', 'restyle', 'remake'], suffix: ' to '},
      {name: 'article', token: 'a', suffix: ' ', chance: 100},
      {items: ['beautiful', 'elegant'], prefix: {text: ' '}, suffix: ' ', count: {min: 0, max: 2}, joiner: ' '},
      {name: 'fallback', joiner: ' ', chance: 100},
      {name: 'noun', text: 'painting', prefix: ' '},
    ] as const satisfies Sentence;
  `)
  expect(sentence.length).toBe(6)
  expect(must(generateSentence(sentence, 42).selections[0]).count).toBe(1)
  expect(generateSentence(sentence, 42).text).toMatch(/^Please (change|remake|restyle) to (a|an) /)
})
test('same source and seed repeat exactly; sampling is unique and random in order', () => {
  const sentence = [{
    name: 'letters',
    items: ['A', 'B', 'C', 'D', 'E'],
    count: 3,
  }]
  const first = generateSentence(sentence, 123)
  expect(must(first.selections[0]).items).toEqual(['D', 'B', 'A'])
  expect(first).toEqual(generateSentence(sentence, 123))
  const selectedItems = new Set(must(first.selections[0]).items)
  expect(selectedItems.size).toBe(3)
  const outputs = new Set(Array.from({length: 20}, (_, seed) => generateSentence(sentence, seed).text))
  expect(outputs.size > 10).toBeTruthy()
  const ordered = [{
    items: ['A', 'B', 'C'],
    count: 3,
  }]
  const permutations = new Set(Array.from({length: 20}, (_, seed) => generateSentence(ordered, seed).text))
  expect(permutations.size > 1).toBeTruthy()
})
test('count range is inclusive and zero emits no affixes', () => {
  const sentence = ['before', {
    name: 'optional',
    prefix: '[',
    suffix: ']',
    items: ['A', 'B'],
    count: {
      min: 0,
      max: 2,
    },
  }, 'after']
  const seen = new Set<number>
  for (let seed = 0; seed < 100; seed++) {
    const result = generateSentence(sentence, seed)
    const count = must(result.selections[0]).count
    seen.add(count)
    if (!count) {
      expect(result.text).toBe('beforeafter')
    }
  }
  expect([...seen].toSorted((a, b) => a - b)).toEqual([0, 1, 2])
})
test('empty nested choices do not leave affixes or separators', () => {
  const sentence = ['X', {
    prefix: '(',
    suffix: ')',
    count: 2,
    items: ['', {
      prefix: '[',
      suffix: ']',
      count: 0,
      items: ['hidden'],
    }],
  }, 'Y']
  const result = generateSentence(sentence, 5)
  expect(result.text).toBe('XY')
  expect(must(result.selections[0]).count).toBe(2)
  expect(must(result.selections[1]).count).toBe(0)
})
test('default and custom first/last joiner boundaries behave predictably', () => {
  const defaultResult = generateSentence([{
    items: ['A', 'B', 'C'],
    count: 3,
  }], 2)
  const [a, b, c] = must(defaultResult.selections[0]).items
  expect(defaultResult.text).toBe(`${a}, ${b} and ${c}`)
  const joiner = {
    between: '|',
    first: '~',
    last: '&',
  }
  const four = generateSentence([{
    items: ['A', 'B', 'C', 'D'],
    count: 4,
    joiner,
  }], 0)
  const values = must(four.selections[0]).items
  expect(four.text).toBe(`${values[0]}~${values[1]}|${values[2]}&${values[3]}`)
  const two = generateSentence([{
    items: ['A', 'B'],
    count: 2,
    joiner,
  }], 0)
  expect(two.text).toBe(must(two.selections[0]).items.join('&'))
})
test('article follows emitted words across skipped samples and respects explicit phonetics', () => {
  const article = {token: 'a'}
  for (const [text, expected] of [['apple', 'an'], ['hour', 'an'], ['honest rendering', 'an'], ['university', 'a'], ['unique painting', 'a'], ['one-off', 'a'], ['MRI scan', 'an'], ['NASA project', 'a'], ['URL', 'a']]) {
    expect(generateSentence([article, ' ', {
      count: 0,
      items: ['hidden'],
    }, text], 0).text).toBe(`${expected} ${text}`)
  }
  expect(generateSentence([article, ' ', {
    text: 'university',
    an: true,
  }], 0).text).toBe('an university')
  expect(generateSentence([article, ' ', {items: [{
    text: 'apple',
    an: false,
  }]}], 0).text).toBe('a apple')
  expect(generateSentence([article, ' (', {
    text: 'hour',
    an: false,
  }, ')'], 0).text).toBe('a (hour)')
  expect(generateSentence([article, ' ', 'ho', 'ur'], 0).text).toBe('an hour')
})
test('literal whitespace is exact, including leading, repeated, and trailing whitespace', () => {
  const source = ['  ', {token: 'a'}, '  ', 'apple', '\n']
  const result = generateSentence(source, 0)
  expect(result.text).toBe('  an  apple\n')
  expect('rawText' in result).toBe(false)
  expect(generateSentence(['A ', ' B\t', {text: '\n C'}], 0).text).toBe('A  B\t\n C')
  expect(generateSentence([{
    items: ['  '],
    prefix: '[',
    suffix: ']',
  }], 0).text).toBe('[  ]')
})
test('equal adjacent outer joiners merge unless both sides explicitly disable merging', () => {
  for (const left of [true, false]) {
    for (const right of [true, false]) {
      const sentence = [
        {
          items: ['A'],
          suffix: {
            text: ' / ',
            merge: left,
          },
        },
        {
          items: ['B'],
          prefix: {
            text: ' / ',
            merge: right,
          },
        },
      ]
      expect(generateSentence(sentence, 0).text).toBe(!left && !right ? 'A /  / B' : 'A / B')
    }
  }
})
test('string affixes and object affixes default to merging in either position', () => {
  for (const [suffix, prefix] of [
    [' ', ' '],
    [' ', {text: ' '}],
    [{text: ' '}, ' '],
    [{text: ' '}, {text: ' '}],
    [' ', {
      text: ' ',
      merge: false,
    }],
    [{
      text: ' ',
      merge: false,
    }, ' '],
    [{text: ' '}, {
      text: ' ',
      merge: false,
    }],
    [{
      text: ' ',
      merge: false,
    }, {text: ' '}],
  ]) {
    expect(generateSentence([{
      items: ['A'],
      suffix,
    }, {
      items: ['B'],
      prefix,
    }], 0).text).toBe('A B')
  }
  expect(generateSentence([{
    items: ['A'],
    suffix: '\n\t',
  }, {
    items: ['B'],
    prefix: '\n\t',
  }], 0).text).toBe('A\n\tB')
})
test('unequal affixes and nonempty literal boundaries never merge', () => {
  expect(generateSentence([{
    items: ['A'],
    suffix: ' ',
  }, {
    items: ['B'],
    prefix: '  ',
  }], 0).text).toBe('A   B')
  expect(generateSentence([{
    items: ['A'],
    suffix: ' | ',
  }, {
    items: ['B'],
    prefix: ' + ',
  }], 0).text).toBe('A |  + B')
  for (const barrier of [' ', {
    text: ' ',
    name: 'literal',
  }, '\n', 'X']) {
    expect(generateSentence([{
      items: ['A'],
      suffix: ' ',
    }, barrier, {
      items: ['B'],
      prefix: ' ',
    }], 0).text).toBe(`A ${typeof barrier === 'string' ? barrier : barrier.text} B`)
  }
  expect(generateSentence(['A ', {
    items: ['B'],
    prefix: ' ',
  }], 0).text).toBe('A  B')
  expect(generateSentence([{
    items: ['A'],
    suffix: ' ',
  }, ' B'], 0).text).toBe('A  B')
})
test('zero-count samples, empty samples, and empty literals expose the next emitted boundary', () => {
  const sentence = [
    {
      items: ['A'],
      suffix: ' ',
    },
    {
      items: ['hidden'],
      count: 0,
      prefix: '[',
      suffix: ']',
    },
    '',
    {
      text: '',
      name: 'empty',
    },
    {
      items: [''],
      prefix: '(',
      suffix: ')',
    },
    {
      items: [{
        items: ['hidden'],
        count: 0,
      }],
      prefix: '{',
      suffix: '}',
    },
    {
      items: ['B'],
      prefix: ' ',
    },
  ]
  expect(generateSentence(sentence, 0).text).toBe('A B')
})
test('nested exposed edges merge while same-direction wrapper affixes remain separate', () => {
  const exposed = [
    {
      items: [{
        items: ['A'],
        suffix: ' ',
      }],
      suffix: {
        text: '',
        merge: false,
      },
    },
    {
      items: [{
        items: ['B'],
        prefix: ' ',
      }],
      prefix: '',
    },
  ]
  expect(generateSentence(exposed, 0).text).toBe('A B')
  expect(generateSentence([{
    items: [{
      items: ['A'],
      prefix: ' ',
    }],
    prefix: ' ',
  }], 0).text).toBe('  A')
  expect(generateSentence([{
    items: [{
      items: ['A'],
      suffix: ' ',
    }],
    suffix: ' ',
  }], 0).text).toBe('A  ')
  const doubledWrappers = [
    {
      items: [{
        items: ['A'],
        suffix: ' ',
      }],
      suffix: ' ',
    },
    {
      items: [{
        items: ['B'],
        prefix: ' ',
      }],
      prefix: ' ',
    },
  ]
  expect(generateSentence(doubledWrappers, 0).text).toBe('A   B')
})
test('nested item boundaries can merge through an empty inner joiner but not an emitted one', () => {
  const children = [
    {
      items: ['A'],
      prefix: ' ',
      suffix: ' ',
    },
    {
      items: ['B'],
      prefix: ' ',
      suffix: ' ',
    },
  ]
  expect(generateSentence([{
    items: children,
    count: 2,
    joiner: '',
  }], 0).text).toMatch(/^ [AB] [AB] $/)
  expect(generateSentence([{
    items: children,
    count: 2,
    joiner: ' ',
  }], 0).text).toMatch(/^ [AB] {3}[AB] $/)
})
test('optional phonetic hints and semantic names survive validation and article resolution', () => {
  const sentence = [
    {
      name: 'article holder',
      items: [{
        name: 'indefinite article',
        token: 'a',
      }],
      suffix: ' ',
    },
    {
      name: 'noun holder',
      items: [{
        name: 'noun',
        text: 'hour',
      }],
      prefix: ' ',
    },
  ]
  const original = JSON.stringify(sentence)
  const result = generateSentence(sentence, 0)
  expect(result.text).toBe('an hour')
  expect(must(result.articleResolutions[0]).name).toBe('indefinite article')
  expect(must(result.articleResolutions[0]).nextWord).toBe('hour')
  expect(JSON.stringify(sentence)).toBe(original)
  expect(generateSentence([{token: 'a'}, ' ', {
    name: 'noun',
    text: 'unique result',
  }], 0).text).toBe('a unique result')
  expect(generateSentence([{token: 'a'}, ' ', {
    text: 'hour',
    an: false,
  }], 0).text).toBe('a hour')
})
test('article resolution reads the words formed after structural boundary merging', () => {
  const result = generateSentence([
    {token: 'a'},
    ' ',
    {
      items: ['h'],
      suffix: 'o',
    },
    {
      items: ['nest'],
      prefix: 'o',
    },
  ], 0)
  expect(result.text).toBe('an honest')
  expect(must(result.articleResolutions[0]).nextWord).toBe('honest')
})
test('text and article segments share configured prefixes and suffixes', () => {
  expect(generateSentence([{
    name: 'greeting',
    text: 'hello',
    prefix: '[',
    suffix: {text: ']'},
  }], 0).text).toBe('[hello]')
  const sentence = [
    {
      name: 'article',
      token: 'a',
      prefix: '(',
      suffix: ' ',
    },
    {
      name: 'noun',
      text: 'apple',
      suffix: ')',
    },
  ]
  const original = JSON.stringify(sentence)
  const result = generateSentence(sentence, 0)
  expect(result.text).toBe('(an apple)')
  expect(must(result.articleResolutions[0]).name).toBe('article')
  expect(JSON.stringify(sentence)).toBe(original)
  expect(generateSentence([{
    token: 'a',
    prefix: '[',
    suffix: ']',
  }], 0).text).toBe('[a]')
})
test('adjacent semantic affixes merge across text, sample, and article kinds', () => {
  const cases = [
    [[{
      text: 'A',
      suffix: ' ',
    }, {
      text: 'B',
      prefix: ' ',
    }], 'A B'],
    [[{
      text: 'A',
      suffix: ' ',
    }, {
      items: ['B'],
      prefix: ' ',
    }], 'A B'],
    [[{
      items: ['A'],
      suffix: ' ',
    }, {
      text: 'B',
      prefix: ' ',
    }], 'A B'],
    [[{
      text: 'Make',
      suffix: ' ',
    }, {
      token: 'a',
      prefix: ' ',
      suffix: ' ',
    }, 'apple'], 'Make an apple'],
    [[{
      items: ['Make'],
      suffix: ' ',
    }, {
      token: 'a',
      prefix: ' ',
      suffix: ' ',
    }, 'apple'], 'Make an apple'],
    [[{
      token: 'a',
      suffix: ' ',
    }, {
      text: 'hour',
      prefix: ' ',
    }], 'an hour'],
    [[{
      token: 'a',
      suffix: ' ',
    }, {
      items: ['hour'],
      prefix: ' ',
    }], 'an hour'],
    [[{
      token: 'a',
      suffix: ' ',
    }, {
      token: 'a',
      prefix: ' ',
    }], 'an a'],
  ] as const
  for (const [sentence, expected] of cases) {
    expect(generateSentence(sentence, 0).text).toBe(expected)
  }
  for (const suffixMerge of [true, false]) {
    for (const prefixMerge of [true, false]) {
      const sentence = [
        {
          token: 'a',
          suffix: {
            text: ' ',
            merge: suffixMerge,
          },
        },
        {
          text: 'hour',
          prefix: {
            text: ' ',
            merge: prefixMerge,
          },
        },
      ]
      expect(generateSentence(sentence, 0).text).toBe(suffixMerge || prefixMerge ? 'an hour' : 'an  hour')
    }
  }
})
test('empty configured text omits its affixes and exposes the next emitted boundary', () => {
  expect(generateSentence([{
    text: '',
    prefix: '[',
    suffix: ']',
  }], 0).text).toBe('')
  expect(generateSentence([
    {
      text: 'A',
      suffix: ' ',
    },
    {
      text: '',
      prefix: {
        text: '[',
        merge: false,
      },
      suffix: {
        text: ']',
        merge: false,
      },
    },
    {
      text: 'B',
      prefix: ' ',
    },
  ], 0).text).toBe('A B')
  expect(generateSentence([{
    text: ' ',
    prefix: '[',
    suffix: ']',
  }], 0).text).toBe('[ ]')
  expect(generateSentence([{
    items: [{
      text: '',
      prefix: '[',
      suffix: ']',
    }],
    prefix: '(',
    suffix: ')',
  }], 0).text).toBe('')
})
test('article lookahead includes configured prefix words before text phonetic hints', () => {
  const bright = generateSentence([
    {
      token: 'a',
      suffix: ' ',
    },
    {
      text: 'hour',
      an: true,
      prefix: 'bright ',
    },
  ], 0)
  expect(bright.text).toBe('a bright hour')
  expect(must(bright.articleResolutions[0]).nextWord).toBe('bright')
  expect(generateSentence([{
    token: 'a',
    suffix: ' ',
  }, {
    text: 'hour',
    prefix: ' ',
  }], 0).text).toBe('an hour')
  expect(generateSentence([{
    token: 'a',
    suffix: ' ',
  }, {
    text: 'hour',
    an: false,
    prefix: ' ',
  }], 0).text).toBe('a hour')
  expect(generateSentence([{
    token: 'a',
    suffix: ' bright ',
  }, {
    text: 'hour',
    an: true,
  }], 0).text).toBe('a bright hour')
})
test('shared configuration composes with nested samples without folding same-direction affixes', () => {
  expect(generateSentence([
    {items: [{
      text: 'A',
      suffix: ' ',
    }]},
    {
      text: 'B',
      prefix: ' ',
    },
  ], 0).text).toBe('A B')
  expect(generateSentence([{
    items: [{
      text: 'A',
      prefix: ' ',
    }],
    prefix: ' ',
  }], 0).text).toBe('  A')
  expect(generateSentence([{
    items: [{
      text: 'A',
      suffix: ' ',
    }],
    suffix: ' ',
  }], 0).text).toBe('A  ')
})
test('chance endpoints apply to every semantic kind without consuming random draws', () => {
  const pool = {
    name: 'pool',
    items: ['A', 'B', 'C', 'D'],
    count: 2,
  }
  const baseline = must(generateSentence([pool], 123).selections[0]).items
  const skipped = [
    {
      text: 'hidden',
      chance: 0,
      prefix: '[',
      suffix: ']',
    },
    {
      token: 'a',
      chance: 0,
      prefix: '[',
      suffix: ']',
    },
    {
      joiner: ' ',
      chance: 0,
      prefix: '[',
      suffix: ']',
    },
    {
      items: [{
        items: ['hidden'],
        chance: 50,
      }],
      chance: 0,
      prefix: '[',
      suffix: ']',
    },
  ]
  for (const segment of skipped) {
    const result = generateSentence([segment, pool], 123)
    expect(result.selections.find(value => value.name === 'pool')?.items).toEqual(baseline)
    expect(result.text.includes('[')).toBe(false)
  }
  expect(must(generateSentence([{
    ...pool,
    chance: 100,
  }], 123).selections[0]).items).toEqual(baseline)
  expect(generateSentence([{
    text: 'A',
    chance: 100,
  }, {
    joiner: ' ',
    chance: 100,
  }, {text: 'B'}], 0).text).toBe('A B')
  expect(generateSentence([{text: 'A'}, {
    joiner: ' ',
    chance: 0,
  }, {text: 'B'}], 0).text).toBe('AB')
  expect(generateSentence([{
    token: 'a',
    chance: 0,
    suffix: ' ',
  }, 'apple'], 0).text).toBe('apple')
})
test('intermediate chances repeat by seed and skipped parents do not roll children', () => {
  const source = [{
    name: 'optional',
    text: 'A',
    chance: 50,
  }, {
    text: 'B',
    chance: 25.5,
  }]
  const outputs = new Set
  for (let seed = 0; seed < 40; seed++) {
    const result = generateSentence(source, seed)
    expect(result).toEqual(generateSentence(source, seed))
    outputs.add(result.text)
  }
  expect(outputs.has('A')).toBeTruthy()
  expect(outputs.has('B')).toBeTruthy()
  expect(outputs.has('AB')).toBeTruthy()
  expect(outputs.has('')).toBeTruthy()
  const sourceWithChildren = [
    {
      name: 'parent',
      chance: 0,
      items: [{
        name: 'child',
        chance: 50,
        items: ['X', 'Y'],
        count: {
          min: 0,
          max: 2,
        },
      }],
    },
    {
      name: 'next',
      items: ['A', 'B', 'C'],
      count: 2,
    },
  ]
  const result = generateSentence(sourceWithChildren, 42)
  expect(must(result.selections[0]).skipReason).toBe('chance')
  expect(must(result.selections[0]).id).toEqual([0])
  expect(result.selections.some(value => value.name === 'child')).toBe(false)
  expect(must(result.selections[1]).items).toEqual(must(generateSentence([sourceWithChildren[1]], 42).selections[0]).items)
  expect(generateSentence([{
    chance: 50,
    items: ['hidden'],
    prefix: '[',
    suffix: ']',
  }], 42).text).toBe('')
})
test('chance validates finite percentages and samples retain their inner joiner discriminator', () => {
  for (const chance of [-1, 101, Infinity, NaN, '50', null]) {
    expect(() => validateSentence([{
      text: 'A',
      chance,
    }])).toThrow(/sentence\[0\]\.chance/)
  }
  expect(() => validateSentence([{
    text: 'A',
    chance: 0.25,
  }])).not.toThrow()
  expect(() => validateSentence([{joiner: {between: ' '}}])).toThrow(/sentence\[0\]\.joiner/)
  expect(generateSentence([{
    items: ['A', 'B'],
    count: 2,
    joiner: '|',
  }], 0).text.length).toBe(3)
})
test('fallback joiners require actual body content on both sides', () => {
  for (const source of [
    [{joiner: ' '}, 'A'],
    ['A', {joiner: ' '}],
    [{joiner: ' '}, {joiner: '-'}, 'A'],
    ['A', {joiner: ' '}, {
      text: 'hidden',
      chance: 0,
    }],
  ]) {
    expect(generateSentence(source, 0).text).toBe('A')
  }
  expect(generateSentence([{joiner: ' '}, {joiner: '-'}], 0).text).toBe('')
  expect(generateSentence(['A', {joiner: ' / '}, 'B'], 0).text).toBe('A / B')
  expect(generateSentence(['A', {joiner: ''}, 'B'], 0).text).toBe('AB')
  expect(generateSentence(['A', {joiner: ' '}, ' ', {joiner: ' '}, 'B'], 0).text).toBe('A   B')
})
test('fallback runs coalesce equal adjacent joiners after skips and retain different text', () => {
  const source = ['A', {joiner: ' '}, {
    text: 'hidden',
    chance: 0,
  }, '', {joiner: ' '}, 'B']
  expect(generateSentence(source, 0).text).toBe('A B')
  expect(generateSentence(['A', {joiner: ','}, {joiner: ';'}, 'B'], 0).text).toBe('A,;B')
  expect(generateSentence(['A', {joiner: ' '}, {
    items: ['hidden'],
    count: 0,
  }, {joiner: ' '}, 'B'], 0).text).toBe('A B')
})
test('fallback absorption requires an identical facing affix with merge enabled', () => {
  for (const left of [true, false]) {
    for (const right of [true, false]) {
      const source = [
        {
          text: 'A',
          suffix: {
            text: ' ',
            merge: left,
          },
        },
        {joiner: ' '},
        {
          text: 'B',
          prefix: {
            text: ' ',
            merge: right,
          },
        },
      ]
      expect(generateSentence(source, 0).text).toBe(left || right ? 'A B' : 'A   B')
    }
  }
  expect(generateSentence([{
    text: 'A',
    suffix: {
      text: ' ',
      merge: false,
    },
  }, {joiner: ' '}, 'B'], 0).text).toBe('A  B')
  expect(generateSentence(['A', {joiner: ' '}, {
    text: 'B',
    prefix: {
      text: ' ',
      merge: false,
    },
  }], 0).text).toBe('A  B')
  expect(generateSentence(['A ', {joiner: ' '}, 'B'], 0).text).toBe('A  B')
  expect(generateSentence([{
    text: 'A',
    suffix: ' ',
  }, {joiner: ' - '}, {
    text: 'B',
    prefix: ' ',
  }], 0).text).toBe('A  -  B')
})
test('configured joiners and join-only samples cannot anchor themselves', () => {
  const configuredJoin = {
    joiner: ' ',
    prefix: '(',
    suffix: ')',
  }
  expect(generateSentence([configuredJoin, 'B'], 0).text).toBe('B')
  expect(generateSentence(['A', configuredJoin], 0).text).toBe('A')
  expect(generateSentence(['A', configuredJoin, 'B'], 0).text).toBe('A( )B')
  expect(generateSentence(['A', {
    joiner: ' ',
    prefix: ' ',
    suffix: ' ',
  }, 'B'], 0).text).toBe('A   B')
  const sample = {
    items: [{joiner: ' '}],
    prefix: '(',
    suffix: ')',
  }
  expect(generateSentence([sample, 'B'], 0).text).toBe('B')
  expect(generateSentence(['A', sample, 'B'], 0).text).toBe('A( )B')
  expect(generateSentence([sample, {joiner: ' '}, sample], 0).text).toBe('')
})
test('sample inner separators are inserted only between surviving conditional items', () => {
  const sample = {
    items: [{joiner: ' '}, 'B'],
    count: 2,
    joiner: '|',
  }
  for (const seed of [0, 1, 2, 3, 42, 123]) {
    expect(generateSentence([sample], seed).text).toBe('B')
  }
  expect(generateSentence([{
    items: [{joiner: ' '}, {joiner: '-'}],
    count: 2,
    joiner: '|',
    prefix: '[',
    suffix: ']',
  }], 0).text).toBe('')
})
test('provenance uses original indices through sampled order and nested named parents', () => {
  const source = ['Start ', {
    name: 'outer',
    prefix: '[',
    suffix: ']',
    count: 3,
    joiner: '|',
    items: [
      {
        name: 'alpha',
        text: 'A',
      },
      {
        name: 'inner',
        items: ['B0', {
          name: 'named leaf',
          text: 'B1',
        }],
        count: 2,
        joiner: '/',
      },
      'C',
    ],
  }, ' end']
  const result = generateSentence(source, 123)
  expect(result.fragments.map(value => value.text).join('')).toBe(result.text)
  const a = must(result.fragments.find(value => value.text === 'A'))
  expect(a.id).toEqual([1, 0])
  expect(a.name).toBe('alpha')
  expect(a.ancestors).toEqual([{
    id: [1],
    name: 'outer',
  }])
  const b0 = must(result.fragments.find(value => value.text === 'B0'))
  const b1 = must(result.fragments.find(value => value.text === 'B1'))
  expect(b0.id).toEqual([1, 1, 0])
  expect(b1.id).toEqual([1, 1, 1])
  expect(b1.name).toBe('named leaf')
  expect(b0.ancestors).toEqual([{
    id: [1],
    name: 'outer',
  }, {
    id: [1, 1],
    name: 'inner',
  }])
  expect(result.fragments.find(value => value.text === '/')?.id).toEqual([1, 1])
  expect(result.fragments.find(value => value.text === '/')?.part).toBe('joiner')
  expect(result.fragments.find(value => value.text === '[')?.id).toEqual([1])
  expect(result.fragments.find(value => value.text === '[')?.part).toBe('prefix')
  expect(result.fragments.find(value => value.text === 'Start ')?.id).toEqual([0])
  expect(result.fragments.filter(value => value.text === 'Start ').length).toBe(1)
  expect(must(result.selections[1]).id).toEqual([1, 1])
})
test('merged fragments retain fallback and affix contributor identities without duplicate text', () => {
  const source = [
    {
      name: 'left',
      text: 'A',
      suffix: ' ',
    },
    {
      name: 'fallback one',
      joiner: ' ',
    },
    {
      name: 'optional',
      chance: 0,
      text: 'hidden',
    },
    {
      name: 'fallback two',
      joiner: ' ',
    },
    {
      name: 'right',
      text: 'B',
      prefix: ' ',
    },
  ]
  const result = generateSentence(source, 0)
  expect(result.text).toBe('A B')
  expect(result.fragments.map(value => value.text).join('')).toBe(result.text)
  const boundary = must(result.fragments.find(value => value.text === ' '))
  expect(boundary.id).toEqual([0])
  expect(boundary.name).toBe('left')
  expect(boundary.part).toBe('suffix')
  expect(must(boundary.contributors).map(value => value.id)).toEqual([[1], [3], [4]])
  expect(must(boundary.contributors).map(value => value.part)).toEqual(['joiner', 'joiner', 'prefix'])
  expect(result.fragments.some(value => value.name === 'optional')).toBe(false)
})
test('articles resolve after fallback absorption and expose their stable source identity', () => {
  const result = generateSentence([
    {
      name: 'article',
      token: 'a',
    },
    {joiner: ' '},
    {
      text: 'h',
      suffix: 'o',
    },
    {joiner: 'o'},
    {
      text: 'nest',
      prefix: 'o',
    },
  ], 0)
  expect(result.text).toBe('an honest')
  expect(must(result.articleResolutions[0]).id).toEqual([0])
  expect(must(result.articleResolutions[0]).nextWord).toBe('honest')
  const article = must(result.fragments.find(value => value.part === 'article'))
  expect(article.text).toBe('an')
  expect(article.name).toBe('article')
  expect(article.id).toEqual([0])
  expect(result.fragments.map(value => value.text).join('')).toBe(result.text)
})
test('literal parser handles JSON, quoting, escapes, fences, and trailing commas', () => {
  expect(parseSource('["a", "b"]')).toEqual(['a', 'b'])
  expect(parseSource("```typescript\nconst sentence = ['it\\'s', '\\u{1f34e}', '\\x41',];\n```")).toEqual(["it's", '🍎', 'A'])
  expect(parseSource('[{text: "URL", an: false,},]')[0]).toEqual({
    text: 'URL',
    an: false,
  })
})
test('expressions and trailing executable statements are rejected without execution', () => {
  const executionProbe = globalThis as typeof globalThis & {__sentenceEngineExecuted?: boolean}
  executionProbe.__sentenceEngineExecuted = false
  const malicious = [
    '[(() => { globalThis.__sentenceEngineExecuted = true; return "bad"; })()]',
    'globalThis.__sentenceEngineExecuted = true; const sentence = ["bad"]',
    'const sentence = ["fine"]; globalThis.__sentenceEngineExecuted = true',
    'const sentence = [someVariable]',
    '[`hello ${globalThis.__sentenceEngineExecuted = true}`]',
  ]
  for (const source of malicious) {
    expect(() => parseSource(source)).toThrow(/Line \d+, column \d+:/)
  }
  expect(executionProbe.__sentenceEngineExecuted).toBe(false)
  delete executionProbe.__sentenceEngineExecuted
})
test('invalid schemas and ranges report paths', () => {
  expect(() => validateSentence([{
    items: ['x'],
    count: 2,
  }])).toThrow(/sentence\[0\]\.count/)
  expect(() => validateSentence([{
    items: ['x'],
    count: {
      min: 1,
      max: 0,
    },
  }])).toThrow(/min|range/i)
  expect(() => validateSentence([{
    text: 'x',
    an: 1,
  }])).toThrow(/sentence\[0\]\.an/)
  expect(() => validateSentence([{
    text: 'x',
    name: 1,
  }])).toThrow(/sentence\[0\]\.name/)
  expect(() => validateSentence([{
    token: 'a',
    name: false,
  }])).toThrow(/sentence\[0\]\.name/)
  expect(() => validateSentence([{
    items: ['x'],
    prefix: {merge: false},
  }])).toThrow(/prefix.text/)
  expect(() => validateSentence([{
    items: ['x'],
    suffix: {
      text: ' ',
      merge: 1,
    },
  }])).toThrow(/suffix.merge/)
  expect(() => validateSentence([{
    text: 'x',
    prefix: {merge: false},
  }])).toThrow(/prefix.text/)
  expect(() => validateSentence([{
    token: 'a',
    suffix: {
      text: ' ',
      merge: 1,
    },
  }])).toThrow(/suffix.merge/)
  expect(() => validateSentence([{
    items: ['x'],
    joiner: {last: ' and '},
  }])).toThrow(/joiner.between/)
  expect(() => validateSentence([{
    items: ['x'],
    count: null,
  }])).toThrow(/count/i)
  expect(() => validateSentence([{token: 'b'}])).toThrow(/token/i)
  expect(() => parseSource('[{items: ["x"], count: 1, count: 0}]')).toThrow(/Duplicate property/)
  expect(() => generateSentence(['x'], -1)).toThrow(/seed/i)
  expect(() => generateSentence(['x'], 1.1)).toThrow(/seed/i)
})
