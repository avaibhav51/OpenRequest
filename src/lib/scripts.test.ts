import { afterEach, describe, expect, it, vi } from 'vitest'
import { newRequest, type ResponseSnapshot } from '../types'
import { runPostResponseScript, runPreRequestScript } from './scripts'

const response: ResponseSnapshot = { status: 201, statusText: 'Created', durationMs: 10, sizeBytes: 20, headers: [], body: '{"data":{"token":"abc"}}', contentType: 'application/json', requestedAt: 1 }

describe('basic scripts', () => {
  afterEach(() => vi.useRealTimers())

  it('sets temporary variables and headers', async () => {
    const result = await runPreRequestScript('variable trace = abc\nheader X-Trace = {{trace}}', newRequest(), {})
    expect(result.request.headers.find((item) => item.key === 'X-Trace')?.value).toBe('abc')
  })

  it('waits three seconds without blocking and preserves command order', async () => {
    vi.useFakeTimers()
    let finished = false
    const execution = runPreRequestScript('variable trace = first\nsleep 3000\nvariable trace = second\nheader X-Trace = {{trace}}', newRequest(), {}).then((result) => { finished = true; return result })
    await vi.advanceTimersByTimeAsync(2999)
    expect(finished).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    const result = await execution
    expect(result.logs).toEqual(['Set request variable trace', 'Slept 3000 ms before sending', 'Set request variable trace', 'Set header X-Trace'])
    expect(result.request.headers.find((item) => item.key === 'X-Trace')?.value).toBe('second')
  })

  it('supports zero delay and ignores comments', async () => {
    const result = await runPreRequestScript('# sleep 99999\n// comment\nsleep 0', newRequest(), {})
    expect(result.logs).toEqual(['Slept 0 ms before sending'])
  })
  it('cancels a sleep before later commands or staged persistence complete', async () => {
    vi.useFakeTimers()
    const controller = new AbortController()
    const execution = runPreRequestScript('environment-set token = staged\nsleep 3000\nheader X-Later = no', newRequest(), {}, controller.signal)
    const assertion = expect(execution).rejects.toMatchObject({ kind: 'cancelled' })
    controller.abort()
    await assertion
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each(['sleep -1', 'sleep 1.5', 'sleep Infinity', 'sleep nope', 'sleep', 'sleep 30001', 'sleep 20000\nsleep 20000'])('rejects invalid or excessive delay: %s', async (script) => {
    vi.useFakeTimers()
    await expect(runPreRequestScript(script, newRequest(), {})).rejects.toThrow(/sleep/i)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('allows the total delay limit across multiple sleeps', async () => {
    vi.useFakeTimers()
    const execution = runPreRequestScript('sleep 15000\nsleep 15000', newRequest(), {})
    await vi.advanceTimersByTimeAsync(30000)
    expect((await execution).logs).toHaveLength(2)
  })

  it('asserts and captures response data', () => {
    const result = runPostResponseScript('assert status == 201\nassert json.data.token exists\ncapture token = json.data.token', response)
    expect(result.captures).toEqual({ token: 'abc' })
  })

  it('fails a status assertion clearly', () => {
    const result = runPostResponseScript('assert status == 200\nassert status == 201', response)
    expect(result.checks.map((check) => check.passed)).toEqual([false, true])
    expect(result.errors).toEqual(['Line 1: Comparison failed (values omitted for privacy)'])
  })

  const richResponse: ResponseSnapshot = { ...response, body: '{"success":true,"count":3,"name":"created","nil":null,"tags":["one","two"],"data":{"token":"private-token"}}', headers: [{ id: 'ct', key: 'Content-Type', value: 'application/json; charset=utf-8', enabled: true }] }

  it.each([
    'assert json.success == true', 'assert json.count == 3', 'assert json.count != 2',
    'assert json.count >= 3', 'assert json.count <= 3', 'assert json.count > 2', 'assert json.count < 4',
    'assert json.nil == null', 'assert json.tags.0 == "one"', 'assert json.tags contains "two"',
    'assert body contains "created"', 'assert header content-type contains application/json',
    'assert header CONTENT-TYPE exists', 'assert durationMs < 2000',
    'assert json.name == "{{expected}}"'
  ])('supports typed checks: %s', (script) => {
    const result = runPostResponseScript(script, richResponse, { expected: 'created' })
    expect(result.errors).toEqual([])
    expect(result.checks[0].passed).toBe(true)
  })

  it.each([
    'assert json.count == "3"', 'assert json.success == "true"',
    'assert json.missing != null', 'assert header Missing contains "anything"',
    'assert json.name > 1', 'assert json.count contains "3"', 'assert json.count == {}',
    'assert status === 201', 'assert json.name == "unclosed', 'assert json.name == {{missing}}',
    'assert json.toString exists', 'assert body matches /created/', 'assert durationMs < "2000"'
  ])('fails unsupported, missing or mismatched values: %s', (script) => {
    const result = runPostResponseScript(script, richResponse)
    expect(result.errors).toHaveLength(1)
    expect(result.checks[0].passed).toBe(false)
  })

  it('retains physical line numbers and runs later assertions/captures after failures', () => {
    const result = runPostResponseScript('# comment\n\nassert status == 400\nassert json.success == true\ncapture token = json.data.token\nassert json.data.token == "{{token}}"', richResponse)
    expect(result.checks.map(({ line, passed }) => ({ line, passed }))).toEqual([{ line: 3, passed: false }, { line: 4, passed: true }, { line: 6, passed: true }])
    expect(result.captures.token).toBe('private-token')
    expect(JSON.stringify(result.checks)).not.toContain('private-token')
  })

  it('reports invalid JSON and binary bodies without hiding later status checks', () => {
    for (const alternate of [{ ...response, body: 'not json' }, { ...response, bodyEncoding: 'base64' as const }]) {
      const result = runPostResponseScript('assert json.success exists\nassert status == 201', alternate)
      expect(result.checks.map((check) => check.passed)).toEqual([false, true])
    }
  })

  it('allows literal logs in both phases and redacts templates, known variables and credentials', async () => {
    const request = { ...newRequest(), auth: { type: 'bearer' as const, token: 'bearer-secret' } }
    const pre = await runPreRequestScript('log "Preparing request"\nlog "Token {{token}} bearer-secret variable-secret"', request, { token: 'variable-secret' })
    expect(pre.logs).toEqual(['Log: Preparing request', 'Log: Token [redacted] [redacted] [redacted]'])
    const post = runPostResponseScript('capture token = json.data.token\nlog "Captured {{token}} private-token"', richResponse)
    expect(post.logs.at(-1)).toBe('Log: Captured [redacted] [redacted]')
  })

  it('rejects unquoted logs and arbitrary JavaScript', async () => {
    await expect(runPreRequestScript('log unquoted', newRequest(), {})).rejects.toThrow('double-quoted')
    const result = runPostResponseScript('log unquoted\nwindow.localStorage.clear()\nassert status == 201', response)
    expect(result.errors).toHaveLength(2)
    expect(result.checks[0].passed).toBe(true)
  })

  it('stages ordered environment writes and provides their values to following pre commands', async () => {
    const result = await runPreRequestScript('environment-set token = "new token"\nheader Authorization = Bearer {{token}}\nenvironment-unset stale\nlog "old-secret new token"', newRequest(), { stale: 'old-secret' })
    expect(result.environmentMutations).toEqual([{ operation: 'set', key: 'token', value: 'new token' }, { operation: 'unset', key: 'stale' }])
    expect(result.variables).toEqual({ token: 'new token' })
    expect(result.request.headers.find((row) => row.key === 'Authorization')?.value).toBe('Bearer new token')
    expect(result.logs.at(-1)).toBe('Log: [redacted] [redacted]')
  })

  it('preserves capture/set/unset order in post scripts and removes stale local expectations', () => {
    const result = runPostResponseScript('capture token = json.data.token\nenvironment-set copied = {{token}}\nenvironment-unset token\nassert json.data.token == {{token}}\nassert status == 201', richResponse)
    expect(result.environmentMutations).toEqual([{ operation: 'set', key: 'token', value: 'private-token' }, { operation: 'set', key: 'copied', value: 'private-token' }, { operation: 'unset', key: 'token' }])
    expect(result.captures.token).toBeUndefined()
    expect(result.checks.map((check) => check.passed)).toEqual([false, true])
  })

  it('replaces duplicate/disabled query keys, preserves others and fragments without editing the draft', async () => {
    const request = { ...newRequest(), url: 'https://example.com?x=1&x=2&keep=yes#fragment' }
    const result = await runPreRequestScript('query x = 3\nquery term = "hello world"\nquery-remove absent', request, {})
    expect(result.request.url).toBe('https://example.com?keep=yes&x=3&term=hello%20world#fragment')
    expect(result.request.params.filter((row) => row.key === 'x')).toHaveLength(1)
    expect(request.url).toContain('x=1&x=2')
    result.request.params.find((row) => row.key === 'x')!.enabled = false
    const removed = await runPreRequestScript('query-remove x', result.request, {})
    expect(removed.request.url).not.toContain('x=')
  })

  it('sets typed JSON object fields and removes fields without editing the original', async () => {
    const request = { ...newRequest(), method: 'POST' as const, bodyType: 'json' as const, body: '{"old":1,"data":{"name":"old"}}' }
    const result = await runPreRequestScript('body data.name = "new"\nbody count = 2\nbody enabled = true\nbody empty = null\nbody-remove old\nbody-remove absent.path', request, {})
    expect(JSON.parse(result.request.body)).toEqual({ data: { name: 'new' }, count: 2, enabled: true, empty: null })
    expect(JSON.parse(request.body).old).toBe(1)
  })

  it.each(['body __proto__.polluted = true', 'body constructor.prototype.polluted = true', 'body items.0 = 1', 'body old.child = 1', 'environment-set __proto__ = unsafe', 'environment-unset constructor'])('rejects unsafe/unsupported mutation paths: %s', async (script) => {
    const request = { ...newRequest(), method: 'POST' as const, bodyType: 'json' as const, body: '{"old":1,"items":[]}' }
    await expect(runPreRequestScript(script, request, {})).rejects.toThrow()
    expect(Object.hasOwn(Object.prototype, 'polluted')).toBe(false)
  })

  it('rejects body mutation in GET, raw bodies, invalid JSON and array-root bodies', async () => {
    for (const request of [newRequest(), { ...newRequest(), method: 'POST' as const, bodyType: 'text' as const }, { ...newRequest(), method: 'POST' as const, bodyType: 'json' as const, body: 'invalid' }, { ...newRequest(), method: 'POST' as const, bodyType: 'json' as const, body: '[]' }]) {
      await expect(runPreRequestScript('body name = "test"', request, {})).rejects.toThrow()
    }
  })
})
