import { describe, expect, it } from 'vitest'
import { parseCurl, toCurl } from './curl'
import { newRequest } from '../types'

describe('cURL conversion', () => {
  it('imports method, headers, url and JSON body', () => {
    const result = parseCurl("curl 'https://api.example.com/users?active=true' -X POST -H 'Content-Type: application/json' -H 'X-Key: demo' --data-raw '{\"name\":\"Ada\"}'")
    expect(result.method).toBe('POST')
    expect(result.url).toBe('https://api.example.com/users?active=true')
    expect(result.bodyType).toBe('json')
    expect(result.headers?.find((header) => header.key === 'X-Key')?.value).toBe('demo')
  })

  it('infers POST when data is present', () => {
    expect(parseCurl("curl https://example.com -d 'hello'").method).toBe('POST')
  })

  it('round-trips an ordinary request', () => {
    const request = {
      ...newRequest(), method: 'PATCH' as const, url: 'https://example.com/users/1', bodyType: 'json' as const,
      body: '{"name":"Grace"}', headers: [{ id: '1', key: 'X-Key', value: 'abc', enabled: true }]
    }
    const imported = parseCurl(toCurl(request))
    expect(imported).toMatchObject({ method: request.method, url: request.url, body: request.body })
  })

  it('rejects non-cURL input', () => {
    expect(() => parseCurl('wget https://example.com')).toThrow(/beginning with curl/i)
  })
})
