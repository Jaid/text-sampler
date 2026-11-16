import {expect, test} from 'bun:test'

const {default: textSampler} = await import('#src/main.ts')
test('should run', () => {
  const result = textSampler()
  expect(result).toBe('text-sampler') // TODO Test actual functionality
})
