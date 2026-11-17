<center><a href="https://npmjs.com/package/text-sampler"><img src="https://shieldcn.dev/npm/v/text-sampler.svg?variant=secondary&logo=npm&label=latest+version" alt="Latest version on npm"/></a> <a href="https://github.com/Jaid/text-sampler/raw/HEAD/license.txt"><img src="https://shieldcn.dev/github/license/Jaid/text-sampler.svg?variant=secondary" alt="License"/></a></center>

# text-sampler

Deterministic text generation from composable sentence segments

Compose text from nested choices, optional segments and exact joining rules. Create a `TextSampler` with a sentence, then generate text or trace the selected items and their original segment IDs. Numeric and string seeds make runs reproducible.

The package ships JavaScript ES modules and TypeScript declarations for Node.js, Bun and browser bundlers. Constructor shorthand is normalized with `tinyhand`; the optional literal-source parser is available separately through `text-sampler/parser`.

## minimal example

```ts
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
```

## installation

Install from npm:

```sh
npm install text-sampler
```

The package ships ESM entry points for Node.js, Bun and browser bundlers. It does not provide a standalone browser `<script>` bundle.

## usage

### Sentence data

A `Sentence` is a readonly array of segments. Both custom-sample `items` and list samples accept readonly arrays, so plain arrays and `as const satisfies Sentence` both work.

| Segment | Meaning |
| --- | --- |
| `'literal text'` | Emit exactly this string. |
| `null` | Emit nothing; useful as an optional sample item. |
| `{text: 'apple'}` | Emit text with optional metadata, configuration and an article hint. |
| `[null, 'A', 'B']` | `ListSample`: choose a string or an empty (`null`) choice. |
| `{items: ['A', 'B']}` | `CustomSample`: sample nested segments, optionally choosing multiple. |
| `{token: 'a'}` | Emit `a` or `an` based on the next emitted word. |
| `{joiner: ' '}` | Emit a fallback separator when body content survives on both sides. |

Every configurable object segment accepts `name`, `prefix`, `suffix` and `chance`. A primitive string is always literal; wrap it in `{text: '…'}` to attach these properties. A `ListSample` is a bare array of strings or `null` without configuration.

#### Defaults

| Property | Default |
| --- | --- |
| `CustomSample.count` | `1` |
| `CustomSample.joiner` | `{between: ', ', last: ' and '}` |
| `SegmentConfiguration.chance` | `100` |
| `prefix` and `suffix` | No affix. |
| `OuterJoiner.merge` | `true` |
| `TextSegment.an` | Infer the article from the emitted word. |

Properties with defaults are optional in the public types. Explicit `undefined` is treated as omission for optional properties. `null` is invalid for configuration properties, but valid as an empty segment. `SegmentConfiguration` applies to all object-style semantic segments, including custom samples, articles, text and fallback joiners. List samples have no configuration.

#### List samples

`Sample` is the union of a configurable `CustomSample` and a shorthand `ListSample`:

```ts
type Sample = CustomSample | ListSample
type ListSample = ReadonlyArray<string | null>
```

A `ListSample` is a complete segment: it selects **exactly one** entry from a nonempty list. Entries may be strings or `null`; a selected `null` emits nothing. It is equivalent to a custom sample with just `items`, but it has no configuration or name:

```ts
const sentence = [
  'Paint ',
  {token: 'a', suffix: ' '},
  ['oil painting', 'abstract landscape'],
] as const satisfies Sentence

const textSampler = new TextSampler(sentence, 42)
const result = textSampler.trace()
// The selected subject has an original index ID such as [2, 1].
```

The outer array is always the sentence. `['A', 'B']` emits `AB`; `[['A', 'B']]` samples one of the two strings. In particular, `[[null, 'hello']]` yields either `''` or `'hello'` with equal probability; `[null, 'hello']` alone is a sentence that always emits `'hello'`. `null` is weighted like any other item, not removed before sampling. `ListSample` entries must be strings or `null`—not objects, numbers, or nested arrays. Use `CustomSample` for options such as `count`, `chance`, `prefix`, `suffix`, `joiner`, or `name`, or to sample arbitrary nested segments.

#### Custom samples and counts

```ts
const sample = {
  name: 'colors',
  items: ['red', 'green', 'blue'],
  count: {min: 0, max: 2},
  joiner: {between: ', ', last: ' and '},
}
```

