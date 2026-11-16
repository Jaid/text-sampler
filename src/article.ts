interface PhoneticPiece {
  readonly an?: boolean
  readonly text: string
}
const lexicalStart = /[\p{L}\p{N}]/u
const lexicalContinuation = /^[\p{L}\p{N}'\-.’]*/u
const wordAcronyms = new Set([
  'NASA',
  'NATO',
  'UNESCO',
  'UNICEF',
  'LASER',
  'RADAR',
  'SCUBA',
  // eslint-disable-next-line unicorn/text-encoding-identifier-case -- This is a spoken uppercase acronym, not an encoding identifier.
  'ASCII',
  'GIF',
  'JPEG',
  'JSON',
  'PIN',
  'RAM',
  'ROM',
  'SARS',
  'SCSI',
])
export function resolveIndefiniteArticle(pieces: ReadonlyArray<PhoneticPiece>, start: number): {
  article: 'a' | 'an'
  nextWord: string
} {
  let word = ''
  let hint: boolean | undefined
  for (let index = start; index < pieces.length; index++) {
    const piece = pieces[index]!
    let value = piece.text
    if (!word) {
      const match = lexicalStart.exec(value)
      if (!match) {
        continue
      }
      value = value.slice(match.index)
      hint = piece.an
    }
    const continuation = lexicalContinuation.exec(value)?.[0] ?? ''
    word += continuation
    if (continuation.length < value.length || word.length >= 128) {
      break
    }
  }
  const nextWord = word.replace(/['\-.’]+$/, '')
  return {
    article: hint ?? prefersAn(nextWord) ? 'an' : 'a',
    nextWord,
  }
}

function prefersAn(word: string): boolean {
  if (!word) {
    return false
  }
  const lower = word.toLowerCase()
  if (/^(?:heir|honest|honou?r|hour)/.test(lower)) {
    return true
  }
  if (/^(?:once|one)(?:$|['\-’])/.test(lower)) {
    return false
  }
  if (/^(?:uni(?![dmn])|use|user|usual|utensil|util|ubiq|urol|ewe|eul|euph|euro)/.test(lower)) {
    return false
  }
  if (/^x(?:$|[-.])/.test(lower)) {
    return true
  }
  if (/^8|^(?:11|18)(?:$|[-.])/.test(lower)) {
    return true
  }
  if (/^[A-Z](?:\.?[A-Z])*\.?$/.test(word) && !wordAcronyms.has(word)) {
    return /^[AEFHILMNORSX]/.test(word)
  }
  return /^[aeiou]/i.test(word)
}
