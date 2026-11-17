export const TYPE_DEFINITIONS = "type Sentence = Segment[]\n\ntype Segment = string | SemanticSegment | null\n\ntype SemanticSegment = Sample | (SegmentMetadata & SegmentConfiguration & (IndefiniteArticle | TextSegment | JoinSegment))\n\ntype JoinSegment = {\n  joiner: string\n}\n\ntype IndefiniteArticle = {token: 'a'}\n\ntype TextSegment = {text: string, an?: boolean}\n\ntype SegmentMetadata = {\n  name?: string\n}\n\ntype SegmentConfiguration = {\n  prefix?: OuterJoiner\n  suffix?: OuterJoiner\n  /**\n   * Percentage chance of this segment being included.\n   * @default 100\n   */\n  chance?: number\n}\n\ntype InnerJoiner = string | {\n  between: string\n  first?: string\n  last?: string\n}\n\ntype Sample = CustomSample | ListSample\ntype ListSample = (string | null)[]\ntype CustomSample = SegmentMetadata & SegmentConfiguration & {\n  /**\n   * @default {between: ', ', last: ' and '}\n   */\n  joiner?: InnerJoiner\n  items: Segment[]\n  /**\n   * @default 1\n   */\n  count?: number | {\n    min: number\n    max: number\n  }\n}\n\ntype OuterJoiner = string | {\n  text: string\n  merge?: boolean\n}"

export const EXAMPLES = [
  {
    id: 'fallbacks',
    label: 'Safety-net joiners',
    source: "const sentence = [\n  {name: 'opening', text: 'Paint'},\n  {name: 'opening_gap', joiner: ' '},\n  {name: 'article', token: 'a'},\n  {name: 'before_quality', joiner: ' '},\n  {\n    name: 'quality',\n    prefix: ' ',\n    suffix: ' ',\n    items: [\n      {name: 'elegant_choice', text: 'elegant'},\n      'vivid',\n      'honest'\n    ],\n    chance: 50\n  },\n  {name: 'after_quality', joiner: ' '},\n  {name: 'canvas', text: 'painting', suffix: '.'}\n]",
  },
  {
    id: 'articles',
    label: 'Articles & optional words',
    source: "const sentence = [\n  'Paint ',\n  {token: 'a'},\n  ' ',\n  {\n    name: 'adjective',\n    suffix: ' ',\n    items: [\n      'elegant',\n      'bold',\n      'honest',\n      {text: 'unique', an: false},\n      {text: 'FBI-inspired', an: true}\n    ],\n    count: {min: 0, max: 1}\n  },\n  {\n    name: 'subject',\n    items: ['abstract landscape', 'portrait', 'oil painting']\n  },\n  '.'\n]",
  },
  {
    id: 'joiners',
    label: 'First & last joiners',
    source: "const sentence = [\n  {\n    name: 'palette',\n    prefix: 'Mix ',\n    suffix: '.',\n    joiner: {\n      between: ', ',\n      first: ' with ',\n      last: ' and '\n    },\n    items: ['ochre', 'ultramarine', 'umber', 'vermilion', 'viridian'],\n    count: {min: 2, max: 4}\n  }\n]",
  },
  {
    id: 'boundaries',
    label: 'Boundary merging',
    source: "const sentence = [\n  // A single merge: false still allows the shared space to merge.\n  {\n    name: 'opening',\n    suffix: {text: ' ', merge: false},\n    items: [{name: 'opening_text', text: 'Create'}]\n  },\n  {\n    name: 'article_and_style',\n    prefix: ' ',\n    suffix: ' ',\n    joiner: ' ',\n    items: [{text: 'an expressive'}, {text: 'a bold'}]\n  },\n  {\n    name: 'subject',\n    prefix: {text: ' ', merge: true},\n    items: ['painting', 'composition']\n  },\n  // Both flags are false, so both copies of the space remain.\n  {\n    name: 'palette_intro',\n    prefix: ' in ',\n    suffix: {text: ' ', merge: false},\n    items: ['rich', 'muted']\n  },\n  {\n    name: 'palette',\n    prefix: {text: ' ', merge: false},\n    suffix: '.',\n    items: [{name: 'palette_word', text: 'colors'}]\n  }\n]",
  },
  {
    id: 'nested',
    label: 'Nested samples',
    source: "const sentence = [\n  'Create ',\n  {token: 'a'},\n  ' ',\n  {\n    name: 'direction',\n    items: [\n      {\n        name: 'paint',\n        suffix: ' painting',\n        items: ['impasto', 'watercolor', 'oil']\n      },\n      {\n        name: 'drawing',\n        suffix: ' sketch',\n        items: ['ink', 'charcoal', 'pencil']\n      },\n      {text: 'unified composition', an: false}\n    ]\n  },\n  {\n    name: 'palette',\n    prefix: ' in ',\n    items: ['amber', 'indigo', 'ivory', 'jade'],\n    count: {min: 0, max: 3}\n  },\n  '.'\n]",
  },
  {
    id: 'typescript',
    label: 'Full TypeScript',
    source: "type Sentence = Segment[]\n\ntype Segment = string | SemanticSegment | null\n\ntype SemanticSegment = Sample | (SegmentMetadata & SegmentConfiguration & (IndefiniteArticle | TextSegment | JoinSegment))\n\ntype JoinSegment = {\n  joiner: string\n}\n\ntype IndefiniteArticle = {token: 'a'}\n\ntype TextSegment = {text: string, an?: boolean}\n\ntype SegmentMetadata = {\n  name?: string\n}\n\ntype SegmentConfiguration = {\n  prefix?: OuterJoiner\n  suffix?: OuterJoiner\n  /**\n   * Percentage chance of this segment being included.\n   * @default 100\n   */\n  chance?: number\n}\n\ntype InnerJoiner = string | {\n  between: string\n  first?: string\n  last?: string\n}\n\ntype Sample = CustomSample | ListSample\ntype ListSample = (string | null)[]\ntype CustomSample = SegmentMetadata & SegmentConfiguration & {\n  /**\n   * @default {between: ', ', last: ' and '}\n   */\n  joiner?: InnerJoiner\n  items: Segment[]\n  /**\n   * @default 1\n   */\n  count?: number | {\n    min: number\n    max: number\n  }\n}\n\ntype OuterJoiner = string | {\n  text: string\n  merge?: boolean\n}\n\nconst sentence: Sentence = [\n  {name: 'instruction', text: 'Make', suffix: ' ', chance: 100},\n  {name: 'article', token: 'a', prefix: ' ', suffix: ' ', chance: 100},\n  {\n    name: 'style',\n    prefix: ' ',\n    suffix: {text: ' ', merge: true},\n    items: [\n      {name: 'expressive_style', text: 'expressive', chance: 100},\n      'beautiful',\n      {text: 'unique', an: false, chance: 100}\n    ],\n    count: 1,\n    chance: 50\n  },\n  {name: 'gap', joiner: ' ', chance: 100},\n  {\n    name: 'subject',\n    text: 'painting',\n    prefix: ' ',\n    suffix: '.',\n    chance: 100\n  }\n]",
  },
]
