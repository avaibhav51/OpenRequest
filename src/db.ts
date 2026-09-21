import Dexie, { type EntityTable } from 'dexie'
import type { Collection, Environment, HistoryEntry, RequestDraft, WorkspaceVariable } from './types'

class WorkbenchDatabase extends Dexie {
  collections!: EntityTable<Collection, 'id'>
  requests!: EntityTable<RequestDraft, 'id'>
  history!: EntityTable<HistoryEntry, 'id'>
  environments!: EntityTable<Environment, 'id'>
  variables!: EntityTable<WorkspaceVariable, 'id'>

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
  }
}

export const db = new WorkbenchDatabase()
