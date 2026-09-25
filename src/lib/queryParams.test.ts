import { describe, expect, it } from 'vitest'
import { newRequest } from '../types'
import { hydrateLegacyQueryParams, queryParamsFromUrl, urlWithQueryParams } from './queryParams'

describe('query parameter synchronization', () => {
  it('reads repeated and encoded parameters from a URL', () => {
    const params = queryParamsFromUrl('https://example.com/search?tag=one&tag=two&q=hello%20world#results')
    expect(params.slice(0, -1).map(({ key, value }) => [key, value])).toEqual([
      ['tag', 'one'], ['tag', 'two'], ['q', 'hello world']
    ])
  })

  it('writes enabled parameters while preserving fragments and variable templates', () => {
    const url = urlWithQueryParams('https://example.com?old=yes#result', [
      { id: '1', key: 'format', value: 'json', enabled: true },
      { id: '2', key: 'token', value: '{{apiToken}}', enabled: true },
      { id: '3', key: 'skip', value: 'no', enabled: false }
    ])
    expect(url).toBe('https://example.com?format=json&token={{apiToken}}#result')
  })

  it('hydrates legacy requests whose query exists only in the URL', () => {
    const request = { ...newRequest(), url: 'https://api.ipify.org/?format=json' }
    expect(hydrateLegacyQueryParams(request).params[0]).toMatchObject({ key: 'format', value: 'json' })
  })
})
