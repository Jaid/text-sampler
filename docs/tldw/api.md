# TextSampler

The default export is the `TextSampler` class. Construct it with a sentence once, then call `generate()` for text or `trace()` for detailed output.

```ts
import TextSampler from 'text-sampler'

const sentence = [
  'The ',
  ['sky', 'dog', 'cat'],
  ' is ',
  ['blue', 'green', 'red'],
  '.',
]

const textSampler = new TextSampler(sentence, 'gallery')
const text = textSampler.generate()
const result = textSampler.trace()
// result.text === text
```

## Constructor

```ts
new TextSampler(sentence)
new TextSampler(sentence, 42)
new TextSampler(sentence, 'gallery')
new TextSampler(sentence, {seed: 42})
new TextSampler(sentence, {seed: 'gallery'})
```

The second argument is optional. When supplied, it is a `number`, a `string`, or a `TextSamplerOptions` object with a required `seed`. The constructor uses `tinyhand` to normalize the shorthand forms. `TextSamplerInput` is `tinyhand.Wrap<'seed', TextSamplerOptions>`.

The sentence is validated immediately and before each run. Construction and generation never mutate it. The instance retains the original sentence reference rather than cloning it, so valid caller edits affect subsequent runs; invalid edits are rejected before generation. Readonly and frozen sentences are supported. Constructor options are read once, not retained as mutable configuration.

## Generation and tracing

| Member | Result |
| --- | --- |
| `generate(seed?)` | Generate one sentence and return its exact text. |
| `trace(seed?)` | Perform a generation run and return a `GenerationResult`. |
| `sentence` | Readonly reference to the input sentence. |
| `seed` | Readonly default seed, or `undefined` for an unseeded instance. |

Both methods accept an optional number or string override, **not** an options object. A call-specific seed takes precedence over the instance seed without changing it:

```ts
const textSampler = new TextSampler(sentence, {seed: 'default'})
const original = textSampler.generate()
const alternate = textSampler.generate('alternate')
const detailed = textSampler.trace('alternate')
// alternate === detailed.text
// textSampler.generate() === original
// textSampler.seed === 'default'
```

Each explicitly seeded run starts from that seed; repeated calls do not advance a persistent random stream. `0` and `''` are valid seeds, not requests for randomness. Omitted or `undefined` method arguments use the instance default.

Without either an instance seed or a call-specific seed, each run draws one fresh unsigned 32-bit seed using `Math.random()`. `trace()` reports it so the result can be reproduced:

```ts
const textSampler = new TextSampler(sentence)
const result = textSampler.trace()
const replay = textSampler.generate(result.seed)
// replay === result.text
```

`trace()` is a new generation run, not an inspection of the last `generate()` call. Two unseeded calls may differ. With the same sentence and explicit seed, `trace(seed).text` equals `generate(seed)`. Each trace is a fresh result object; modifying a previous result cannot change later runs.

## Seed values

Numeric seeds are integers from `0` through `4294967295`, inclusive. Invalid numbers throw `RangeError`. String seeds may be empty and are case-sensitive: whitespace and Unicode are preserved without normalization, and a numeric-looking string is not coerced to a number. Strings are reduced to a stable unsigned 32-bit state using FNV-1a over UTF-16 code units; like any 32-bit hash, collisions are possible. Seeded runs do not use ambient randomness.

Other seed types, including `null`, throw `TypeError`. Supplying an options object without a valid `seed` also fails; omit the second argument to create an unseeded instance.

## Additional exports

| Export | Result |
| --- | --- |
| `validateSentence(value)` | Return the same input after validation, typed as `Sentence`, without normalizing or copying it. |
| `SentenceValidationError` | A `TypeError` with a `path`, such as `sentence[2].items[0].chance`. |
| `parseSource(source)` from `text-sampler/parser` | Parse and validate literal sentence data without evaluating code. |
| `SourceSyntaxError` from `text-sampler/parser` | A `SyntaxError` with `offset`, `line` and `column`. |

The root exports the public types, including `Seed`, `TextSamplerOptions`, `TextSamplerInput`, `Sentence`, `Segment`, `SemanticSegment`, `Sample`, `CustomSample`, `ListSample`, `TextSegment`, `IndefiniteArticle`, `JoinSegment`, `SegmentMetadata`, `SegmentConfiguration`, `InnerJoiner`, `OuterJoiner` and `GenerationResult`.