`CustomSample.count` is a nonnegative integer or an inclusive `{min, max}` range. A custom sample chooses distinct **positions** in random order. If two positions contain equal strings, both can be chosen. Nested custom and list samples are allowed as items. A list sample always selects one position, including `null` entries.

The maximum count must not exceed `items.length`. To represent an empty pool, use `{items: [], count: 0}` rather than an empty `ListSample`. A fixed count of zero emits nothing, including no prefix or suffix.

Inner joiners are inserted only between surviving child outputs; a selected `null` adds no joiner or sample affixes. A string supplies every gap. For an object joiner, `first` replaces the first gap and `last` replaces the final gap; `last` takes precedence when there are exactly two outputs. Empty outputs do not leave stray inner separators.

#### Inclusion chance

```ts
const sentence = [
  'A',
  {text: ' vivid', chance: 50},
  ' painting',
] satisfies Sentence
```

`chance` is a finite percentage from `0` to `100` on configurable semantic segments (including `CustomSample`), including fractional values. A failed chance omits the whole segment and its affixes. A skipped sample does not roll any of its children.

A list sample containing `[null, 'hello']` behaves roughly like `{text: 'hello', chance: 50}`. Both emit `'hello'` about half the time, but they consume the random stream differently and need not agree for the same seed. Chance is evaluated before a segment's count and choices. The endpoints `0` and `100` do not consume random draws. Selected children that fail their own chance are not replaced with other items; a sample's count describes selected positions, not a guaranteed number of emitted outputs.

The random stream follows sentence order and selected child order. Editing an earlier random choice can change later choices for the same seed. Segment names are metadata and do not influence randomness.

### Joining without normalization

Text is concatenated exactly. The library does not trim output, collapse spaces, insert spaces around words or change punctuation. Leading, repeated and trailing whitespace in literal text is preserved. A whitespace-only body is meaningful output.

Prefixes and suffixes appear only when their segment emits a body. They accept either a string or `{text: string, merge?: boolean}`.

```ts
const textSampler = new TextSampler([
  {text: 'A', suffix: ' '},
  {text: 'B', prefix: ' '},
])
textSampler.generate(0) // 'A B'
```

An adjoining suffix and prefix with **equal complete strings** merge into one unless both explicitly set `merge: false`. An omitted `merge` is `true`. Empty or skipped segments expose the next surviving boundary.

```ts
const textSampler = new TextSampler([
  {text: 'A', suffix: {text: ' ', merge: false}},
  {text: 'B', prefix: {text: ' ', merge: false}},
])
textSampler.generate(0) // 'A  B'
```

Only a suffix followed by a prefix can merge. Literal whitespace blocks that adjacency. Nested prefix–prefix or suffix–suffix pairs remain distinct, and an affix participates in an outer merge only once.

#### Fallback joiners

Use a `JoinSegment` when optional content may otherwise remove a needed separator:

```ts
const sentence = [
  'Hello',
  {name: 'fallback', joiner: ' '},
  {text: 'beautiful', chance: 50, prefix: ' ', suffix: ' '},
  {name: 'fallback', joiner: ' '},
  'world',
] as const satisfies Sentence
```

This emits either `Hello beautiful world` or `Hello world`. A fallback is active only when real body content exists before and after it, after sampling and chance. Leading, trailing and isolated fallback joiners emit nothing. Joiners and the affixes of join-only samples cannot anchor one another.

Equal adjacent fallbacks coalesce, including when omitted segments lie between them. Different fallback strings remain distinct. A neighboring segment's facing suffix or prefix can swallow an identical fallback if that affix allows merging.

| Left suffix `merge` | Right prefix `merge` | Output around a matching fallback space |
| --- | --- | --- |
| `true` | `true` | `A B` |
| `true` | `false` | `A B` |
| `false` | `true` | `A B` |
| `false` | `false` | `A   B` |

The last row preserves the suffix, fallback and prefix. A JoinSegment's own prefix and suffix do not swallow its body.

### Indefinite articles

`{token: 'a'}` resolves after selection and joining. It looks ahead to the first emitted word, skipping punctuation and omitted segments. Words can span fragments.

