import { emptyPair, type HttpMethod, type RequestDraft, uid } from '../types'
import { bodyTypeFromContentType, formFieldsFromBody } from './body'
import { queryParamsFromUrl, urlWithQueryParams } from './queryParams'

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

const splitField = (value: string) => {
  const equals = value.indexOf('=')
  return equals < 0 ? [value, ''] : [value.slice(0, equals), value.slice(equals + 1)]
}

const splitCredential = (value: string) => {
  const colon = value.indexOf(':')
  return colon < 0 ? [value, ''] : [value.slice(0, colon), value.slice(colon + 1)]
}

const decodeBasic = (value: string) => {
  try {
    const bytes = Uint8Array.from(atob(value), (character) => character.charCodeAt(0))
    const decoded = new TextDecoder().decode(bytes)
    const colon = decoded.indexOf(':')
    return colon < 0 ? undefined : { type: 'basic' as const, username: decoded.slice(0, colon), password: decoded.slice(colon + 1) }
  } catch { return undefined }
}

export function parseCurl(command: string): Partial<RequestDraft> {
  const parts = tokenize(command.replace(/\\\r?\n/g, ' '))
  if (parts[0]?.toLowerCase() !== 'curl') throw new Error('Paste a command beginning with curl.')

  let method: HttpMethod | undefined
  let url = ''
  const dataParts: string[] = []
  const formParts: string[] = []
  let auth: RequestDraft['auth']
  const headers: RequestDraft['headers'] = []
  const valueFlags = new Set(['-X', '--request', '-H', '--header', '-d', '--data', '--data-raw', '--data-binary', '--data-urlencode', '-F', '--form', '--form-string', '--url', '-u', '--user'])

  for (let i = 1; i < parts.length; i += 1) {
    const part = parts[i]
    const next = parts[i + 1]
    if ((part === '-X' || part === '--request') && next) method = next.toUpperCase() as HttpMethod
    else if ((part === '-H' || part === '--header') && next) {
      const [key, value] = splitHeader(next)
      headers.push({ id: uid(), key, value, enabled: true })
    } else if (['-d', '--data', '--data-raw', '--data-binary', '--data-urlencode'].includes(part) && next) dataParts.push(next)
    else if (['-F', '--form', '--form-string'].includes(part) && next) formParts.push(next)
    else if ((part === '--url') && next) url = next
    else if ((part === '-u' || part === '--user') && next) {
      const [username, password] = splitCredential(next)
      auth = { type: 'basic', username, password }
    } else if (!part.startsWith('-') && parts[i - 1] !== undefined && !valueFlags.has(parts[i - 1])) url ||= part
    if (valueFlags.has(part)) i += 1
  }

  const authorizationAt = headers.findIndex((header) => header.key.toLowerCase() === 'authorization')
  if (!auth && authorizationAt >= 0) {
    const value = headers[authorizationAt].value
    const bearer = value.match(/^Bearer\s+(.+)$/i)
    const basic = value.match(/^Basic\s+(.+)$/i)
    if (bearer) auth = { type: 'bearer', token: bearer[1] }
    else if (basic) auth = decodeBasic(basic[1])
    if (auth) headers.splice(authorizationAt, 1)
  }

  const body = dataParts.join('&')
  const contentType = headers.find((header) => header.key.toLowerCase() === 'content-type')?.value ?? ''
  const contentBodyType = bodyTypeFromContentType(contentType)
  const bodyType: RequestDraft['bodyType'] = formParts.length ? 'multipart'
    : !body ? 'none'
      : contentBodyType ?? (/^[{[]/.test(body.trim()) ? 'json' : 'form')
  const bodyFields = formParts.length
    ? [...formParts.map((field) => { const [key, value] = splitField(field); return { id: uid(), key, value, enabled: !value.startsWith('@') } }), emptyPair()]
    : bodyType === 'form' ? formFieldsFromBody(body) : [emptyPair()]
  let name = 'Imported request'
  if (url) {
    try { name = new URL(url).pathname.split('/').filter(Boolean).at(-1) || 'Imported request' }
    catch { name = url.split('/').filter(Boolean).at(-1) || 'Imported request' }
  }
  return {
    method: method ?? (body || formParts.length ? 'POST' : 'GET'),
    url,
    params: queryParamsFromUrl(url),
    headers: headers.length ? [...headers, emptyPair()] : [emptyPair()],
    auth,
    body,
    bodyType,
    bodyFields,
    name
  }
}

export function toCurl(request: RequestDraft): string {
  const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`
  let url = request.url
  if (request.auth?.type === 'api-key' && request.auth.location === 'query' && request.auth.key) {
    const { key, value } = request.auth
    const params = queryParamsFromUrl(url).filter((item) => item.key && item.key.toLowerCase() !== key.toLowerCase())
    url = urlWithQueryParams(url, [...params, { id: 'auth-api-key', key, value, enabled: true }])
  }
  const lines = [`curl --request ${request.method} ${quote(url)}`]
  request.headers.filter((item) => item.enabled && item.key && !(request.auth?.type !== 'none' && item.key.toLowerCase() === 'authorization') && !(request.bodyType === 'multipart' && item.key.toLowerCase() === 'content-type')).forEach((item) => lines.push(`  --header ${quote(`${item.key}: ${item.value}`)}`))
  if (request.auth?.type === 'bearer' && request.auth.token) lines.push(`  --header ${quote(`Authorization: Bearer ${request.auth.token}`)}`)
  if (request.auth?.type === 'basic') lines.push(`  --user ${quote(`${request.auth.username}:${request.auth.password}`)}`)
  if (request.auth?.type === 'api-key' && request.auth.location === 'header' && request.auth.key) lines.push(`  --header ${quote(`${request.auth.key}: ${request.auth.value}`)}`)
  if (request.bodyType === 'form') (request.bodyFields ?? []).filter((item) => item.enabled && item.key).forEach((item) => lines.push(`  --data-urlencode ${quote(`${item.key}=${item.value}`)}`))
  else if (request.bodyType === 'multipart') (request.bodyFields ?? []).filter((item) => item.enabled && item.key).forEach((item) => lines.push(`  --form ${quote(`${item.key}=${item.value}`)}`))
  else if (request.bodyType !== 'none' && request.body) lines.push(`  --data-raw ${quote(request.body)}`)
  return lines.join(' \\\n')
}
