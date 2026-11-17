| Export | Result |
| --- | --- |
| `textSampler(sentence, seed)` (default export) | The generated string. |
| `generateSentence(sentence, seed)` | Text, fragments, sample selections and article resolutions. |
| `validateSentence(value)` | The same input after validation, typed as `Sentence`. Throws on invalid data; does not normalize or copy it. |
| `SentenceValidationError` | A `TypeError` with a `path`, such as `sentence[2].items[0].chance`. |
| `parseSource(source)` from `text-sampler/parser` | A validated sentence parsed from literal source text. |
| `SourceSyntaxError` from `text-sampler/parser` | A `SyntaxError` with `offset`, `line` and `column`. |

Seeds are required integers from `0` to `4294967295`, inclusive. An invalid seed throws `RangeError`. Each generation uses its own random state; calls do not affect one another and do not use `Math.random()`.

The root also exports the input and result types, including `Sentence`, `Segment`, `SemanticSegment`, `Sample`, `CustomSample`, `ListSample`, `TextSegment`, `IndefiniteArticle`, `JoinSegment`, `SegmentMetadata`, `SegmentConfiguration`, `InnerJoiner`, `OuterJoiner` and `GenerationResult`.
