import TextSampler from 'text-sampler'

const textSampler = new TextSampler([
  'The ',
  ['sky', 'dog', 'cat'],
  ' is ',
  ['blue', 'green', 'red'],
  '.',
])
const text = textSampler.generate()
console.log(text)
