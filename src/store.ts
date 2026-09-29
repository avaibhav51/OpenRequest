import { create } from 'zustand'
import { db } from './db'
import { newRequest, uid, type Collection, type Environment, type HistoryEntry, type RequestDraft, type ResponseSnapshot, type WorkspaceVariable } from './types'
import defaultCollection from './data/default-collection.json'
import { hydrateLegacyQueryParams } from './lib/queryParams'
import { createSyncOutboxEntry, syncOutboxId, type SyncEntityType, type SyncOperation } from './lib/syncOutbox'

const queueSyncMutation = async (entityType: SyncEntityType, entityId: string, operation: SyncOperation) => {
  const previous = await db.syncOutbox.get(syncOutboxId(entityType, entityId))
  await db.syncOutbox.put(createSyncOutboxEntry(entityType, entityId, operation, Date.now(), previous))
}

interface AppState {
  collections: Collection[]
  requests: RequestDraft[]
  history: HistoryEntry[]
  environments: Environment[]
  variables: WorkspaceVariable[]
  activeEnvironmentId: string
  draft: RequestDraft
  response?: ResponseSnapshot
  error?: string
  busy: boolean
  hydrated: boolean
  pendingSyncCount: number
  hydrate: () => Promise<void>
  updateDraft: (patch: Partial<RequestDraft>) => void
  selectRequest: (request: RequestDraft) => void
  saveDraft: () => Promise<void>
  addCollection: (name: string) => Promise<void>
  removeCollection: (id: string) => Promise<void>
  recordRun: (response?: ResponseSnapshot) => Promise<void>
  setResponse: (response?: ResponseSnapshot, error?: string) => void
  setBusy: (busy: boolean) => void
  clearHistory: () => Promise<void>
  addEnvironment: (name: string) => Promise<void>
  removeEnvironment: (id: string) => Promise<void>
  setActiveEnvironment: (id: string) => void
  saveVariable: (variable: WorkspaceVariable) => Promise<void>
  removeVariable: (id: string) => Promise<void>
  captureVariable: (key: string, value: string) => Promise<void>
}

