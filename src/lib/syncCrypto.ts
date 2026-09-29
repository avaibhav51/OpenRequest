export const SYNC_ENVELOPE_VERSION = 1 as const
export const SYNC_ALGORITHM = 'AES-GCM-256-v1' as const
export const SYNC_NONCE_BYTES = 12
export const MAX_SYNC_PLAINTEXT_BYTES = 1024 * 1024

export interface SyncEncryptionContext {
  workspaceId: string
  revisionId: string
  objectType: 'collection' | 'request' | 'environment'
  objectId: string
  operation: 'upsert' | 'delete'
  envelopeVersion: typeof SYNC_ENVELOPE_VERSION
}

export interface EncryptedSyncEnvelope {
  envelopeVersion: typeof SYNC_ENVELOPE_VERSION
  algorithm: typeof SYNC_ALGORITHM
  nonce: string
  ciphertext: string
}

const encoder = new TextEncoder()
const decoder = new TextDecoder('utf-8', { fatal: true })

const canonicalize = (value: unknown): unknown => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Sync payload numbers must be finite.')
    return value
  }
  if (Array.isArray(value)) return value.map(canonicalize)
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonicalize(item)]))
  }
  throw new Error('Sync payload contains an unsupported value.')
}

export const canonicalJson = (value: unknown) => JSON.stringify(canonicalize(value))

export const toBase64 = (bytes: Uint8Array) => {
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
  }
  return btoa(binary)
}

export const fromBase64 = (value: string) => {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

export const generateWorkspaceKey = () => crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])

export const exportWorkspaceKey = async (key: CryptoKey) => toBase64(new Uint8Array(await crypto.subtle.exportKey('raw', key)))

export const importWorkspaceKey = (encoded: string) => {
  const bytes = fromBase64(encoded)
  if (bytes.byteLength !== 32) throw new Error('Workspace keys must contain exactly 256 bits.')
  return crypto.subtle.importKey('raw', bytes, { name: 'AES-GCM' }, true, ['encrypt', 'decrypt'])
}

export async function encryptSyncPayload(key: CryptoKey, context: SyncEncryptionContext, payload: unknown): Promise<EncryptedSyncEnvelope> {
  const plaintext = encoder.encode(canonicalJson(payload))
  if (!plaintext.byteLength || plaintext.byteLength > MAX_SYNC_PLAINTEXT_BYTES) {
    throw new Error(`Sync payload must be between 1 byte and ${MAX_SYNC_PLAINTEXT_BYTES} bytes.`)
  }
  const nonce = crypto.getRandomValues(new Uint8Array(SYNC_NONCE_BYTES))
  const additionalData = encoder.encode(canonicalJson(context))
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, additionalData, tagLength: 128 }, key, plaintext)
  return {
    envelopeVersion: SYNC_ENVELOPE_VERSION,
    algorithm: SYNC_ALGORITHM,
    nonce: toBase64(nonce),
    ciphertext: toBase64(new Uint8Array(ciphertext)),
  }
}

export async function decryptSyncPayload<T>(key: CryptoKey, context: SyncEncryptionContext, envelope: EncryptedSyncEnvelope): Promise<T> {
  if (envelope.envelopeVersion !== SYNC_ENVELOPE_VERSION || envelope.algorithm !== SYNC_ALGORITHM) {
    throw new Error('Unsupported synchronization encryption envelope.')
  }
  const nonce = fromBase64(envelope.nonce)
  if (nonce.byteLength !== SYNC_NONCE_BYTES) throw new Error('Invalid synchronization nonce.')
  const additionalData = encoder.encode(canonicalJson(context))
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce, additionalData, tagLength: 128 }, key, fromBase64(envelope.ciphertext))
  return JSON.parse(decoder.decode(plaintext)) as T
}
