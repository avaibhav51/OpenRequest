import type { KeyValue, RequestDraft, ResponseSnapshot } from '../types'

const active = (pairs: KeyValue[]) => pairs.filter((pair) => pair.enabled && pair.key.trim())

export async function executeRequest(request: RequestDraft): Promise<ResponseSnapshot> {
  const url = new URL(request.url)
  active(request.params).forEach(({ key, value }) => url.searchParams.append(key, value))
  const headers = new Headers()
  active(request.headers).forEach(({ key, value }) => headers.append(key, value))
  if (request.bodyType === 'json' && !headers.has('content-type')) headers.set('content-type', 'application/json')

  const started = performance.now()
  const response = await fetch(url, {
    method: request.method,
    headers,
    body: ['GET', 'HEAD'].includes(request.method) || request.bodyType === 'none' ? undefined : request.body
  })
  const body = await response.text()
  const durationMs = Math.round(performance.now() - started)
  const responseHeaders: KeyValue[] = []
  response.headers.forEach((value, key) => responseHeaders.push({ id: crypto.randomUUID(), key, value, enabled: true }))
  return {
    status: response.status,
    statusText: response.statusText,
    durationMs,
    sizeBytes: new Blob([body]).size,
    headers: responseHeaders,
    body,
    contentType: response.headers.get('content-type') ?? '',
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
