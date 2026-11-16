# text-sampler

Compose reproducible text from nested choices, optional segments and exact joining rules. Supply a sentence and a seed to get a string, or inspect every emitted fragment with its original segment ID and names.

The package has no runtime dependencies. It ships JavaScript ES modules and TypeScript declarations for Node.js, Bun and browser bundlers. Parsing editable source is available separately through `text-sampler/parser`.

## Install

```sh
npm install text-sampler
```

## Quick start

```ts
import textSampler, {generateSentence, type Sentence} from 'text-sampler'

const sentence = [
  'Please make ',
  {token: 'a', suffix: ' '},
  {
    name: 'qualities',
    items: ['elegant', 'detailed', 'luminous'],
    count: {min: 0, max: 2},
    joiner: ' ',
    suffix: ' ',
  },
  {name: 'medium', items: ['oil painting', 'artwork']},
] as const satisfies Sentence

const seed = 42
const text = textSampler(sentence, seed)
const result = generateSentence(sentence, seed)

console.log(text)
console.log(result.fragments)
```

The same sentence and seed produce the same complete result. Change the seed to reroll. Inputs are never modified, so the same readonly or frozen sentence can be reused.

The full art prompt from the playground is in [examples/gallery.ts](https://github.com/Jaid/text-sampler/blob/main/examples/gallery.ts).

## API

| Export | Result |
| --- | --- |
| `textSampler(sentence, seed)` (default export) | The generated string. |
| `generateSentence(sentence, seed)` | Text, fragments, sample selections and article resolutions. |
| `validateSentence(value)` | The same input after validation, typed as `Sentence`. Throws on invalid data; does not normalize or copy it. |
| `SentenceValidationError` | A `TypeError` with a `path`, such as `sentence[2].items[0].chance`. |
| `parseSource(source)` from `text-sampler/parser` | A validated sentence parsed from literal source text. |
| `SourceSyntaxError` from `text-sampler/parser` | A `SyntaxError` with `offset`, `line` and `column`. |

Seeds are required integers from `0` to `4294967295`, inclusive. An invalid seed throws `RangeError`. Each generation uses its own random state; calls do not affect one another and do not use `Math.random()`.

The root also exports the input and result types, including `Sentence`, `Segment`, `SemanticSegment`, `Sample`, `TextSegment`, `IndefiniteArticle`, `JoinSegment`, `SegmentMetadata`, `SegmentConfiguration`, `InnerJoiner`, `OuterJoiner` and `GenerationResult`.

## Sentence data

A `Sentence` is a readonly array of segments. Sample `items` are readonly arrays too, so plain arrays and `as const satisfies Sentence` both work.

| Segment | Meaning |
| --- | --- |
| `'literal text'` | Emit exactly this string. |
| `{text: 'apple'}` | Emit text with optional metadata, configuration and an article hint. |
| `{items: ['A', 'B']}` | Sample nested segments without replacement. |
| `{token: 'a'}` | Emit `a` or `an` based on the next emitted word. |
| `{joiner: ' '}` | Emit a fallback separator when body content survives on both sides. |

Every object segment accepts `name`, `prefix`, `suffix` and `chance`. A primitive string is always literal; wrap it in `{text: '…'}` to attach these properties.

### Defaults

| Property | Default |
| --- | --- |
| `Sample.count` | `1` |
| `Sample.joiner` | `{between: ', ', last: ' and '}` |
| `SegmentConfiguration.chance` | `100` |
| `prefix` and `suffix` | No affix. |
| `OuterJoiner.merge` | `true` |
| `TextSegment.an` | Infer the article from the emitted word. |

Properties with defaults are optional in the public types. Explicit `undefined` is treated as omission for optional properties. `null` is invalid. `SegmentConfiguration` applies to every semantic segment, including articles, text and fallback joiners.

### Samples and counts

```ts
const sample = {
  name: 'colors',
  items: ['red', 'green', 'blue'],
  count: {min: 0, max: 2},
  joiner: {between: ', ', last: ' and '},
}
```

`count` is a nonnegative integer or an inclusive `{min, max}` range. A sample chooses distinct **positions** in random order. If two positions contain equal strings, both can be chosen. Nested samples are allowed.

The maximum count must not exceed `items.length`. To represent an empty pool, use `{items: [], count: 0}`. A fixed count of zero emits nothing, including no prefix or suffix.

Inner joiners are inserted only between surviving child outputs. A string supplies every gap. For an object joiner, `first` replaces the first gap and `last` replaces the final gap; `last` takes precedence when there are exactly two outputs. Empty outputs do not leave stray inner separators.

### Inclusion chance

```ts
const sentence = [
  'A',
  {text: ' vivid', chance: 50},
  ' painting',
] satisfies Sentence
```

`chance` is a finite percentage from `0` to `100`, including fractional values. A failed chance omits the whole segment and its affixes. A skipped sample does not roll any of its children.

Chance is evaluated before a segment's count and choices. The endpoints `0` and `100` do not consume random draws. Selected children that fail their own chance are not replaced with other items; a sample's count describes selected positions, not a guaranteed number of emitted outputs.

The random stream follows sentence order and selected child order. Editing an earlier random choice can change later choices for the same seed. Segment names are metadata and do not influence randomness.

## Joining without normalization

Text is concatenated exactly. The library does not trim output, collapse spaces, insert spaces around words or change punctuation. Leading, repeated and trailing whitespace in literal text is preserved. A whitespace-only body is meaningful output.

Prefixes and suffixes appear only when their segment emits a body. They accept either a string or `{text: string, merge?: boolean}`.

```ts
textSampler([
  {text: 'A', suffix: ' '},
  {text: 'B', prefix: ' '},
], 0) // 'A B'
```

An adjoining suffix and prefix with **equal complete strings** merge into one unless both explicitly set `merge: false`. An omitted `merge` is `true`. Empty or skipped segments expose the next surviving boundary.

```ts
textSampler([
  {text: 'A', suffix: {text: ' ', merge: false}},
  {text: 'B', prefix: {text: ' ', merge: false}},
], 0) // 'A  B'
```

Only a suffix followed by a prefix can merge. Literal whitespace blocks that adjacency. Nested prefix–prefix or suffix–suffix pairs remain distinct, and an affix participates in an outer merge only once.

### Fallback joiners

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

## Indefinite articles

`{token: 'a'}` resolves after selection and joining. It looks ahead to the first emitted word, skipping punctuation and omitted segments. Words can span fragments.

```ts
textSampler([{token: 'a', suffix: ' '}, 'apple'], 0) // 'an apple'
textSampler([{token: 'a', suffix: ' '}, 'university'], 0) // 'a university'
textSampler([{token: 'a', suffix: ' '}, {text: 'SQL query', an: true}], 0) // 'an SQL query'
```

The English heuristic handles common silent consonants, vowel sounds and initialisms. It is not a pronunciation dictionary. Use `an: true` or `an: false` on a `TextSegment` for deliberate or ambiguous pronunciation. The hint applies to that text body; a preceding word emitted by its prefix determines the article first. With no following word, the token emits `a`.

## Inspecting output

`generateSentence` returns:

| Field | Meaning |
| --- | --- |
| `text` | Exact generated text. |
| `fragments` | Emitted text with original IDs, names, ancestry and boundary contributors. |
| `selections` | Samples visited, the requested count, selected item output and any chance skip. |
| `articleResolutions` | Each article's final `a`/`an` value and the following word. |

### Segment IDs and names

IDs are zero-based arrays of **original input indices**, never positions in the randomized output. A top-level literal uses `[0]`; an item at index `3` inside the sample at index `2` uses `[2, 3]`. Deeper nesting adds indices.

```ts
const result = generateSentence([
  'Please ',
  {name: 'action', items: [{name: 'verb', text: 'paint'}]},
], 0)

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

### Selection diagnostics

Selections are reported in traversal order, with a parent before its visited children. `path` is a readable source path such as `sentence[1].items[2]`. `name` falls back to that path when the sample has no name.

`count` is the number of positions selected before child chance filtering. `items` contains their final text contributions in sampled order and can contain empty strings for omitted or absorbed output. `text` contains that sample's final emitted contribution, including surviving affixes. A sample skipped by chance has `skipReason: 'chance'`, a count of zero and no visited child selections.

## Parsing editor input

Ordinary callers pass sentence data directly. The optional parser accepts editable literal source without executing it:

```ts
import {generateSentence} from 'text-sampler'
import {parseSource, SourceSyntaxError} from 'text-sampler/parser'

try {
  const sentence = parseSource(`
    const sentence = [
      'Please ',
      {items: ['paint', 'draw'], suffix: ' something'},
    ]
  `)
  console.log(generateSentence(sentence, 42).text)
} catch (error) {
  if (error instanceof SourceSyntaxError) {
    console.error(error.line, error.column, error.message)
  }
  throw error
}
```

Supported input includes JSON, single-quoted strings, unquoted object keys, comments, trailing commas and a `const sentence = […]` declaration. A declaration may include a type annotation, preceding non-generic type aliases, `as const`, `as Sentence` and `satisfies Sentence`. An outer Markdown code fence is accepted.

Type aliases are skipped as balanced syntax, not type-checked. Functions, calls, expressions, interpolation, spreads, imports and additional statements are rejected. The parser does not use `eval` or `Function`.

`SourceSyntaxError.line` and `.column` are one-based positions in the original input, including a code fence when present. `.offset` is a zero-based UTF-16 offset. Valid syntax with an invalid sentence shape throws `SentenceValidationError` instead.

## Validation

Generation validates the complete input, including unselected and chance-skipped branches. Unknown properties, mixed segment shapes, invalid counts or chances, sparse arrays and circular samples are rejected with a source path. Shared non-circular subtrees are valid.

Validation permits at most 10 000 segment occurrences and 64 nested sample levels. The parser additionally limits input to 1 000 000 characters and 100 000 tokens. These limits apply without rewriting the supplied data.

## Development

```sh
bun install --frozen-lockfile
bun run typecheck
bun test
bun run lint
bun run build
```

`build` emits JavaScript and declarations into `dist`. `prepack` builds the publishable package. The existing release workflow tests and checks the package before publishing on a `v*` tag.

## License

MIT. See [license.txt](license.txt).
