import { afterEach, describe, expect, it, vi } from 'vitest'
import { newRequest } from '../types'
import { applyAuthorization, applyQueryParameters, executeRequest, friendlyRequestError, MAX_RESPONSE_BYTES, readResponseBytes } from './request'
import { abortableDelay, RequestStoppedError } from './requestControl'

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe('response memory safeguards', () => {
  it('does not reject a bodyless HEAD-style response with a large Content-Length', async () => {
    const bytes = await readResponseBytes(new Response(null, { headers: { 'content-length': String(MAX_RESPONSE_BYTES + 1) } }), new AbortController().signal)
    expect(bytes.length).toBe(0)
  })
  it('rejects advertised oversized responses before reading them', async () => {
    await expect(readResponseBytes(new Response('small', { headers: { 'content-length': String(MAX_RESPONSE_BYTES + 1) } }), new AbortController().signal)).rejects.toThrow('10 MiB')
  })
  it('rejects chunked bodies exceeding the limit and cancels the stream', async () => {
    const cancel = vi.fn()
    const body = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(MAX_RESPONSE_BYTES + 1)) }, cancel })
    await expect(readResponseBytes(new Response(body), new AbortController().signal)).rejects.toThrow('10 MiB')
    expect(cancel).toHaveBeenCalledOnce()
  })
})

describe('request authorization', () => {
  it('adds a bearer token', () => {
    const headers = new Headers()
    applyAuthorization(new URL('https://example.com'), headers, { type: 'bearer', token: 'abc123' })
    expect(headers.get('authorization')).toBe('Bearer abc123')
  })

  it('adds UTF-8 basic credentials', () => {
    const headers = new Headers()
    applyAuthorization(new URL('https://example.com'), headers, { type: 'basic', username: 'vaibhav', password: 'päss' })
    expect(headers.get('authorization')).toBe('Basic dmFpYmhhdjpww6Rzcw==')
  })

  it('adds an API key to a header or query parameter', () => {
    const headerUrl = new URL('https://example.com')
    const headers = new Headers()
    applyAuthorization(headerUrl, headers, { type: 'api-key', key: 'X-API-Key', value: 'secret', location: 'header' })
    expect(headers.get('x-api-key')).toBe('secret')

    const queryUrl = new URL('https://example.com?keep=yes')
    applyAuthorization(queryUrl, headers, { type: 'api-key', key: 'api_key', value: 'secret', location: 'query' })
    expect(queryUrl.searchParams.get('api_key')).toBe('secret')
    expect(queryUrl.searchParams.get('keep')).toBe('yes')
  })
})

describe('request query parameters', () => {
  it('replaces mirrored URL parameters instead of duplicating them', () => {
    const url = new URL('https://api.ipify.org/?format=json')
    applyQueryParameters(url, [{ id: '1', key: 'format', value: 'json', enabled: true }])
    expect(url.searchParams.getAll('format')).toEqual(['json'])
  })
})

describe('response representations', () => {
  it('records final URL, redirect, method and empty body diagnostics', async () => {
    const result = new Response(null, { status: 204 })
    Object.defineProperties(result, { url: { value: 'https://example.com/final' }, redirected: { value: true } })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(result))
    expect(await executeRequest({ ...newRequest(), url: 'https://example.com/start' })).toMatchObject({
      status: 204, body: '', sizeBytes: 0, finalUrl: 'https://example.com/final', redirected: true, requestMethod: 'GET',
    })
  })
  it('keeps binary responses as base64 with the original byte size', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new Uint8Array([0, 1, 2, 255]), { headers: { 'Content-Type': 'image/png' } })))
    const response = await executeRequest({ ...newRequest(), url: 'https://example.com/image.png' })
    expect(response).toMatchObject({ body: 'AAEC/w==', bodyEncoding: 'base64', sizeBytes: 4, contentType: 'image/png' })
  })
})

describe('request cancellation and timeout', () => {
  const hangingFetch = () => vi.stubGlobal('fetch', vi.fn((_url: URL, options: RequestInit) => new Promise<Response>((_resolve, reject) => {
    options.signal!.addEventListener('abort', () => reject(options.signal!.reason), { once: true })
  })))
  it('cancels before dispatch without fetching', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const controller = new AbortController()
    controller.abort()
    await expect(executeRequest({ ...newRequest(), url: 'https://example.com' }, controller.signal)).rejects.toMatchObject({ kind: 'cancelled' })
    expect(fetch).not.toHaveBeenCalled()
  })
  it('cancels fetch and clears its timeout', async () => {
    vi.useFakeTimers(); hangingFetch()
    const controller = new AbortController()
    const result = executeRequest({ ...newRequest(), url: 'https://example.com' }, controller.signal)
    const assertion = expect(result).rejects.toMatchObject({ kind: 'cancelled' })
    controller.abort()
    await assertion
    expect(vi.getTimerCount()).toBe(0)
  })
  it('times out with distinct diagnostics rather than a CORS diagnosis', async () => {
    vi.useFakeTimers(); hangingFetch()
    const result = executeRequest({ ...newRequest(), url: 'https://example.com', timeoutMs: 1000 })
    const assertion = expect(result).rejects.toMatchObject({ kind: 'timeout' })
    await vi.advanceTimersByTimeAsync(1000)
    await assertion
    expect(friendlyRequestError(new RequestStoppedError('timeout', 1000))).toContain('1 second')
    expect(vi.getTimerCount()).toBe(0)
  })
  it('disables the deadline without disabling manual cancellation', async () => {
    vi.useFakeTimers(); hangingFetch()
    const controller = new AbortController()
    const result = executeRequest({ ...newRequest(), url: 'https://example.com', timeoutMs: 0 }, controller.signal)
    const assertion = expect(result).rejects.toMatchObject({ kind: 'cancelled' })
    await vi.advanceTimersByTimeAsync(400000)
    expect(vi.getTimerCount()).toBe(0)
    controller.abort(); await assertion
  })
  it('keeps the deadline active while downloading the body', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn((_url: URL, options: RequestInit) => Promise.resolve({
      headers: new Headers(), arrayBuffer: () => new Promise((_resolve, reject) => options.signal!.addEventListener('abort', () => reject(options.signal!.reason))),
    })))
    const result = executeRequest({ ...newRequest(), url: 'https://example.com', timeoutMs: 1000 })
    const assertion = expect(result).rejects.toMatchObject({ kind: 'timeout' })
    await vi.advanceTimersByTimeAsync(1000); await assertion
  })
  it('rejects invalid deadlines and clears timers after success', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('done')))
    for (const value of [-1, 0.5, NaN, 300001]) await expect(executeRequest({ ...newRequest(), url: 'https://example.com', timeoutMs: value })).rejects.toThrow('timeout')
    await executeRequest({ ...newRequest(), url: 'https://example.com' })
    expect(vi.getTimerCount()).toBe(0)
  })
  it('aborts script sleep and releases timers', async () => {
    vi.useFakeTimers()
    const controller = new AbortController()
    const wait = abortableDelay(3000, controller.signal)
    const assertion = expect(wait).rejects.toMatchObject({ kind: 'cancelled' })
    controller.abort(); await assertion
    expect(vi.getTimerCount()).toBe(0)
  })
})
