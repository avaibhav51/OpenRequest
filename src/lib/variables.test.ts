import { describe, expect, it } from 'vitest'
import { newRequest } from '../types'
import { referencedVariables, resolveRequest, resolveText } from './variables'

describe('variables', () => {
  it('resolves values in request fields', () => {
    const request = { ...newRequest(), url: '{{baseUrl}}/users', body: '{"id":"{{userId}}"}' }
    expect(resolveRequest(request, { baseUrl: 'https://example.com', userId: '42' })).toMatchObject({
      url: 'https://example.com/users', body: '{"id":"42"}'
    })
  })

  it('reports missing variables', () => {
    expect(() => resolveText('{{missing}}', {})).toThrow('Missing variable: missing')
  })

  it('finds unique references', () => {
    const request = { ...newRequest(), url: '{{baseUrl}}/{{id}}', body: '{{id}}', auth: { type: 'bearer' as const, token: '{{accessToken}}' } }
    expect(referencedVariables(request)).toEqual(['baseUrl', 'id', 'accessToken'])
    expect(resolveRequest(request, { baseUrl: 'https://example.com', id: '1', accessToken: 'secret' }).auth).toEqual({ type: 'bearer', token: 'secret' })
  })
})
