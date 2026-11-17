import type {
  ArticleResolution,
  CustomSample,
  Fragment,
  FragmentSource,
  GenerationResult,
  IndefiniteArticle,
  JoinSegment,
  ListSample,
  OuterJoiner,
  SampleSelection,
  Segment,
  SegmentConfiguration,
  SegmentId,
  SegmentReference,
  Sentence,
  TextSegment,
} from './types.ts'

import {resolveIndefiniteArticle} from './article.ts'
import {seededRandom} from './internal.ts'
import {validateSentence} from './validate.ts'

interface Identity extends SegmentReference {
  readonly ancestors: ReadonlyArray<SegmentReference>
  readonly path: string
}
interface LiteralNode extends Identity {
  readonly kind: 'literal'
  readonly text: string
}
interface ArticleNode extends Identity {
  readonly kind: 'article'
  readonly segment: IndefiniteArticle
  readonly text: ''
}
interface TextNode extends Identity {
  readonly an?: boolean
  readonly kind: 'text'
  readonly segment: TextSegment
  readonly text: string
}
interface ConditionalJoinerNode extends Identity {
  active: boolean
  readonly kind: 'conditionalJoiner'
  readonly segment: JoinSegment
  readonly text: string
}
interface SampleNode extends Identity {
  readonly children: ReadonlyArray<RealizedNode | null>
  readonly kind: 'sample'
  readonly pending: PendingSelection
  readonly segment: CustomSample
}

type LeafNode = ArticleNode | ConditionalJoinerNode | LiteralNode | TextNode
type RealizedNode = LeafNode | SampleNode

interface PieceBase extends Identity {
  contributors?: Array<FragmentSource>
  suppressed?: boolean
  text: string
}
interface TextPiece extends PieceBase {
  readonly an?: boolean
  readonly kind: 'text'
}
interface ArticlePiece extends PieceBase {
  readonly kind: 'article'
  text: '' | 'a' | 'an'
}
interface AffixPiece extends PieceBase {
  readonly kind: 'prefix' | 'suffix'
  readonly merge: boolean
  merged?: boolean
}
interface JoinerPiece extends PieceBase {
  readonly kind: 'conditionalJoiner' | 'innerJoiner'
}

type Piece = AffixPiece | ArticlePiece | JoinerPiece | TextPiece

interface PendingSelection extends Identity {
  readonly available: number
  readonly count: number
  itemPieces: Array<Array<Piece>>
  readonly name: string
  pieces: Array<Piece>
  readonly skipReason?: 'chance'
}

type MutableFragment = Omit<Fragment, 'text'> & {text: string}

/**
 * Generate exact text and source provenance from an unsigned 32-bit seed.
 */
