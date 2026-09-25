import { afterEach, describe, expect, it, vi } from 'vitest'
import { newRequest } from '../types'
import { applyAuthorization, applyQueryParameters, executeRequest } from './request'

afterEach(() => vi.unstubAllGlobals())

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
  it('keeps binary responses as base64 with the original byte size', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new Uint8Array([0, 1, 2, 255]), { headers: { 'Content-Type': 'image/png' } })))
    const response = await executeRequest({ ...newRequest(), url: 'https://example.com/image.png' })
    expect(response).toMatchObject({ body: 'AAEC/w==', bodyEncoding: 'base64', sizeBytes: 4, contentType: 'image/png' })
  })
})
