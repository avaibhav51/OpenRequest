export const SYNC_SCHEMA_VERSION = 1 as const

export type SyncEntityType = 'collection' | 'request' | 'environment'
export type SyncOperation = 'upsert' | 'delete'

export interface SyncOutboxEntry {
  id: string
  entityType: SyncEntityType
  entityId: string
  operation: SyncOperation
  schemaVersion: typeof SYNC_SCHEMA_VERSION
  state: 'pending'
  createdAt: number
  updatedAt: number
  attempts: number
  revisionId: string
  idempotencyKey: string
}

export const syncOutboxId = (entityType: SyncEntityType, entityId: string) => `${entityType}:${entityId}`

export const createSyncOutboxEntry = (
  entityType: SyncEntityType,
  entityId: string,
  operation: SyncOperation,
  now = Date.now(),
  previous?: SyncOutboxEntry,
): SyncOutboxEntry => ({
  id: syncOutboxId(entityType, entityId),
  entityType,
  entityId,
  operation,
  schemaVersion: SYNC_SCHEMA_VERSION,
  state: 'pending',
  createdAt: previous?.createdAt ?? now,
  updatedAt: now,
  attempts: 0,
  // A new mutation must not share a retry identity with an older in-flight upload.
  revisionId: crypto.randomUUID(),
  idempotencyKey: crypto.randomUUID(),
})
