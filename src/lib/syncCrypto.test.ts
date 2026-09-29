import { describe, expect, it } from 'vitest'
import {
  canonicalJson,
  decryptSyncPayload,
  encryptSyncPayload,
  exportWorkspaceKey,
  generateWorkspaceKey,
  importWorkspaceKey,
  type SyncEncryptionContext,
} from './syncCrypto'

const context: SyncEncryptionContext = {
  workspaceId: 'workspace-1', revisionId: 'revision-1', objectType: 'collection',
  objectId: 'collection-1', operation: 'upsert', envelopeVersion: 1,
}

describe('synchronization encryption envelope', () => {
  it('canonicalizes object keys for stable cross-client plaintext', () => {
    expect(canonicalJson({ z: 1, nested: { b: true, a: 'first' }, a: 2 }))
      .toBe('{"a":2,"nested":{"a":"first","b":true},"z":1}')
  })

  it('round trips through an exported workspace key without plaintext in the envelope', async () => {
    const key = await generateWorkspaceKey()
    const restoredKey = await importWorkspaceKey(await exportWorkspaceKey(key))
    const envelope = await encryptSyncPayload(restoredKey, context, { name: 'Private collection', count: 2 })
    expect(envelope.ciphertext).not.toContain('Private collection')
    await expect(decryptSyncPayload(restoredKey, context, envelope)).resolves.toEqual({ count: 2, name: 'Private collection' })
  })

  it('rejects tampering and moving ciphertext to another object', async () => {
    const key = await generateWorkspaceKey()
    const envelope = await encryptSyncPayload(key, context, { name: 'Bound data' })
    await expect(decryptSyncPayload(key, { ...context, objectId: 'other' }, envelope)).rejects.toThrow()
    const last = envelope.ciphertext.at(-1) === 'A' ? 'B' : 'A'
    await expect(decryptSyncPayload(key, context, { ...envelope, ciphertext: envelope.ciphertext.slice(0, -1) + last })).rejects.toThrow()
  })

  it('rejects incorrectly sized imported keys', () => {
    expect(() => importWorkspaceKey(btoa('too-short'))).toThrow('256 bits')
  })
})
