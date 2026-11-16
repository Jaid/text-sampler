export const must = <Value>(value: Value | undefined): Value => {
  if (value === undefined) {
    throw new Error('Expected a fixture value')
  }
  return value
}
