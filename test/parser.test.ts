import {expect, test} from 'bun:test'

import textSampler, {SentenceValidationError} from '#src/main.ts'
import {parseSource, SourceSyntaxError} from '#src/parser.ts'

test('quoted delimiters and declaration words inside type aliases remain string literals', () => {
  const source = `
    type Delimiters = '{' | '}' | '[' | ']' | '(' | ')' | '<' | '>'
    type DeclarationWords = 'type' | 'const' | 'let' | 'var' | 'export'
    type Shape = {opening: '{'; closing: '}'; values: ('[' | ']')[]}
    const sentence = ['literal']
  `
  expect(textSampler(parseSource(source), 0)).toBe('literal')
})
test('quoted values cannot impersonate wrapper keywords or punctuation', () => {
  for (const source of ['"const" sentence = ["A"]', 'const "sentence" = ["A"]', '["A" "," "B"]', '[{text ":" "A"}]', '["A"] "as" "const"']) {
    expect(() => parseSource(source)).toThrow(SourceSyntaxError)
  }
})
test('syntax errors preserve full-input locations inside a fenced source', () => {
  const source = '\n```typescript\nconst sentence = [\n  "ok",\n  missing,\n]\n```\n'
  let caught: unknown
  try {
    parseSource(source)
  } catch (error) {
    caught = error
  }
  expect(caught).toBeInstanceOf(SyntaxError)
  if (!(caught instanceof SourceSyntaxError)) {
    throw new Error('Expected a syntax error')
  }
  expect(caught.offset).toBe(source.indexOf('missing'))
  expect(caught.line).toBe(5)
  expect(caught.column).toBe(3)
})
test('syntax offsets count UTF-16 code units', () => {
  const source = 'const sentence = ["😀", missing]'
  let caught: unknown
  try {
    parseSource(source)
  } catch (error) {
    caught = error
  }
  if (!(caught instanceof SourceSyntaxError)) {
    throw new Error('Expected a syntax error')
  }
  expect(caught.offset).toBe(source.indexOf('missing'))
  expect(caught.line).toBe(1)
  expect(caught.column).toBe(source.indexOf('missing') + 1)
})
test('literal data errors remain validation errors after successful parsing', () => {
  expect(() => parseSource('[{text: "A", chance: 101}]')).toThrow(SentenceValidationError)
  expect(() => parseSource('[{text: "A", chance: null}]')).toThrow(SentenceValidationError)
})
test('input and size guards report their public error classes', () => {
  expect(() => {
    // @ts-expect-error TS2345 JavaScript callers can pass a value outside the static API.
    parseSource(null)
  }).toThrow(TypeError)
  expect(() => parseSource(' '.repeat(1_000_001))).toThrow(RangeError)
})
test('imports and executable expressions remain outside the literal grammar', () => {
  for (const source of ['import sentence from "./sentence.js"', 'const sentence = Array.from(["A"])', 'const sentence = ["A"]; console.log("extra")', '[{get text() {return "A"}}]']) {
    expect(() => parseSource(source)).toThrow(SourceSyntaxError)
  }
})
