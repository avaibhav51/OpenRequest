import type { KeyValue, RequestAuth, RequestDraft, ResponseSnapshot } from '../types'
import { checkCancelled, DEFAULT_TIMEOUT_MS, RequestStoppedError } from './requestControl'

const active = (pairs: KeyValue[]) => pairs.filter((pair) => pair.enabled && pair.key.trim())
export const MAX_RESPONSE_BYTES = 10 * 1024 * 1024

export async function readResponseBytes(response: Response, signal: AbortSignal): Promise<Uint8Array> {
  const tooLarge = () => new Error('Response exceeds the 10 MiB safety limit. Download large payloads with a native client.')
  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer())
    if (bytes.length > MAX_RESPONSE_BYTES) throw tooLarge()
    return bytes
  }
  if (Number(response.headers.get('content-length')) > MAX_RESPONSE_BYTES) {
    await response.body.cancel(); throw tooLarge()
  }
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      checkCancelled(signal)
      const { value, done } = await reader.read()
      checkCancelled(signal)
      if (done) break
      size += value.length
      if (size > MAX_RESPONSE_BYTES) throw tooLarge()
      chunks.push(value)
    }
    const bytes = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
    return bytes
  } finally { await reader.cancel().catch(() => undefined); reader.releaseLock() }
}

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

export async function executeRequest(request: RequestDraft, signal?: AbortSignal): Promise<ResponseSnapshot> {
  checkCancelled(signal)
  const timeoutMs = request.timeoutMs ?? DEFAULT_TIMEOUT_MS
  if (!Number.isInteger(timeoutMs) || timeoutMs < 0 || timeoutMs > 300_000) throw new Error('Request timeout must be whole milliseconds from 0 to 300000 (0 disables it).')
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
  const controller = new AbortController()
  const onAbort = () => controller.abort(new RequestStoppedError('cancelled'))
  signal?.addEventListener('abort', onAbort, { once: true })
  const timer = timeoutMs ? setTimeout(() => controller.abort(new RequestStoppedError('timeout', timeoutMs)), timeoutMs) : undefined
  try {
    const response = await fetch(url, {
      method: request.method,
      headers,
      body: requestBody,
      signal: controller.signal
    })
    const contentType = response.headers.get('content-type') ?? ''
    const bytes = await readResponseBytes(response, controller.signal)
    checkCancelled(controller.signal)
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
      requestedAt: Date.now(),
      finalUrl: response.url || url.href,
      redirected: response.redirected,
      requestMethod: request.method
    }
  } catch (error) {
    checkCancelled(controller.signal)
    throw error
  } finally {
    if (timer !== undefined) clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
}

export const friendlyRequestError = (error: unknown) => {
  if (error instanceof RequestStoppedError) return error.message
  if (error instanceof Error && error.name === 'AbortError') return 'Request cancelled.'
  const message = error instanceof Error ? error.message : String(error)
  if (/failed to fetch|networkerror|load failed/i.test(message)) {
    return 'No readable HTTP response was available. Check the URL, network/VPN, TLS and browser CORS policy. The browser cannot distinguish these causes reliably. A local companion is planned; no-cors would hide the response rather than fix it.'
  }
  return message
}
