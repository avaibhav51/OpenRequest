import type { Collection, Environment, RequestDraft } from '../types'

export type SyncEntityPayload = Collection | Environment | RequestDraft

const sensitiveHeader = /^(authorization|proxy-authorization|cookie|set-cookie|x-api-key|api-key)$/i
/** Only placeholders and standard auth prefixes/separators may leave this browser. */
export const portableCredential = (value: string): string => {
  if (!/\{\{[$\w.-]+\}\}/.test(value)) return ''
  const remaining = value.replace(/^(Bearer|Basic)\s+/i, '').replace(/\{\{[$\w.-]+\}\}/g, '')
  return /^[\s:]*$/.test(remaining) ? value : ''
}

export const createSyncPayload = (entity: Collection | Environment | RequestDraft): SyncEntityPayload => {
  const payload = structuredClone(entity)
  if (!('method' in payload)) return payload
  payload.headers = payload.headers.map((header) => sensitiveHeader.test(header.key.trim()) ? { ...header, value: portableCredential(header.value) } : header)
  if (payload.auth?.type === 'bearer') payload.auth.token = portableCredential(payload.auth.token)
  if (payload.auth?.type === 'basic') payload.auth.password = portableCredential(payload.auth.password)
  if (payload.auth?.type === 'api-key') payload.auth.value = portableCredential(payload.auth.value)
  return payload
}

export const createInitialSyncPayload = createSyncPayload

/** Remote redaction must never erase a matching browser-local saved secret. */
export function mergeSyncedRequest(remote: RequestDraft, local?: RequestDraft): RequestDraft {
  const next = createSyncPayload(remote) as RequestDraft
  if (!local) return next
  if (remote.url !== local.url) {
    try { if (new URL(remote.url).origin !== new URL(local.url).origin) return next }
    catch { return next } // An unparseable changed target needs explicit local credentials.
  }
  next.headers = next.headers.map((header) => {
    if (!sensitiveHeader.test(header.key.trim()) || header.value) return header
    const matches = local.headers.filter((h) => h.key.trim().toLowerCase() === header.key.trim().toLowerCase())
    const previous = matches.find((h) => h.id === header.id) ?? (matches.length === 1 && next.headers.filter((h) => h.key.trim().toLowerCase() === header.key.trim().toLowerCase()).length === 1 ? matches[0] : undefined)
    return previous ? { ...header, value: previous.value } : header
  })
  const a = next.auth, b = local.auth
  if (a?.type === 'bearer' && b?.type === 'bearer' && !a.token) a.token = b.token
  if (a?.type === 'basic' && b?.type === 'basic' && a.username === b.username && !a.password) a.password = b.password
  if (a?.type === 'api-key' && b?.type === 'api-key' && a.key === b.key && a.location === b.location && !a.value) a.value = b.value
  return next
}
