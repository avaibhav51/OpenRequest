import { describe, expect, it } from 'vitest'
import { bodyTypeFromContentType, headersForBodyType } from './body'

describe('body and content type synchronization', () => {
  it('adds and replaces a generated content type', () => {
    const json = headersForBodyType([], 'json')
    expect(json.find((header) => header.key === 'Content-Type')).toMatchObject({ value: 'application/json', source: 'generated' })
    const text = headersForBodyType(json, 'text')
    expect(text.find((header) => header.key === 'Content-Type')).toMatchObject({ value: 'text/plain', source: 'generated' })
  })

  it('does not replace a user-owned content type', () => {
    const headers = [{ id: '1', key: 'Content-Type', value: 'application/problem+json', enabled: true }]
    expect(headersForBodyType(headers, 'text')).toEqual(headers)
  })

  it('recognizes supported body types', () => {
    expect(bodyTypeFromContentType('application/json; charset=utf-8')).toBe('json')
    expect(bodyTypeFromContentType('application/x-www-form-urlencoded')).toBe('form')
    expect(bodyTypeFromContentType('multipart/form-data; boundary=x')).toBe('multipart')
  })
})
