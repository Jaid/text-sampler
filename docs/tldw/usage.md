# Sentence data

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

## Defaults

| Property | Default |
| --- | --- |
| `CustomSample.count` | `1` |
| `CustomSample.joiner` | `{between: ', ', last: ' and '}` |
| `SegmentConfiguration.chance` | `100` |
| `prefix` and `suffix` | No affix. |
| `OuterJoiner.merge` | `true` |
| `TextSegment.an` | Infer the article from the emitted word. |

Properties with defaults are optional in the public types. Explicit `undefined` is treated as omission for optional properties. `null` is invalid for configuration properties, but valid as an empty segment. `SegmentConfiguration` applies to all object-style semantic segments, including custom samples, articles, text and fallback joiners. List samples have no configuration.

## List samples

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

## Custom samples and counts

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

## Inclusion chance

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

# Joining without normalization

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

## Fallback joiners

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

# Indefinite articles

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
