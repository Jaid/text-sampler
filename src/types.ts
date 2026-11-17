/**
 * A segment's original indices in the sentence and nested sample item arrays.
 */
export type SegmentId = ReadonlyArray<number>

export interface SegmentMetadata {
  readonly name?: string | undefined
}

export interface SegmentConfiguration {
  /**
   * Inclusion probability from 0 to 100.
   * @default 100
   */
  readonly chance?: number | undefined
  readonly prefix?: OuterJoiner | undefined
  readonly suffix?: OuterJoiner | undefined
}

export type OuterJoiner = {
  /**
   * Equal adjacent affixes merge unless both explicitly disable it.
   * @default true
   */
  readonly merge?: boolean | undefined
  readonly text: string
} | string

export type InnerJoiner = {
  readonly between: string
  readonly first?: string | undefined
  readonly last?: string | undefined
} | string

export type SampleCount = {
  readonly max: number
  readonly min: number
} | number

/**
 * A configurable sample of nested segments.
 */
export interface CustomSample extends SegmentConfiguration, SegmentMetadata {
  /**
   * Samples distinct item positions in random order.
   * @default 1
   */
  readonly count?: SampleCount | undefined
  readonly items: ReadonlyArray<Segment>
  /**
   * @default {between: ', ', last: ' and '}
   */
  readonly joiner?: InnerJoiner | undefined
}

/**
 * A shorthand sample that chooses one string from the list.
 */
export type ListSample = ReadonlyArray<string>

/**
 * A configurable sample or a shorthand string list.
 */
export type Sample = CustomSample | ListSample

export interface IndefiniteArticle extends SegmentConfiguration, SegmentMetadata {
  readonly token: 'a'
}

export interface TextSegment extends SegmentConfiguration, SegmentMetadata {
  /**
   * Override the article heuristic when this text supplies the next word.
   */
  readonly an?: boolean | undefined
  readonly text: string
}

export interface JoinSegment extends SegmentConfiguration, SegmentMetadata {
  /**
   * Fallback text emitted only between surviving body content.
   */
  readonly joiner: string
}

export type SemanticSegment = IndefiniteArticle | JoinSegment | Sample | TextSegment

export type Segment = SemanticSegment | string
export type Sentence = ReadonlyArray<Segment>

export interface SegmentReference {
  readonly id: SegmentId
  readonly name?: string
}

export type FragmentPart = 'article' | 'joiner' | 'prefix' | 'suffix' | 'text'

export interface FragmentSource extends SegmentReference {
  /**
   * Parent samples from outermost to innermost, excluding this fragment's owner.
   */
  readonly ancestors: ReadonlyArray<SegmentReference>
  readonly part: FragmentPart
}

export interface Fragment extends FragmentSource {
  /**
   * Additional owners whose equal boundary text was merged into this fragment.
   */
  readonly contributors?: ReadonlyArray<FragmentSource>
  readonly text: string
}

export interface SampleSelection extends SegmentReference {
  readonly available: number
  /**
   * Selected positions before filtering children by their own chance.
   */
  readonly count: number
  /**
   * Selected items' emitted contributions, including empty skipped items.
   */
  readonly items: ReadonlyArray<string>
  /**
   * Falls back to the source path when the sample has no name.
   */
  readonly name: string
  readonly path: string
  readonly skipReason?: 'chance'
  readonly text: string
}

export interface ArticleResolution extends SegmentReference {
  readonly article: 'a' | 'an'
  readonly nextWord: string
  readonly path: string
}

export interface GenerationResult {
  readonly articleResolutions: ReadonlyArray<ArticleResolution>
  /**
   * Concatenating fragment text reproduces text exactly.
   */
  readonly fragments: ReadonlyArray<Fragment>
  readonly selections: ReadonlyArray<SampleSelection>
  readonly text: string
}
