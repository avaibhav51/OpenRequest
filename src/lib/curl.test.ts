import { describe, expect, it } from 'vitest'
import { parseCurl, toCurl } from './curl'
import { newRequest } from '../types'

describe('cURL conversion', () => {
  it('imports method, headers, url and JSON body', () => {
    const result = parseCurl("curl 'https://api.example.com/users?active=true' -X POST -H 'Content-Type: application/json' -H 'X-Key: demo' --data-raw '{\"name\":\"Ada\"}'")
    expect(result.method).toBe('POST')
    expect(result.url).toBe('https://api.example.com/users?active=true')
    expect(result.params?.[0]).toMatchObject({ key: 'active', value: 'true' })
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

  it('includes configured authorization when copying cURL', () => {
    const request = { ...newRequest(), url: 'https://example.com', auth: { type: 'bearer' as const, token: '{{token}}' } }
    expect(toCurl(request)).toContain("--header 'Authorization: Bearer {{token}}'")
  })

  it('imports bearer and basic authorization into the Auth model', () => {
    const bearer = parseCurl("curl https://example.com -H 'Authorization: Bearer secret'")
    expect(bearer.auth).toEqual({ type: 'bearer', token: 'secret' })
    expect(bearer.headers?.some((header) => header.key.toLowerCase() === 'authorization')).toBe(false)

    expect(parseCurl("curl https://example.com --user 'ada:p@ss'").auth).toEqual({ type: 'basic', username: 'ada', password: 'p@ss' })
    expect(parseCurl("curl https://example.com -H 'Authorization: Basic dmFpYmhhdjpww6Rzcw=='").auth).toEqual({ type: 'basic', username: 'vaibhav', password: 'päss' })
  })

  it('imports form body modes and keeps file paths disabled', () => {
    const encoded = parseCurl("curl https://example.com -d 'name=Ada&role=admin'")
    expect(encoded.bodyType).toBe('form')
    expect(encoded.bodyFields?.slice(0, 2).map(({ key, value }) => [key, value])).toEqual([['name', 'Ada'], ['role', 'admin']])

    const multipart = parseCurl("curl https://example.com -F 'name=Ada' -F 'avatar=@/tmp/avatar.png'")
    expect(multipart.bodyType).toBe('multipart')
    expect(multipart.bodyFields?.[0]).toMatchObject({ key: 'name', value: 'Ada', enabled: true })
    expect(multipart.bodyFields?.[1]).toMatchObject({ key: 'avatar', value: '@/tmp/avatar.png', enabled: false })
  })

  it('does not duplicate an API key already present in a copied URL', () => {
    const request = { ...newRequest(), url: 'https://example.com?api_key=old', params: [{ id: '1', key: 'api_key', value: 'old', enabled: true }], auth: { type: 'api-key' as const, key: 'api_key', value: 'new', location: 'query' as const } }
    expect(toCurl(request)).toContain("'https://example.com?api_key=new'")
  })

  it('rejects non-cURL input', () => {
    expect(() => parseCurl('wget https://example.com')).toThrow(/beginning with curl/i)
  })
})
