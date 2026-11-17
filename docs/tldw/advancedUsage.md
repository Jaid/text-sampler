# Inspecting output

`generateSentence` returns:

| Field | Meaning |
| --- | --- |
| `text` | Exact generated text. |
| `fragments` | Emitted text with original IDs, names, ancestry and boundary contributors. |
| `selections` | Samples visited, the requested count, selected item output and any chance skip. |
| `articleResolutions` | Each article's final `a`/`an` value and the following word. |

## Segment IDs and names

IDs are zero-based arrays of **original input indices**, never positions in the randomized output. A top-level literal uses `[0]`; an item at index `3` inside the sample at index `2` uses `[2, 3]`. Deeper nesting adds indices. A `ListSample` at `[2]` emits its chosen string with an ID such as `[2, 1]`, while its selection diagnostics use `[2]`. A selected `null` has no output fragment; the sample selection still reports `count: 1` and `items: ['']`.

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

## Selection diagnostics

Selections are reported in traversal order, with a parent before its visited children. `path` is a readable source path such as `sentence[1].items[2]`. `name` falls back to that path when the sample has no name.

`count` is the number of positions selected before child chance filtering. `items` contains their final text contributions in sampled order and can contain empty strings for omitted or absorbed output. `text` contains that sample's final emitted contribution, including surviving affixes. A sample skipped by chance has `skipReason: 'chance'`, a count of zero and no visited child selections.

# Parsing editor input

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

Supported input includes nested list samples, JSON, single-quoted strings, unquoted object keys, comments, trailing commas and a `const sentence = […]` declaration. A declaration may include a type annotation, preceding non-generic type aliases, `as const`, `as Sentence` and `satisfies Sentence`. An outer Markdown code fence is accepted.

Type aliases are skipped as balanced syntax, not type-checked. Functions, calls, expressions, interpolation, spreads, imports and additional statements are rejected. The parser does not use `eval` or `Function`.

`SourceSyntaxError.line` and `.column` are one-based positions in the original input, including a code fence when present. `.offset` is a zero-based UTF-16 offset. Valid syntax with an invalid sentence shape throws `SentenceValidationError` instead.

# Validation

Generation validates the complete input, including unselected and chance-skipped branches. `null` is allowed as a segment (including inside both sample kinds), but it is not allowed as a configuration value such as `chance` or `count`. Unknown properties, mixed segment shapes, invalid counts or chances, empty list samples, list entries other than strings or `null`, sparse arrays and circular samples are rejected with a source path. Shared non-circular subtrees are valid.

Validation permits at most 10 000 segment occurrences and 64 nested sample levels. The parser additionally limits input to 1 000 000 characters and 100 000 tokens. These limits apply without rewriting the supplied data.
