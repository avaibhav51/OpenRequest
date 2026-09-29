import { describe, expect, it } from 'vitest'
import { assertSyncWorkspaceOwner, createSyncWorkspaceBinding } from './syncBinding'

describe('sync workspace ownership', () => {
  it('binds one local workspace to one immutable account identity', () => {
    const binding = createSyncWorkspaceBinding('local-1', 'alice', 'remote-1', 100)
    expect(assertSyncWorkspaceOwner(binding, 'alice')).toBe(binding)
    expect(binding).toMatchObject({ id: 'primary', state: 'active', remoteWorkspaceId: 'remote-1', createdAt: 100 })
  })

  it('pauses instead of uploading after an account switch', () => {
    const binding = createSyncWorkspaceBinding('local-1', 'alice', 'remote-1')
    expect(() => assertSyncWorkspaceOwner(binding, 'bob')).toThrow('different account')
    expect(() => assertSyncWorkspaceOwner(undefined, 'alice')).toThrow('not been explicitly prepared')
  })
})
