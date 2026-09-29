import Dexie, { type EntityTable } from 'dexie'
import type { Collection, Environment, HistoryEntry, RequestDraft, WorkspaceVariable } from './types'
import type { SyncOutboxEntry } from './lib/syncOutbox'
import type { SyncWorkspaceBinding } from './lib/syncBinding'

export interface SyncSecret {
  id: 'primary'
  encodedWorkspaceKey: string
  lastPulledAt?: string
  updatedAt: number
}

export interface SyncedEntityMarker {
  id: string
  entityType: 'collection' | 'request' | 'environment'
  entityId: string
  syncedAt: number
}

class WorkbenchDatabase extends Dexie {
  collections!: EntityTable<Collection, 'id'>
  requests!: EntityTable<RequestDraft, 'id'>
  editorDrafts!: EntityTable<RequestDraft, 'id'>
  history!: EntityTable<HistoryEntry, 'id'>
  environments!: EntityTable<Environment, 'id'>
  variables!: EntityTable<WorkspaceVariable, 'id'>
  syncOutbox!: EntityTable<SyncOutboxEntry, 'id'>
  syncBindings!: EntityTable<SyncWorkspaceBinding, 'id'>
  syncSecrets!: EntityTable<SyncSecret, 'id'>
  syncedEntities!: EntityTable<SyncedEntityMarker, 'id'>

  constructor() {
    super('open-request-workbench')
    this.version(1).stores({
      collections: 'id, name, createdAt',
      requests: 'id, collectionId, updatedAt',
      history: 'id, createdAt'
    })
    this.version(2).stores({
      collections: 'id, name, createdAt',
      requests: 'id, collectionId, updatedAt',
      history: 'id, createdAt',
      environments: 'id, name, createdAt',
      variables: 'id, environmentId, [environmentId+key], updatedAt'
    })
    this.version(3).stores({
      collections: 'id, name, createdAt',
      requests: 'id, collectionId, updatedAt',
      history: 'id, createdAt',
      environments: 'id, name, createdAt',
      variables: 'id, environmentId, [environmentId+key], updatedAt',
      syncOutbox: 'id, [entityType+entityId], state, updatedAt'
    }).upgrade(async (transaction) => {
      await Promise.all([
        transaction.table('collections').toCollection().modify({ schemaVersion: 1 }),
        transaction.table('requests').toCollection().modify({ schemaVersion: 1 }),
        transaction.table('environments').toCollection().modify({ schemaVersion: 1 })
      ])
    })
    this.version(4).stores({
      collections: 'id, name, createdAt',
      requests: 'id, collectionId, updatedAt',
      history: 'id, createdAt',
      environments: 'id, name, createdAt',
      variables: 'id, environmentId, [environmentId+key], updatedAt',
      syncOutbox: 'id, [entityType+entityId], state, updatedAt',
      syncBindings: 'id, ownerId, remoteWorkspaceId, state'
    })
    this.version(5).stores({
      collections: 'id, name, createdAt',
      requests: 'id, collectionId, updatedAt',
      history: 'id, createdAt',
      environments: 'id, name, createdAt',
      variables: 'id, environmentId, [environmentId+key], updatedAt',
      syncOutbox: 'id, [entityType+entityId], state, updatedAt',
      syncBindings: 'id, ownerId, remoteWorkspaceId, state',
      syncSecrets: 'id, updatedAt'
    })
    this.version(6).stores({
      collections: 'id, name, createdAt',
      requests: 'id, collectionId, updatedAt',
      history: 'id, createdAt',
      environments: 'id, name, createdAt',
      variables: 'id, environmentId, [environmentId+key], updatedAt',
      syncOutbox: 'id, [entityType+entityId], state, updatedAt',
      syncBindings: 'id, ownerId, remoteWorkspaceId, state',
      syncSecrets: 'id, updatedAt',
      syncedEntities: 'id, [entityType+entityId], syncedAt'
    })
    this.version(7).stores({
      collections: 'id, name, createdAt',
      requests: 'id, collectionId, updatedAt',
      editorDrafts: 'id, updatedAt',
      history: 'id, createdAt',
      environments: 'id, name, createdAt',
      variables: 'id, environmentId, [environmentId+key], updatedAt',
      syncOutbox: 'id, [entityType+entityId], state, updatedAt',
      syncBindings: 'id, ownerId, remoteWorkspaceId, state',
      syncSecrets: 'id, updatedAt',
      syncedEntities: 'id, [entityType+entityId], syncedAt'
    })
  }
}

export const db = new WorkbenchDatabase()
