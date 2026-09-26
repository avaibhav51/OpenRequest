export type SyntaxKind = 'plain' | 'key' | 'string' | 'number' | 'boolean' | 'null' | 'tag' | 'attribute' | 'comment' | 'punctuation'

export interface SyntaxToken {
  text: string
  kind: SyntaxKind
}

const appendMatches = (value: string, expression: RegExp, classify: (match: RegExpExecArray) => SyntaxToken): SyntaxToken[] => {
  const tokens: SyntaxToken[] = []
  let cursor = 0
  for (const match of value.matchAll(expression)) {
    const index = match.index ?? 0
    if (index > cursor) tokens.push({ text: value.slice(cursor, index), kind: 'plain' })
    tokens.push(classify(match))
    cursor = index + match[0].length
  }
  if (cursor < value.length) tokens.push({ text: value.slice(cursor), kind: 'plain' })
  return tokens
}

export const tokenizeJson = (value: string): SyntaxToken[] => appendMatches(
  value,
  /("(?:\\.|[^"\\])*")(?=\s*:)|("(?:\\.|[^"\\])*")|(-?\b\d+(?:\.\d+)?(?:e[+-]?\d+)?\b)|\b(true|false)\b|\b(null)\b/gi,
  (match) => ({
    text: match[0],
    kind: match[1] ? 'key' : match[2] ? 'string' : match[3] ? 'number' : match[4] ? 'boolean' : 'null',
  }),
)

const tokenizeXmlTag = (tag: string): SyntaxToken[] => {
  let nameSeen = false
  return appendMatches(tag, /(<\/?|\/?>)|(\s+)|(=)|([A-Za-z_:][\w:.-]*)|("[^"]*"|'[^']*')/g, (match) => {
    if (match[1] || match[3]) return { text: match[0], kind: 'punctuation' }
    if (match[2]) return { text: match[0], kind: 'plain' }
    if (match[5]) return { text: match[0], kind: 'string' }
    const kind = nameSeen ? 'attribute' : 'tag'
    nameSeen = true
    return { text: match[0], kind }
  })
}

export const tokenizeXml = (value: string): SyntaxToken[] => {
  const tokens: SyntaxToken[] = []
  let cursor = 0
  for (const match of value.matchAll(/<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<[^>]+>/g)) {
    const index = match.index ?? 0
    if (index > cursor) tokens.push({ text: value.slice(cursor, index), kind: 'plain' })
    const part = match[0]
    if (part.startsWith('<!--') || part.startsWith('<![CDATA[') || part.startsWith('<?')) tokens.push({ text: part, kind: 'comment' })
    else tokens.push(...tokenizeXmlTag(part))
    cursor = index + part.length
  }
  if (cursor < value.length) tokens.push({ text: value.slice(cursor), kind: 'plain' })
  return tokens
}
