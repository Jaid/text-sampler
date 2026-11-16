import type {Sentence} from './types.ts'

import {MAX_DEPTH} from './internal.ts'
import {validateSentence} from './validate.ts'

const MAX_SOURCE_LENGTH = 1_000_000
const MAX_TOKENS = 100_000

type Token = {
  kind: 'eof' | 'identifier' | 'number' | 'punctuation' | 'string'
  offset: number
  value: string
}

/**
 * Parse and validate literal sentence data without evaluating code.
 *
 * Accepts JSON, JavaScript-style literals and a `const sentence = [...]`
 * declaration, optionally preceded by type aliases. This is a data parser,
 * not a JavaScript or TypeScript evaluator.
 */
export function parseSource(input: string): Sentence {
  if (typeof input !== 'string') {
    throw new TypeError('Source must be text.')
  }
  if (input.length > MAX_SOURCE_LENGTH) {
    throw new RangeError('Keep the source below 1 000 000 characters.')
  }
  const fence = /^(\s*```(?:javascript|jsx?|json5?|tsx?|typescript)?[^\S\n]*\n)([\s\S]*?)\n?```\s*$/iu.exec(input)
  const source = fence?.[2] ?? input
  const offset = fence?.[1]?.length ?? 0
  const parser = new LiteralParser(source, input, offset)
  return validateSentence(parser.parse())
}

/** A literal-source syntax error, with a location in the original input. */
export class SourceSyntaxError extends SyntaxError {
  readonly column: number
  readonly line: number
  readonly offset: number

  constructor(message: string, options: {
    offset: number
    source: string
  }) {
    const {source, offset} = options
    const prefix = source.slice(0, offset)
    const line = prefix.split('\n').length
    const column = offset - prefix.lastIndexOf('\n')
    // eslint-disable-next-line unicorn/custom-error-definition -- Include the source location in the diagnostic.
    super(`Line ${line}, column ${column}: ${message}`)
    this.name = 'SourceSyntaxError'
    this.offset = offset
    this.line = line
    this.column = column
  }
}

class LiteralParser {
  private cursor = 0
  private readonly end: Token
  private position = 0
  private readonly tokens: Array<Token> = []

  constructor(
    private readonly source: string,
    private readonly originalSource = source,
    private readonly baseOffset = 0,
  ) {
    this.end = {
      kind: 'eof',
      value: '',
      offset: source.length,
    }
    this.tokenize()
  }

  parse(): unknown {
    while (this.is('type') || this.is('export') && this.peek(1).kind === 'identifier' && this.peek(1).value === 'type') {
      this.match('export')
      this.skipTypeAlias()
    }
    this.match('export')
    if (this.is('const') || this.is('let') || this.is('var')) {
      this.take()
      this.expect('sentence')
      if (this.match(':')) {
        let annotation = 0
        while (!this.is('=') && this.peek().kind !== 'eof') {
          if (this.is(';')) {
            this.error('Expected “=” after the sentence type.')
          }
          this.take()
          annotation++
        }
        if (!annotation) {
          this.error('Expected a type after “:”.')
        }
      }
      this.expect('=')
    }
    if (!this.is('[')) {
      this.error('Start with an array or const sentence = [...]. Only literal data is supported.')
    }
    const result = this.value(0)
    if (this.match('as')) {
      if (!this.match('const')) {
        this.expect('Sentence')
      }
    }
    if (this.match('satisfies')) {
      this.expect('Sentence')
    }
    this.match(';')
    if (this.peek().kind !== 'eof') {
      this.error('Only literal sentence data is supported; remove additional expressions or statements.')
    }
    return result
  }

  private error(message: string, offset = this.peek().offset): never {
    throw new SourceSyntaxError(message, {
      source: this.originalSource,
      offset: this.baseOffset + offset,
    })
  }

  private expect(value: string): void {
    if (!this.match(value)) {
      this.error(`Expected “${value}”.`)
    }
  }

  private is(value: string): boolean {
    const token = this.peek()
    return (token.kind === 'identifier' || token.kind === 'punctuation') && token.value === value
  }

  private match(value: string): boolean {
    if (!this.is(value)) {
      return false
    }
    this.take()
    return true
  }

  private peek(offset = 0): Token {
    return this.tokens[this.cursor + offset] ?? this.end
  }

  private readString(): string {
    const quote = this.source.charAt(this.position++)
    let value = ''
    while (this.position < this.source.length) {
      const character = this.source.charAt(this.position++)
      if (character === quote) {
        return value
      }
      if (character === '\n' || character === '\r') {
        this.error(String.raw`Use \n for a line break inside quoted text.`, this.position - 1)
      }
      if (character !== '\\') {
        value += character
        continue
      }
      if (this.position >= this.source.length) {
        break
      }
      const escape = this.source.charAt(this.position++)
      const simple: Readonly<Record<string, string>> = {
        n: '\n',
        r: '\r',
        t: '\t',
        b: '\b',
        f: '\f',
        v: '\v',
        0: '\0',
      }
      if (Object.hasOwn(simple, escape)) {
        if (escape === '0' && /\d/u.test(this.source.charAt(this.position))) {
          this.error('Octal escapes are not supported.', this.position - 1)
        }
        value += simple[escape]
      } else if (escape === '\n') {
      } else if (escape === '\r') {
        if (this.source.charAt(this.position) === '\n') {
          this.position++
        }
      } else if (escape === 'x' || escape === 'u') {
        if (escape === 'u' && this.source.charAt(this.position) === '{') {
          const match = /^\{([\dA-Fa-f]{1,6})\}/u.exec(this.source.slice(this.position))
          const digits = match?.[1]
          if (!match || !digits || Number.parseInt(digits, 16) > 0x10_FF_FF) {
            this.error('Invalid Unicode escape.', this.position)
          }
          value += String.fromCodePoint(Number.parseInt(digits, 16))
          this.position += match[0].length
        } else {
          const length = escape === 'x' ? 2 : 4
          const digits = this.source.slice(this.position, this.position + length)
          if (digits.length !== length || !/^[\dA-Fa-f]+$/u.test(digits)) {
            this.error('Invalid character escape.', this.position)
          }
          value += String.fromCodePoint(Number.parseInt(digits, 16))
          this.position += length
        }
      } else if (/[1-9]/u.test(escape)) {
        this.error('Octal escapes are not supported.', this.position - 1)
      } else {
        value += escape
      }
    }
    this.error('Unclosed quoted string.', this.position)
  }

  private skipTypeAlias(): void {
    this.expect('type')
    if (this.peek().kind !== 'identifier') {
      this.error('Expected a type name.')
    }
    this.take()
    this.expect('=')
    const closers: Array<string> = []
    let consumed = 0
    const pairs: Readonly<Record<string, string>> = {
      '{': '}',
      '[': ']',
      '(': ')',
      '<': '>',
    }
    while (this.peek().kind !== 'eof') {
      const token = this.peek()
      if (!closers.length && consumed) {
        if (this.match(';')) {
          return
        }
        if (token.kind === 'identifier' && ['const', 'export', 'let', 'type', 'var'].includes(token.value)) {
          return
        }
      }
      if (token.kind === 'punctuation') {
        const closer = pairs[token.value]
        if (closer) {
          closers.push(closer)
        } else if ([')', '>', ']', '}'].includes(token.value) && closers.pop() !== token.value) {
          this.error('Unbalanced type declaration.')
        }
      }
      this.take()
      consumed++
    }
    this.error('Add a const sentence = [...] declaration after the types.')
  }

  private take(): Token {
    const token = this.peek()
    this.cursor++
    return token
  }

  private tokenize(): void {
    while (this.position < this.source.length) {
      const character = this.source.charAt(this.position)
      if (/\s/u.test(character)) {
        this.position++
        continue
      }
      if (this.source.startsWith('//', this.position)) {
        const newline = this.source.indexOf('\n', this.position + 2)
        this.position = newline === -1 ? this.source.length : newline
        continue
      }
      if (this.source.startsWith('/*', this.position)) {
        const end = this.source.indexOf('*/', this.position + 2)
        if (end === -1) {
          this.error('Unclosed block comment.', this.position)
        }
        this.position = end + 2
        continue
      }
      const offset = this.position
      if (character === '"' || character === "'") {
        this.tokens.push({
          kind: 'string',
          value: this.readString(),
          offset,
        })
      } else if (/[$A-Z_a-z]/u.test(character)) {
        const match = /^[$A-Z_a-z][\w$]*/u.exec(this.source.slice(offset))
        if (!match) {
          this.error('Expected an identifier.', offset)
        }
        this.position += match[0].length
        this.tokens.push({
          kind: 'identifier',
          value: match[0],
          offset,
        })
      } else if (/\d/u.test(character) || character === '.' && /\d/u.test(this.source.charAt(offset + 1))) {
        const match = /^(?:0[Xx][\dA-Fa-f]+|0[Bb][01]+|0[Oo][0-7]+|(?:\d+(?:\.\d*)?|\.\d+)(?:[Ee][+-]?\d+)?)/u.exec(this.source.slice(offset))
        if (!match) {
          this.error('Expected a number.', offset)
        }
        this.position += match[0].length
        this.tokens.push({
          kind: 'number',
          value: match[0],
          offset,
        })
      } else {
        this.position++
        this.tokens.push({
          kind: 'punctuation',
          value: character,
          offset,
        })
      }
      if (this.tokens.length > MAX_TOKENS) {
        this.error('The source contains too many tokens.', offset)
      }
    }
    this.tokens.push(this.end)
  }

  private value(depth: number): unknown {
    if (depth > MAX_DEPTH * 3) {
      this.error(`Nesting cannot exceed ${MAX_DEPTH} sample levels.`)
    }
    const token = this.peek()
    if (token.kind === 'string') {
      return this.take().value
    }
    if (token.kind === 'number') {
      return Number(this.take().value)
    }
    if (this.match('-') || this.match('+')) {
      const sign = token.value === '-' ? -1 : 1
      if (this.peek().kind !== 'number') {
        this.error('Expected a number after the sign.')
      }
      return sign * Number(this.take().value)
    }
    if (this.match('true')) {
      return true
    }
    if (this.match('false')) {
      return false
    }
    if (this.match('null')) {
      return null
    }
    if (this.match('[')) {
      const result: Array<unknown> = []
      if (this.match(']')) {
        return result
      }
      while (true) {
        result.push(this.value(depth + 1))
        if (this.match(']')) {
          return result
        }
        this.expect(',')
        if (this.match(']')) {
          return result
        }
      }
    }
    if (this.match('{')) {
      const result = Object.create(null) as Record<string, unknown>
      if (this.match('}')) {
        return result
      }
      while (true) {
        const key = this.take()
        if (key.kind !== 'identifier' && key.kind !== 'string') {
          this.error('Expected a quoted or unquoted property name.', key.offset)
        }
        if (Object.hasOwn(result, key.value)) {
          this.error(`Duplicate property “${key.value}”.`, key.offset)
        }
        this.expect(':')
        result[key.value] = this.value(depth + 1)
        if (this.match('}')) {
          return result
        }
        this.expect(',')
        if (this.match('}')) {
          return result
        }
      }
    }
    this.error('Expected literal text, a number, a boolean, an array, or an object. Expressions are not executed.')
  }
}
