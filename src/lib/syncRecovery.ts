import { exportWorkspaceKey, fromBase64, importWorkspaceKey, toBase64 } from './syncCrypto'

const encoder = new TextEncoder()
const ITERATIONS = 310_000

export interface WrappedWorkspaceKey {
  wrappedKey: string
  keyNonce: string
  keySalt: string
  keyIterations: number
}

const deriveWrappingKey = async (passphrase: string, salt: Uint8Array<ArrayBuffer>, iterations: number) => {
  if (passphrase.length < 12) throw new Error('Use a sync passphrase containing at least 12 characters.')
  const material = await crypto.subtle.importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function wrapWorkspaceKey(workspaceId: string, workspaceKey: CryptoKey, passphrase: string): Promise<WrappedWorkspaceKey> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const nonce = crypto.getRandomValues(new Uint8Array(12))
  const wrappingKey = await deriveWrappingKey(passphrase, salt, ITERATIONS)
  const rawKey = fromBase64(await exportWorkspaceKey(workspaceKey))
  const wrapped = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce, additionalData: encoder.encode(`OpenRequest:${workspaceId}:workspace-key:v1`) },
    wrappingKey,
    rawKey,
  )
  return { wrappedKey: toBase64(new Uint8Array(wrapped)), keyNonce: toBase64(nonce), keySalt: toBase64(salt), keyIterations: ITERATIONS }
}

export async function unwrapWorkspaceKey(workspaceId: string, wrapped: WrappedWorkspaceKey, passphrase: string) {
  try {
    const wrappingKey = await deriveWrappingKey(passphrase, fromBase64(wrapped.keySalt), wrapped.keyIterations)
    const raw = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(wrapped.keyNonce), additionalData: encoder.encode(`OpenRequest:${workspaceId}:workspace-key:v1`) },
      wrappingKey,
      fromBase64(wrapped.wrappedKey),
    )
    return importWorkspaceKey(toBase64(new Uint8Array(raw)))
  } catch {
    throw new Error('The sync passphrase is incorrect or the wrapped workspace key is damaged.')
  }
}
