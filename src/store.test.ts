import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from './db'
import { useAppStore } from './store'
import { newRequest, type ResponseSnapshot } from './types'

vi.mock('./db', () => ({ db: {
  transaction: vi.fn(async (_mode: unknown, _environments: unknown, _variables: unknown, work: () => Promise<void>) => work()),
  environments: { get: vi.fn(async () => undefined) },
  editorDrafts: { delete: vi.fn(async () => undefined), put: vi.fn(async () => undefined) },
  history: { add: vi.fn(async () => undefined) },
  variables: { put: vi.fn(async () => undefined) }
} }))

const response = (body: string): ResponseSnapshot => ({ status: 200, statusText: 'OK', body, contentType: 'text/plain', bodyEncoding: 'text', headers: [], durationMs: 1, sizeBytes: body.length, requestedAt: Date.now() })

afterEach(() => vi.unstubAllGlobals())

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('localStorage', { setItem: vi.fn() })
  const draft = newRequest()
  useAppStore.setState({ draft, draftTabs: [draft], requestRuns: {}, history: [], requests: [], environments: [], variables: [] })
})

describe('per-tab request runs', () => {
  it('allows independent runs but prevents repeated sends in one running tab', () => {
    const store = useAppStore.getState()
    const a = store.beginRun('A')!
    const b = store.beginRun('B')!
    expect(store.beginRun('A')).toBeUndefined()
    store.finishRun('B', b, response('B'))
    expect(useAppStore.getState().requestRuns.A.busy).toBe(true)
    expect(useAppStore.getState().requestRuns.B.response?.body).toBe('B')
    store.finishRun('A', a, response('A'))
    store.clearResponse('B')
    expect(useAppStore.getState().requestRuns.A.response?.body).toBe('A')
    expect(useAppStore.getState().requestRuns.B.response).toBeUndefined()
  })
  it('ignores an obsolete completion after a newer run starts', () => {
    const store = useAppStore.getState()
    const first = store.beginRun('A')!
    store.finishRun('A', first, response('first'))
    const second = store.beginRun('A')!
    store.finishRun('A', first, undefined, 'obsolete error')
    expect(useAppStore.getState().requestRuns.A).toEqual({ runId: second, busy: true })
  })
  it('drops closed-tab results without affecting another tab', async () => {
    const store = useAppStore.getState()
    const a = store.draft
    const b = newRequest()
    useAppStore.setState({ draftTabs: [a, b] })
    const runA = store.beginRun(a.id)!
    const runB = store.beginRun(b.id)!
    await store.closeDraft(a.id)
    store.finishRun(a.id, runA, response('closed'))
    expect(useAppStore.getState().requestRuns[a.id]).toBeUndefined()
    expect(useAppStore.getState().requestRuns[b.id]).toEqual({ runId: runB, busy: true })
  })
  it('records the provided snapshot, never the currently selected draft', async () => {
    const snapshot = { ...newRequest(), name: 'Sent request', url: 'https://example.com?original=1', body: 'original body' }
    useAppStore.setState({ draft: { ...newRequest(), name: 'Other tab' } })
    await useAppStore.getState().recordRun(snapshot, response('result'))
    snapshot.body = 'later mutation'
    expect(useAppStore.getState().history[0].request).toMatchObject({ name: 'Sent request', body: 'original body', url: 'https://example.com?original=1' })
    expect(db.history.add).toHaveBeenCalledOnce()
  })
  it('does not create captured variables in a deleted environment', async () => {
    await expect(useAppStore.getState().captureVariable('token', 'value', 'deleted')).rejects.toThrow('environment was deleted')
    expect(db.variables.put).not.toHaveBeenCalled()
  })

  it('refuses staged environment writes when the sending environment no longer exists', async () => {
    await expect(useAppStore.getState().applyEnvironmentMutations('deleted', [{ operation: 'set', key: 'token', value: 'secret' }])).rejects.toThrow('environment was deleted')
    expect(db.variables.put).not.toHaveBeenCalled()
  })
})