```ts
const apple = new TextSampler([{token: 'a', suffix: ' '}, 'apple'])
const university = new TextSampler([{token: 'a', suffix: ' '}, 'university'])
const sql = new TextSampler([{token: 'a', suffix: ' '}, {text: 'SQL query', an: true}])
apple.generate(0) // 'an apple'
university.generate(0) // 'a university'
sql.generate(0) // 'an SQL query'
```

The English heuristic handles common silent consonants, vowel sounds and initialisms. It is not a pronunciation dictionary. Use `an: true` or `an: false` on a `TextSegment` for deliberate or ambiguous pronunciation. The hint applies to that text body; a preceding word emitted by its prefix determines the article first. With no following word, the token emits `a`.

## advanced usage

### Inspecting output

`textSampler.trace()` performs a generation run and returns:

| Field | Meaning |
| --- | --- |
| `seed` | The exact seed used, including a numeric seed selected for an unseeded run. |
| `text` | Exact generated text. |
| `fragments` | Emitted text with original IDs, names, ancestry and boundary contributors. |
| `selections` | Samples visited, the requested count, selected item output and any chance skip. |
| `articleResolutions` | Each article's final `a`/`an` value and the following word. |

#### Segment IDs and names

IDs are zero-based arrays of **original input indices**, never positions in the randomized output. A top-level literal uses `[0]`; an item at index `3` inside the sample at index `2` uses `[2, 3]`. Deeper nesting adds indices. A `ListSample` at `[2]` emits its chosen string with an ID such as `[2, 1]`, while its selection diagnostics use `[2]`. A selected `null` has no output fragment; the sample selection still reports `count: 1` and `items: ['']`.

```ts
import TextSampler from 'text-sampler'

const textSampler = new TextSampler([
  'Please ',
  {name: 'action', items: [{name: 'verb', text: 'paint'}]},
], 0)
const result = textSampler.trace()

// result.fragments:
// [
//   {text: 'Please ', id: [0], part: 'text', ancestors: []},
//   {
//     text: 'paint', id: [1, 0], name: 'verb', part: 'text',
//     ancestors: [{id: [1], name: 'action'}],
//   },
// ]
```

A fragment's `part` is `text`, `article`, `prefix`, `suffix` or `joiner`. Affixes and inner separators belong to their owning segment. `ancestors` preserves the surrounding sample IDs and any names, so an unnamed sampled string can still display its group name in a tooltip.

When a boundary absorbs another boundary, `contributors` preserves the other sources' IDs, names, parts and ancestry. Rendering fragment text in sequence exactly reconstructs `result.text`:

```ts
result.fragments.map(fragment => fragment.text).join('') === result.text
```

For a playground, render each fragment in a span and use its `id`, `name`, `ancestors` and `contributors` for the hover tooltip. Render text as text content, not HTML.

#### Selection diagnostics

Selections are reported in traversal order, with a parent before its visited children. `path` is a readable source path such as `sentence[1].items[2]`. `name` falls back to that path when the sample has no name.

`count` is the number of positions selected before child chance filtering. `items` contains their final text contributions in sampled order and can contain empty strings for omitted or absorbed output. `text` contains that sample's final emitted contribution, including surviving affixes. A sample skipped by chance has `skipReason: 'chance'`, a count of zero and no visited child selections.

### Parsing editor input

Ordinary callers pass sentence data directly. The optional parser accepts editable literal source without executing it:

```ts
import TextSampler from 'text-sampler'
import {parseSource, SourceSyntaxError} from 'text-sampler/parser'

try {
  const sentence = parseSource(`
    const sentence = [
      'Please ',
      {items: ['paint', 'draw'], suffix: ' something'},
    ]
  `)
  const textSampler = new TextSampler(sentence, 42)
  console.log(textSampler.generate())
} catch (error) {
  if (error instanceof SourceSyntaxError) {
    console.error(error.line, error.column, error.message)
  }
  throw error
}
```

Supported input includes nested list samples, JSON, single-quoted strings, unquoted object keys, comments, trailing commas and a `const sentence = […]` declaration. A declaration may include a type annotation, preceding non-generic type aliases, `as const`, `as Sentence` and `satisfies Sentence`. An outer Markdown code fence is accepted.

Type aliases are skipped as balanced syntax, not type-checked. Functions, calls, expressions, interpolation, spreads, imports and additional statements are rejected. The parser does not use `eval` or `Function`.

