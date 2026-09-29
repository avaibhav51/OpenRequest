import type { Collection, Environment, RequestDraft } from '../types'

export type SyncEntityPayload = Collection | Environment | RequestDraft

const sensitiveHeader = /^(authorization|proxy-authorization|cookie|set-cookie|x-api-key|api-key)$/i

export const createSyncPayload = (entity: Collection | Environment | RequestDraft): SyncEntityPayload => {
  const payload = structuredClone(entity)
  if (!('method' in payload)) return payload
  payload.headers = payload.headers.map((header) => sensitiveHeader.test(header.key.trim()) ? { ...header, value: '' } : header)
  if (payload.auth?.type === 'bearer') payload.auth.token = ''
  if (payload.auth?.type === 'basic') payload.auth.password = ''
  if (payload.auth?.type === 'api-key') payload.auth.value = ''
  return payload
}

export const createInitialSyncPayload = createSyncPayload
