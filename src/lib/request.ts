import type { KeyValue, RequestAuth, RequestDraft, ResponseSnapshot } from '../types'

const active = (pairs: KeyValue[]) => pairs.filter((pair) => pair.enabled && pair.key.trim())

export function applyQueryParameters(url: URL, params: KeyValue[]) {
  const parameterKeys = new Set(params.filter((pair) => pair.key.trim()).map((pair) => pair.key))
  parameterKeys.forEach((key) => url.searchParams.delete(key))
  active(params).forEach(({ key, value }) => url.searchParams.append(key, value))
}

const utf8Base64 = (value: string) => {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  bytes.forEach((byte) => { binary += String.fromCharCode(byte) })
  return btoa(binary)
}

const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = ''
  const chunkSize = 0x8000
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
  }
  return btoa(binary)
}

export function applyAuthorization(url: URL, headers: Headers, auth: RequestAuth = { type: 'none' }) {
  if (auth.type === 'bearer' && auth.token) headers.set('authorization', `Bearer ${auth.token}`)
  if (auth.type === 'basic') headers.set('authorization', `Basic ${utf8Base64(`${auth.username}:${auth.password}`)}`)
  if (auth.type === 'api-key' && auth.key.trim()) {
    if (auth.location === 'header') headers.set(auth.key.trim(), auth.value)
    else url.searchParams.set(auth.key.trim(), auth.value)
  }
}

export async function executeRequest(request: RequestDraft): Promise<ResponseSnapshot> {
  const url = new URL(request.url)
  applyQueryParameters(url, request.params)
  const headers = new Headers()
  active(request.headers).forEach(({ key, value }) => headers.append(key, value))
  applyAuthorization(url, headers, request.auth)
  if (request.bodyType === 'json' && !headers.has('content-type')) headers.set('content-type', 'application/json')

  let requestBody: BodyInit | undefined
  if (!['GET', 'HEAD'].includes(request.method) && request.bodyType !== 'none') {
    if (request.bodyType === 'form') {
      const form = new URLSearchParams()
      active(request.bodyFields ?? []).forEach(({ key, value }) => form.append(key, value))
      requestBody = form
      if (!headers.has('content-type')) headers.set('content-type', 'application/x-www-form-urlencoded')
    } else if (request.bodyType === 'multipart') {
      const form = new FormData()
      active(request.bodyFields ?? []).forEach(({ key, value }) => form.append(key, value))
      requestBody = form
      if (/multipart\/form-data/i.test(headers.get('content-type') ?? '')) headers.delete('content-type')
    } else requestBody = request.body
  }

  const started = performance.now()
  const response = await fetch(url, {
    method: request.method,
    headers,
    body: requestBody
  })
  const contentType = response.headers.get('content-type') ?? ''
  const bytes = new Uint8Array(await response.arrayBuffer())
  const isText = /^text\//i.test(contentType) || /json|xml|javascript|x-www-form-urlencoded|svg/i.test(contentType) || !contentType
  const body = isText ? new TextDecoder().decode(bytes) : bytesToBase64(bytes)
  const durationMs = Math.round(performance.now() - started)
  const responseHeaders: KeyValue[] = []
  response.headers.forEach((value, key) => responseHeaders.push({ id: crypto.randomUUID(), key, value, enabled: true }))
  return {
    status: response.status,
    statusText: response.statusText,
    durationMs,
    sizeBytes: bytes.byteLength,
    headers: responseHeaders,
    body,
    contentType,
    bodyEncoding: isText ? 'text' : 'base64',
    requestedAt: Date.now()
  }
}

export const friendlyRequestError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  if (/failed to fetch|networkerror|load failed/i.test(message)) {
    return 'The browser blocked or could not reach this API. Check the URL and network first; if it works in cURL, the server probably does not allow browser CORS. A local bridge is planned for unrestricted requests.'
  }
  return message
}