`SourceSyntaxError.line` and `.column` are one-based positions in the original input, including a code fence when present. `.offset` is a zero-based UTF-16 offset. Valid syntax with an invalid sentence shape throws `SentenceValidationError` instead.

### Validation

Construction and each generation run validate the complete input, including unselected and chance-skipped branches. `null` is allowed as a segment (including inside both sample kinds), but it is not allowed as a configuration value such as `chance` or `count`. Unknown properties, mixed segment shapes, invalid counts or chances, empty list samples, list entries other than strings or `null`, sparse arrays and circular samples are rejected with a source path. Shared non-circular subtrees are valid.

Validation permits at most 10 000 segment occurrences and 64 nested sample levels. The parser additionally limits input to 1 000 000 characters and 100 000 tokens. These limits apply without rewriting the supplied data.

## API

### TextSampler

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

#### Constructor

```ts
new TextSampler(sentence)
new TextSampler(sentence, 42)
new TextSampler(sentence, 'gallery')
new TextSampler(sentence, {seed: 42})
new TextSampler(sentence, {seed: 'gallery'})
```

The second argument is optional. When supplied, it is a `number`, a `string`, or a `TextSamplerOptions` object with a required `seed`. The constructor uses `tinyhand` to normalize the shorthand forms. `TextSamplerInput` is `tinyhand.Wrap<'seed', TextSamplerOptions>`.

The sentence is validated immediately and before each run. Construction and generation never mutate it. The instance retains the original sentence reference rather than cloning it, so valid caller edits affect subsequent runs; invalid edits are rejected before generation. Readonly and frozen sentences are supported. Constructor options are read once, not retained as mutable configuration.

#### Generation and tracing

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

#### Seed values

Numeric seeds are integers from `0` through `4294967295`, inclusive. Invalid numbers throw `RangeError`. String seeds may be empty and are case-sensitive: whitespace and Unicode are preserved without normalization, and a numeric-looking string is not coerced to a number. Strings are reduced to a stable unsigned 32-bit state using FNV-1a over UTF-16 code units; like any 32-bit hash, collisions are possible. Seeded runs do not use ambient randomness.

Other seed types, including `null`, throw `TypeError`. Supplying an options object without a valid `seed` also fails; omit the second argument to create an unseeded instance.

#### Additional exports

| Export | Result |
| --- | --- |
| `validateSentence(value)` | Return the same input after validation, typed as `Sentence`, without normalizing or copying it. |
| `SentenceValidationError` | A `TypeError` with a `path`, such as `sentence[2].items[0].chance`. |
| `parseSource(source)` from `text-sampler/parser` | Parse and validate literal sentence data without evaluating code. |
| `SourceSyntaxError` from `text-sampler/parser` | A `SyntaxError` with `offset`, `line` and `column`. |

The root exports the public types, including `Seed`, `TextSamplerOptions`, `TextSamplerInput`, `Sentence`, `Segment`, `SemanticSegment`, `Sample`, `CustomSample`, `ListSample`, `TextSegment`, `IndefiniteArticle`, `JoinSegment`, `SegmentMetadata`, `SegmentConfiguration`, `InnerJoiner`, `OuterJoiner` and `GenerationResult`.

## development

### Documentation and release

Maintain documentation in `docs/tldw/`. The root `readme.md` is generated; do not edit it directly. Run `bun run readme` to regenerate it.

`bun run build` regenerates the README and compiles ESM JavaScript with TypeScript declarations into `dist`. `prepack` invokes the same build automatically for npm packages. The tagged release workflow validates types, tests, lint and build before publishing.

For reproducible development installs, use `bun install --frozen-lockfile`.

### setting up

```sh
git clone git@github.com:Jaid/text-sampler.git
cd text-sampler
bun install
```

### linting

```sh
bun run lint
```

### type checking

```sh
bun run typecheck
```

### testing

```sh
bun run test
```

## license

[MIT License](https://github.com/Jaid/text-sampler/raw/HEAD/license.txt)<br>
Copyright © 2026, Jaid \<jaid.jsx@gmail.com> (https://github.com/jaid)

<!--
readme generated with tldw v9.9.0 from ./docs/tldw
github.com/Jaid/tldw
-->
