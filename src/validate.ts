import type {Segment, Sentence} from './types.ts'

import {MAX_DEPTH, MAX_SEGMENTS} from './internal.ts'

const commonKeys = ['name', 'prefix', 'suffix', 'chance']
interface ValidationState {
  readonly ancestors: WeakSet<object>
  visited: number
}

/** Validate data and return the original sentence without rewriting it. */
export function validateSentence(value: unknown): Sentence {
  checkArray(value, 'sentence', 0, {
    visited: 0,
    ancestors: new WeakSet,
  })
  return value
}

function fail(message: string, path: string): never {
  throw new SentenceValidationError(message, {path})
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
function checkKeys(value: Record<string, unknown>, allowed: ReadonlyArray<string>, path: string): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      fail(`Unknown property “${key}”.`, path)
    }
  }
}
function checkString(value: unknown, path: string): asserts value is string {
  if (typeof value !== 'string') {
    fail('Expected a string.', path)
  }
}
function checkOuterJoiner(value: unknown, path: string): void {
  if (typeof value === 'string') {
    return
  }
  if (!isRecord(value)) {
    fail('Expected a string or { text, merge? }.', path)
  }
  checkKeys(value, ['text', 'merge'], path)
  checkString(value.text, `${path}.text`)
  if (value.merge !== undefined && typeof value.merge !== 'boolean') {
    fail('Expected true or false.', `${path}.merge`)
  }
}
function checkInnerJoiner(value: unknown, path: string): void {
  if (typeof value === 'string') {
    return
  }
  if (!isRecord(value)) {
    fail('Expected a string or { between, first?, last? }.', path)
  }
  checkKeys(value, ['between', 'first', 'last'], path)
  checkString(value.between, `${path}.between`)
  for (const key of ['first', 'last']) {
    if (value[key] !== undefined) {
      checkString(value[key], `${path}.${key}`)
    }
  }
}
function checkCount(value: unknown, path: string): {
  max: number
  min: number
} {
  if (value === undefined) {
    return {
      min: 1,
      max: 1,
    }
  }
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value < 0) {
      fail('Count must be a nonnegative integer.', path)
    }
    return {
      min: value,
      max: value,
    }
  }
  if (value === null) {
    fail('Count cannot be null.', path)
  }
  if (!isRecord(value)) {
    fail('Expected an integer or a { min, max } range.', path)
  }
  checkKeys(value, ['min', 'max'], path)
  const {min, max} = value
  if (typeof min !== 'number' || typeof max !== 'number'
      || !Number.isSafeInteger(min) || !Number.isSafeInteger(max) || min < 0 || max < 0) {
    fail('Both min and max must be nonnegative integers.', path)
  }
  if (min > max) {
    fail('min cannot be greater than max.', path)
  }
  return {
    min,
    max,
  }
}
function checkArray(value: unknown, path: string, depth: number, state: ValidationState): asserts value is Sentence {
  if (!Array.isArray(value)) {
    fail('Expected an array of segments.', path)
  }
  for (let index = 0; index < value.length; index++) {
    const itemPath = `${path}[${index}]`
    if (!Object.hasOwn(value, index)) {
      fail('Sparse arrays are not supported; provide a segment at every index.', itemPath)
    }
    const item: unknown = value[index]
    checkSegment(item, itemPath, depth, state)
  }
}
function checkSegment(value: unknown, path: string, depth: number, state: ValidationState): asserts value is Segment {
  state.visited++
  if (state.visited > MAX_SEGMENTS) {
    fail(`Use at most ${MAX_SEGMENTS.toLocaleString('en-US').replaceAll(',', ' ')} segments.`, path)
  }
  if (depth > MAX_DEPTH) {
    fail(`Nesting cannot exceed ${MAX_DEPTH} levels.`, path)
  }
  if (typeof value === 'string') {
    return
  }
  if (!isRecord(value)) {
    fail('Expected text, a sample, an article token, or a joiner.', path)
  }
  if (state.ancestors.has(value)) {
    fail('Samples cannot contain circular references.', path)
  }
  for (const key of ['items', 'token', 'text', 'joiner']) {
    if (key in value && !Object.hasOwn(value, key)) {
      fail(`“${key}” must be an own property.`, `${path}.${key}`)
    }
  }
  if (value.name !== undefined) {
    checkString(value.name, `${path}.name`)
  }
  for (const key of ['prefix', 'suffix']) {
    if (value[key] !== undefined) {
      checkOuterJoiner(value[key], `${path}.${key}`)
    }
  }
  if (value.chance !== undefined && (typeof value.chance !== 'number'
      || !Number.isFinite(value.chance) || value.chance < 0 || value.chance > 100)) {
    fail('Chance must be a finite percentage from 0 to 100.', `${path}.chance`)
  }
  if (Object.hasOwn(value, 'items')) {
    checkKeys(value, [...commonKeys, 'joiner', 'items', 'count'], path)
    if (!Array.isArray(value.items)) {
      fail('Expected an array of segments.', `${path}.items`)
    }
    const {max} = checkCount(value.count, `${path}.count`)
    if (max > value.items.length) {
      fail(`Count cannot exceed the ${value.items.length} available item${value.items.length === 1 ? '' : 's'}; sampling uses each item at most once.`, `${path}.count`)
    }
    if (value.joiner !== undefined) {
      checkInnerJoiner(value.joiner, `${path}.joiner`)
    }
    state.ancestors.add(value)
    checkArray(value.items, `${path}.items`, depth + 1, state)
    state.ancestors.delete(value)
  } else if (Object.hasOwn(value, 'token')) {
    checkKeys(value, [...commonKeys, 'token'], path)
    if (value.token !== 'a') {
      fail('The supported token is “a”.', `${path}.token`)
    }
  } else if (Object.hasOwn(value, 'text')) {
    checkKeys(value, [...commonKeys, 'text', 'an'], path)
    checkString(value.text, `${path}.text`)
    if (value.an !== undefined && typeof value.an !== 'boolean') {
      fail('Expected true or false.', `${path}.an`)
    }
  } else if (Object.hasOwn(value, 'joiner')) {
    checkKeys(value, [...commonKeys, 'joiner'], path)
    checkString(value.joiner, `${path}.joiner`)
  } else {
    fail('Expected a sample with items, an article token, text, or a joiner.', path)
  }
}

export class SentenceValidationError extends TypeError {
  readonly path: string

  constructor(message: string, options: {readonly path: string}) {
    // eslint-disable-next-line unicorn/custom-error-definition -- Include the data path in the diagnostic.
    super(`${options.path}: ${message}`)
    this.name = 'SentenceValidationError'
    this.path = options.path
  }
}
