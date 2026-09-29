import { describe, expect, it } from 'vitest'
import { exportWorkspaceKey, generateWorkspaceKey } from './syncCrypto'
import { unwrapWorkspaceKey, wrapWorkspaceKey } from './syncRecovery'

describe('workspace-key recovery wrapping', () => {
  it('unlocks the same workspace key with the passphrase', async () => {
    const key = await generateWorkspaceKey()
    const wrapped = await wrapWorkspaceKey('workspace-1', key, 'correct horse battery staple')
    const unlocked = await unwrapWorkspaceKey('workspace-1', wrapped, 'correct horse battery staple')
    expect(await exportWorkspaceKey(unlocked)).toBe(await exportWorkspaceKey(key))
    expect(JSON.stringify(wrapped)).not.toContain(await exportWorkspaceKey(key))
  })

  it('rejects a wrong passphrase or another workspace context', async () => {
    const wrapped = await wrapWorkspaceKey('workspace-1', await generateWorkspaceKey(), 'correct horse battery staple')
    await expect(unwrapWorkspaceKey('workspace-1', wrapped, 'incorrect passphrase')).rejects.toThrow('incorrect')
    await expect(unwrapWorkspaceKey('workspace-2', wrapped, 'correct horse battery staple')).rejects.toThrow('incorrect')
  })
})