export const useAppStore = create<AppState>((set, get) => ({
  collections: [], requests: [], history: [], environments: [], variables: [], activeEnvironmentId: '', draft: newRequest(), busy: false, hydrated: false, pendingSyncCount: 0,
  hydrate: async () => {
    let [collections, requests, history, storedEnvironments, variables, pendingSyncCount] = await Promise.all([
      db.collections.orderBy('createdAt').toArray(),
      db.requests.orderBy('updatedAt').reverse().toArray(),
      db.history.orderBy('createdAt').reverse().limit(50).toArray(),
      db.environments.orderBy('createdAt').toArray(),
      db.variables.toArray(),
      db.syncOutbox.where('state').equals('pending').count()
    ])
    if (localStorage.getItem('default-collection-seeded-v1') !== 'yes') {
      const seed = defaultCollection as { collection: Collection; requests: RequestDraft[] }
      if (!collections.some((item) => item.id === seed.collection.id)) {
        await db.transaction('rw', db.collections, db.requests, async () => {
          await db.collections.add(seed.collection)
          await db.requests.bulkAdd(seed.requests)
        })
        collections = [...collections, seed.collection]
        requests = [...seed.requests, ...requests]
      }
      localStorage.setItem('default-collection-seeded-v1', 'yes')
    }
    if (localStorage.getItem('default-naas-seeded-v1') !== 'yes') {
      const seed = defaultCollection as { collection: Collection; requests: RequestDraft[] }
      const naas = seed.requests.find((request) => request.name === 'naas')
      if (naas && !requests.some((request) => request.id === naas.id)) {
        if (!collections.some((collection) => collection.id === seed.collection.id)) {
          await db.collections.put(seed.collection)
          collections = [...collections, seed.collection]
        }
        await db.requests.put(naas)
        requests = [naas, ...requests]
      }
      localStorage.setItem('default-naas-seeded-v1', 'yes')
    }
    let environments = storedEnvironments
    if (!environments.length) {
      const local: Environment = { id: uid(), schemaVersion: 1, name: 'Local', color: '#8eb51d', createdAt: Date.now() }
      await db.environments.add(local)
      environments = [local]
    }
    const savedActive = localStorage.getItem('active-environment')
    const activeEnvironmentId = environments.some((item) => item.id === savedActive) ? savedActive! : environments[0].id
    set({ collections, requests, history, environments, variables, activeEnvironmentId, pendingSyncCount, hydrated: true })
  },
  updateDraft: (patch) => set(({ draft }) => ({ draft: { ...draft, ...patch, updatedAt: Date.now() } })),
  selectRequest: (request) => set({ draft: structuredClone(hydrateLegacyQueryParams(request)), response: undefined, error: undefined }),
  saveDraft: async () => {
    const draft = { ...get().draft, name: get().draft.name.trim() || 'Untitled request', updatedAt: Date.now() }
    await db.transaction('rw', db.collections, db.requests, db.syncOutbox, async () => {
      await db.requests.put(draft)
      if (draft.collectionId && await db.collections.get(draft.collectionId)) {
        await queueSyncMutation('collection', draft.collectionId, 'upsert')
      }
      await queueSyncMutation('request', draft.id, 'upsert')
    })
    const requests = await db.requests.orderBy('updatedAt').reverse().toArray()
    const pendingSyncCount = await db.syncOutbox.count()
    set({ draft, requests, pendingSyncCount })
  },
  addCollection: async (name) => {
    const collection: Collection = { id: uid(), schemaVersion: 1, name: name.trim() || 'New collection', description: '', createdAt: Date.now() }
    await db.collections.add(collection)
    set(({ collections }) => ({ collections: [...collections, collection] }))
  },
  removeCollection: async (id) => {
    const updatedAt = Date.now()
    const affectedRequestIds = get().requests.filter((request) => request.collectionId === id).map((request) => request.id)
    await db.transaction('rw', db.collections, db.requests, db.syncOutbox, db.syncedEntities, async () => {
      const pendingCollection = await db.syncOutbox.get(syncOutboxId('collection', id))
      const syncedCollection = await db.syncedEntities.get(syncOutboxId('collection', id))
      await db.collections.delete(id)
      await db.requests.where('collectionId').equals(id).modify({ collectionId: undefined, updatedAt })
      if (syncedCollection) await queueSyncMutation('collection', id, 'delete')
      else if (pendingCollection) await db.syncOutbox.delete(syncOutboxId('collection', id))
      await Promise.all(affectedRequestIds.map((requestId) => queueSyncMutation('request', requestId, 'upsert')))
    })
    const pendingSyncCount = await db.syncOutbox.count()
    set(({ collections, requests }) => ({
      collections: collections.filter((item) => item.id !== id),
      requests: requests.map((item) => item.collectionId === id ? { ...item, collectionId: undefined, updatedAt } : item),
      pendingSyncCount
    }))
  },
  recordRun: async (response) => {
    const entry: HistoryEntry = {
      id: uid(), request: structuredClone(get().draft),
      response: response ? { status: response.status, durationMs: response.durationMs } : undefined,
      createdAt: Date.now()
    }
    await db.history.add(entry)
    set(({ history }) => ({ history: [entry, ...history].slice(0, 50) }))
  },
  setResponse: (response, error) => set({ response, error }),
  setBusy: (busy) => set({ busy }),
  clearHistory: async () => { await db.history.clear(); set({ history: [] }) },
  addEnvironment: async (name) => {
    const colors = ['#8eb51d', '#4f9ee8', '#a879e8', '#e5a630', '#df6767', '#2bb6a8']
    const environment: Environment = { id: uid(), schemaVersion: 1, name: name.trim() || 'Environment', color: colors[get().environments.length % colors.length], createdAt: Date.now() }
    await db.environments.add(environment)
    set(({ environments }) => ({ environments: [...environments, environment], activeEnvironmentId: environment.id }))
    localStorage.setItem('active-environment', environment.id)
  },
  removeEnvironment: async (id) => {
    if (get().environments.length <= 1) return
    await db.transaction('rw', db.environments, db.variables, async () => {
      await db.environments.delete(id)
      await db.variables.where('environmentId').equals(id).delete()
    })
    const environments = get().environments.filter((item) => item.id !== id)
    const activeEnvironmentId = get().activeEnvironmentId === id ? environments[0].id : get().activeEnvironmentId
    localStorage.setItem('active-environment', activeEnvironmentId)
    set(({ variables }) => ({ environments, activeEnvironmentId, variables: variables.filter((item) => item.environmentId !== id) }))
  },
  setActiveEnvironment: (id) => { localStorage.setItem('active-environment', id); set({ activeEnvironmentId: id }) },
  saveVariable: async (variable) => {
    await db.variables.put(variable)
    set(({ variables }) => ({ variables: [...variables.filter((item) => item.id !== variable.id), variable] }))
  },
  removeVariable: async (id) => { await db.variables.delete(id); set(({ variables }) => ({ variables: variables.filter((item) => item.id !== id) })) },
  captureVariable: async (key, value) => {
    const environmentId = get().activeEnvironmentId
    const existing = get().variables.find((item) => item.environmentId === environmentId && item.key === key)
    const variable: WorkspaceVariable = existing ? { ...existing, value, updatedAt: Date.now() } : { id: uid(), environmentId, key, value, enabled: true, secret: true, updatedAt: Date.now() }
    await db.variables.put(variable)
    set(({ variables }) => ({ variables: [...variables.filter((item) => item.id !== variable.id), variable] }))
  }
}))
