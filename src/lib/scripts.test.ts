import { describe, expect, it } from 'vitest'
import { newRequest, type ResponseSnapshot } from '../types'
import { runPostResponseScript, runPreRequestScript } from './scripts'

const response: ResponseSnapshot = { status: 201, statusText: 'Created', durationMs: 10, sizeBytes: 20, headers: [], body: '{"data":{"token":"abc"}}', contentType: 'application/json', requestedAt: 1 }

describe('basic scripts', () => {
  it('sets temporary variables and headers', () => {
    const result = runPreRequestScript('variable trace = abc\nheader X-Trace = {{trace}}', newRequest(), {})
    expect(result.request.headers.find((item) => item.key === 'X-Trace')?.value).toBe('abc')
  })

  it('asserts and captures response data', () => {
    const result = runPostResponseScript('assert status == 201\nassert json.data.token exists\ncapture token = json.data.token', response)
    expect(result.captures).toEqual({ token: 'abc' })
  })

  it('fails a status assertion clearly', () => {
    expect(() => runPostResponseScript('assert status == 200', response)).toThrow(/expected status 200, received 201/)
  })
})
