import { emptyPair, type HttpMethod, type RequestDraft, uid } from '../types'

const tokenize = (input: string): string[] => {
  const tokens: string[] = []
  let token = ''
  let quote: "'" | '"' | null = null
  let escaped = false

  for (const char of input.trim()) {
    if (escaped) {
      token += char
      escaped = false
    } else if (char === '\\' && quote !== "'") {
      escaped = true
    } else if (quote) {
      if (char === quote) quote = null
      else token += char
    } else if (char === "'" || char === '"') {
      quote = char
    } else if (/\s/.test(char)) {
      if (token) {
        tokens.push(token)
        token = ''
      }
    } else token += char
  }
  if (quote) throw new Error('The cURL command has an unclosed quote.')
  if (token) tokens.push(token)
  return tokens
}

const splitHeader = (value: string) => {
  const colon = value.indexOf(':')
  return colon < 0 ? [value, ''] : [value.slice(0, colon).trim(), value.slice(colon + 1).trim()]
}

export function parseCurl(command: string): Partial<RequestDraft> {
  const parts = tokenize(command.replace(/\\\r?\n/g, ' '))
  if (parts[0]?.toLowerCase() !== 'curl') throw new Error('Paste a command beginning with curl.')

  let method: HttpMethod | undefined
  let url = ''
  let body = ''
  const headers: RequestDraft['headers'] = []
  const valueFlags = new Set(['-X', '--request', '-H', '--header', '-d', '--data', '--data-raw', '--data-binary', '--url', '-u', '--user'])

  for (let i = 1; i < parts.length; i += 1) {
    const part = parts[i]
    const next = parts[i + 1]
    if ((part === '-X' || part === '--request') && next) method = next.toUpperCase() as HttpMethod
    else if ((part === '-H' || part === '--header') && next) {
      const [key, value] = splitHeader(next)
      headers.push({ id: uid(), key, value, enabled: true })
    } else if (['-d', '--data', '--data-raw', '--data-binary'].includes(part) && next) body = next
    else if ((part === '--url') && next) url = next
    else if ((part === '-u' || part === '--user') && next) {
      headers.push({ id: uid(), key: 'Authorization', value: `Basic ${btoa(next)}`, enabled: true })
    } else if (!part.startsWith('-') && parts[i - 1] !== undefined && !valueFlags.has(parts[i - 1])) url ||= part
    if (valueFlags.has(part)) i += 1
  }

  const contentType = headers.find((header) => header.key.toLowerCase() === 'content-type')?.value ?? ''
  let name = 'Imported request'
  if (url) {
    try { name = new URL(url).pathname.split('/').filter(Boolean).at(-1) || 'Imported request' }
    catch { name = url.split('/').filter(Boolean).at(-1) || 'Imported request' }
  }
  return {
    method: method ?? (body ? 'POST' : 'GET'),
    url,
    headers: headers.length ? [...headers, emptyPair()] : [emptyPair()],
    body,
    bodyType: body ? (contentType.includes('json') || /^[{[]/.test(body.trim()) ? 'json' : 'text') : 'none',
    name
  }
}

export function toCurl(request: RequestDraft): string {
  const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`
  const lines = [`curl --request ${request.method} ${quote(request.url)}`]
  request.headers.filter((item) => item.enabled && item.key).forEach((item) => lines.push(`  --header ${quote(`${item.key}: ${item.value}`)}`))
  if (request.bodyType !== 'none' && request.body) lines.push(`  --data-raw ${quote(request.body)}`)
  return lines.join(' \\\n')
}