export function generateSentence(sentence: Sentence, seed: number): GenerationResult {
  validateSentence(sentence)
  if (!Number.isInteger(seed) || seed < 0 || seed > 4_294_967_295) {
    throw new RangeError('Seed must be an integer from 0 to 4294967295.')
  }
  const random = seededRandom(seed)
  const pendingSelections: Array<PendingSelection> = []
  const leaves: Array<LeafNode> = []
  function realize(segment: Segment, path: string, id: SegmentId, ancestors: ReadonlyArray<SegmentReference>): RealizedNode | null {
    if (segment === null) {
      return null
    }
    if (typeof segment === 'string') {
      const node: LiteralNode = {
        ...identity(path, id, ancestors),
        kind: 'literal',
        text: segment,
      }
      leaves.push(node)
      return node
    }
    // List samples share the exact sampling path, but carry no configuration.
    if (isListSample(segment)) {
      segment = {items: segment}
    }
    const source = identity(path, id, ancestors, segment.name)
    const chance = segment.chance ?? 100
    const included = chance === 100 || chance !== 0 && random() * 100 < chance
    if (!included) {
      if ('items' in segment) {
        pendingSelections.push({
          ...source,
          name: segment.name ?? path,
          count: 0,
          available: segment.items.length,
          itemPieces: [],
          pieces: [],
          skipReason: 'chance',
        })
      }
      return null
    }
    if ('items' in segment) {
      const requestedCount = segment.count ?? 1
      const range = typeof requestedCount === 'number' ? {
        min: requestedCount,
        max: requestedCount,
      } : requestedCount
      const count = range.min === range.max ? range.min : range.min + Math.floor(random() * (range.max - range.min + 1))
      const indices = Array.from({length: segment.items.length}, (_, index) => index)
      for (let index = 0; index < count; index++) {
        const next = index + Math.floor(random() * (indices.length - index));
        // Validation and the bounded random value keep both indices in range.
        [indices[index], indices[next]] = [indices[next]!, indices[index]!]
      }
      const pending: PendingSelection = {
        ...source,
        name: segment.name ?? path,
        count,
        available: segment.items.length,
        itemPieces: [],
        pieces: [],
      }
      pendingSelections.push(pending)
      const parent: SegmentReference = {
        id,
        ...segment.name === undefined ? {} : {name: segment.name},
      }
      const children = indices.slice(0, count).map(index => realize(segment.items[index]!, `${path}.items[${index}]`, [...id, index], [...ancestors, parent]))
      return {
        ...source,
        kind: 'sample',
        segment,
        children,
        pending,
      }
    }
    if ('token' in segment) {
      const node: ArticleNode = {
        ...source,
        kind: 'article',
        segment,
        text: '',
      }
      leaves.push(node)
      return node
    }
    if ('text' in segment) {
      const node: TextNode = {
        ...source,
        kind: 'text',
        segment,
        text: segment.text,
        an: segment.an,
      }
      leaves.push(node)
      return node
    }
    const node: ConditionalJoinerNode = {
      ...source,
      kind: 'conditionalJoiner',
      segment,
      text: segment.joiner,
      active: false,
    }
    leaves.push(node)
    return node
  }
  const roots = sentence.map((segment, index) => realize(segment, `sentence[${index}]`, [index], []))
  const anchors = leaves.map((node, index) => (node.kind !== 'conditionalJoiner' && (node.kind === 'article' || node.text.length > 0) ? index : -1)).filter(index => index !== -1)
  const firstAnchor = anchors[0] ?? -1
  const lastAnchor = anchors.at(-1) ?? -1
  for (const [index, node] of leaves.entries()) {
    if (node.kind === 'conditionalJoiner') {
      node.active = node.text.length > 0 && index > firstAnchor && index < lastAnchor
    }
  }
  function render(node: RealizedNode | null): Array<Piece> {
    if (!node) {
      return []
    }
    switch (node.kind) {
      case 'literal': { return [{
        ...pieceBase(node, node.text),
        kind: 'text',
      }] }
      case 'article': { return applyConfiguration(node, [{
        ...pieceBase(node, ''),
        kind: 'article',
        text: '',
      }]) }
      case 'text': { return applyConfiguration(node, [{
        ...pieceBase(node, node.text),
        kind: 'text',
        an: node.an,
      }]) }
      case 'conditionalJoiner': { return node.active ? applyConfiguration(node, [{
        ...pieceBase(node, node.text),
        kind: 'conditionalJoiner',
      }]) : [] }
      case 'sample': {
        const pending = node.pending
        pending.itemPieces = node.children.map(render)
        const nonempty = pending.itemPieces.filter(hasContent)
        const body: Array<Piece> = []
        const joiner = node.segment.joiner ?? {
          between: ', ',
          last: ' and ',
        }
        for (const [index, item] of nonempty.entries()) {
          if (index) {
            let boundary: string
            if (typeof joiner === 'string') {
              boundary = joiner
            } else if (index === nonempty.length - 1 && joiner.last !== undefined) {
              boundary = joiner.last
            } else if (index === 1 && joiner.first !== undefined) {
              boundary = joiner.first
            } else {
              boundary = joiner.between
            }
            body.push({
              ...pieceBase(node, boundary),
              kind: 'innerJoiner',
            })
          }
          body.push(...item)
        }
        pending.pieces = applyConfiguration(node, body)
        return pending.pieces
      }
    }
  }
  const renderedPieces = roots.flatMap(render).filter(piece => piece.kind === 'article' || piece.text.length > 0)
  const coalesced: Array<Piece> = []
  for (const piece of renderedPieces) {
    const previous = coalesced.at(-1)
    if (previous?.kind === 'conditionalJoiner' && piece.kind === 'conditionalJoiner' && previous.text === piece.text) {
      absorb(previous, piece)
    } else {
      coalesced.push(piece)
    }
  }
  // Only a neighboring segment's facing outer affix can absorb a fallback.
  for (let index = 0; index < coalesced.length; index++) {
    const piece = coalesced[index]!
    if (piece.kind !== 'conditionalJoiner' || piece.suppressed) {
      continue
    }
    let left = index - 1
    let right = index + 1
    while (left >= 0 && coalesced[left]?.suppressed) {
      left--
    }
    while (right < coalesced.length && coalesced[right]?.suppressed) {
      right++
    }
    const previous = coalesced[left]
    const next = coalesced[right]
    if (previous?.kind === 'suffix' && previous.merge && previous.text === piece.text) {
      absorb(previous, piece)
    } else if (next?.kind === 'prefix' && next.merge && next.text === piece.text) {
      absorb(next, piece)
    }
  }
  const pieces: Array<Piece> = []
  for (const piece of coalesced) {
    if (piece.suppressed) {
      continue
    }
    const previous = pieces.at(-1)
    if (previous?.kind === 'suffix' && piece.kind === 'prefix'
        && !previous.merged && previous.text === piece.text && (previous.merge || piece.merge)) {
      // Each affix participates once. Nested prefixes/suffixes remain separate.
      previous.merged = true
      absorb(previous, piece)
    } else {
      pieces.push(piece)
    }
  }
  const articleResolutions: Array<ArticleResolution> = []
  for (let index = pieces.length - 1; index >= 0; index--) {
    const piece = pieces[index]!
    if (piece.kind !== 'article') {
      continue
    }
    const {article, nextWord} = resolveIndefiniteArticle(pieces, index + 1)
    piece.text = article
    articleResolutions.push({
      path: piece.path,
      id: piece.id,
      ...piece.name === undefined ? {} : {name: piece.name},
      article,
      nextWord,
    })
  }
  articleResolutions.reverse()
  const selections: Array<SampleSelection> = pendingSelections.map(({path, id, name, count, available, itemPieces, pieces: selectedPieces, skipReason}) => ({
    path,
    id,
    name,
    count,
    available,
    items: itemPieces.map(combine),
    text: combine(selectedPieces),
    ...skipReason === undefined ? {} : {skipReason},
  }))
  const fragments: Array<MutableFragment> = []
  let previousKey: string | undefined
  for (const piece of pieces) {
    if (!piece.text.length) {
      continue
    }
    const source = {
      ...provenance(piece),
      ...piece.contributors?.length ? {contributors: piece.contributors} : {},
    }
    const key = JSON.stringify(source)
    const previous = fragments.at(-1)
    if (previous && key === previousKey) {
      previous.text += piece.text
    } else {
      fragments.push({
        text: piece.text,
        ...source,
      })
    }
    previousKey = key
  }
  return {
    text: fragments.map(fragment => fragment.text).join(''),
    selections,
    articleResolutions,
    fragments,
  }
}
function isListSample(segment: Segment): segment is ListSample {
  return Array.isArray(segment)
}
function identity(path: string, id: SegmentId, ancestors: ReadonlyArray<SegmentReference>, name?: string): Identity {
  return {
    path,
    id,
    ancestors,
    ...name === undefined ? {} : {name},
  }
}
function pieceBase(node: Identity, text: string): PieceBase {
  return {
    ...identity(node.path, node.id, node.ancestors, node.name),
    text,
  }
}
function affixPiece(node: Identity, value: OuterJoiner | undefined, kind: 'prefix' | 'suffix'): AffixPiece {
  return {
    ...pieceBase(node, typeof value === 'string' ? value : value?.text ?? ''),
    kind,
    merge: typeof value === 'string' || value?.merge !== false,
  }
}
function hasContent(pieces: ReadonlyArray<Piece>): boolean {
  return pieces.some(piece => piece.kind === 'article' || piece.text.length > 0)
}
function applyConfiguration(node: Identity & {readonly segment: SegmentConfiguration}, body: Array<Piece>): Array<Piece> {
  return hasContent(body) ? [
    affixPiece(node, node.segment.prefix, 'prefix'),
    ...body,
    affixPiece(node, node.segment.suffix, 'suffix'),
  ] : []
}
function provenance(piece: Piece): FragmentSource {
  return {
    id: piece.id,
    ...piece.name === undefined ? {} : {name: piece.name},
    part: piece.kind === 'conditionalJoiner' || piece.kind === 'innerJoiner' ? 'joiner' : piece.kind,
    ancestors: piece.ancestors,
  }
}
function absorb(target: Piece, source: Piece): void {
  source.suppressed = true
  const contributors = [...target.contributors ?? [], provenance(source), ...source.contributors ?? []]
  const seen = new Set([JSON.stringify(provenance(target))])
  target.contributors = contributors.filter(value => {
    const key = JSON.stringify(value)
    if (seen.has(key)) {
      return false
    }
    seen.add(key)
    return true
  })
}
function combine(pieces: ReadonlyArray<Piece>): string {
  return pieces.filter(piece => !piece.suppressed).map(piece => piece.text).join('')
}
