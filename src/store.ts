import { create } from 'zustand'
import { db } from './db'
import { newRequest, uid, type Collection, type Environment, type HistoryEntry, type RequestDraft, type ResponseSnapshot, type WorkspaceVariable } from './types'
import defaultCollection from './data/default-collection.json'
import { hydrateLegacyQueryParams } from './lib/queryParams'
import { createSyncOutboxEntry, syncOutboxId, type SyncEntityType, type SyncOperation } from './lib/syncOutbox'
import type { EnvironmentMutation } from './lib/scripts'
import { parseCollectionBackup, planCollectionImport, type DuplicatePolicy } from './lib/collectionImport'
import { applySavedMetadata, detachDeletedRequest, duplicateSavedRequest } from './lib/requestManagement'
import { childFolderPath, collectionFolders, sameFolder, validateFolderPath, inFolder } from './lib/folders'

const queueSyncMutation = async (entityType: SyncEntityType, entityId: string, operation: SyncOperation) => {
  const previous = await db.syncOutbox.get(syncOutboxId(entityType, entityId))
  await db.syncOutbox.put(createSyncOutboxEntry(entityType, entityId, operation, Date.now(), previous))
}

interface RequestRun {
  runId: string
  busy: boolean
  response?: ResponseSnapshot
  error?: string
  controller?: AbortController
}

interface AppState {
  persistenceError: string
  pendingDraftWrites: number
  retryDraftPersistence: () => Promise<void>
  collections: Collection[]
  requests: RequestDraft[]
  history: HistoryEntry[]
  environments: Environment[]
  variables: WorkspaceVariable[]
  activeEnvironmentId: string
  draft: RequestDraft
  draftTabs: RequestDraft[]
  requestRuns: Record<string, RequestRun>
  hydrated: boolean
  pendingSyncCount: number
  hydrate: () => Promise<void>
  updateDraft: (patch: Partial<RequestDraft>) => void
  newDraft: () => void
  closeDraft: (id: string) => Promise<void>
  revertDraft: () => Promise<void>
  selectRequest: (request: RequestDraft) => void
  saveDraft: () => Promise<void>
  manageRequest: (id: string, patch: { name: string; collectionId?: string; folderPath?: string[] }) => Promise<void>
  addFolder: (collectionId: string, parent: string[], name: string) => Promise<string[]>
  manageFolder: (collectionId: string, path: string[], change: { name: string; parent: string[]; remove?: boolean }) => Promise<void>
  duplicateRequest: (id: string) => Promise<RequestDraft>
  removeRequest: (id: string) => Promise<void>
  importBackup: (text: string, policy: DuplicatePolicy) => Promise<{ collections: number; requests: number; skipped: number }>
  addCollection: (name: string) => Promise<Collection>
  removeCollection: (id: string) => Promise<void>
  recordRun: (request: RequestDraft, response?: ResponseSnapshot) => Promise<void>
  beginRun: (requestId: string) => string | undefined
  cancelRun: (requestId: string) => void
  finishRun: (requestId: string, runId: string, response?: ResponseSnapshot, error?: string) => void
  clearResponse: (requestId: string) => void
  clearHistory: () => Promise<void>
  addEnvironment: (name: string) => Promise<void>
  removeEnvironment: (id: string) => Promise<void>
  setActiveEnvironment: (id: string) => void
  saveVariable: (variable: WorkspaceVariable) => Promise<void>
  removeVariable: (id: string) => Promise<void>
  captureVariable: (key: string, value: string, environmentId?: string) => Promise<void>
  applyEnvironmentMutations: (environmentId: string, mutations: EnvironmentMutation[]) => Promise<void>
}

const initialDraft = newRequest()
const activeDraftKey = 'active-editor-draft'
const pendingWrites = new Map<string, Promise<void>>()
const failedWrites = new Set<string>()
const persistenceStatus = () => useAppStore.setState({ pendingDraftWrites: pendingWrites.size,
  persistenceError: failedWrites.size ? 'Some draft edits could not be stored. Keep this page open, retry, or copy/export important work before closing.' : '' })
const persistDraft = (draft: RequestDraft) => {
  const snapshot = structuredClone(draft)
  const write = (pendingWrites.get(draft.id) ?? Promise.resolve()).then(() => db.editorDrafts.put(snapshot))
    .then(() => { failedWrites.delete(draft.id) })
    .catch(() => { failedWrites.add(draft.id) })
    .finally(() => { if (pendingWrites.get(draft.id) === write) pendingWrites.delete(draft.id); persistenceStatus() })
  pendingWrites.set(draft.id, write); persistenceStatus()
  return write
}
export async function flushDraftPersistence() {
  while (pendingWrites.size) await Promise.all(pendingWrites.values())
  if (failedWrites.size) throw new Error('Resolve draft storage errors before updating.')
}

export const useAppStore = create<AppState>((set, get) => ({
  persistenceError: '', pendingDraftWrites: 0,
  retryDraftPersistence: async () => {
    await Promise.all(get().draftTabs.filter((draft) => failedWrites.has(draft.id)).map(persistDraft))
  },
  collections: [], requests: [], history: [], environments: [], variables: [], activeEnvironmentId: '', draft: initialDraft, draftTabs: [initialDraft], requestRuns: {}, hydrated: false, pendingSyncCount: 0,
  hydrate: async () => {
    let [collections, requests, editorDrafts, history, storedEnvironments, variables, pendingSyncCount, markers] = await Promise.all([
      db.collections.orderBy('createdAt').toArray(),
      db.requests.orderBy('updatedAt').reverse().toArray(),
      db.editorDrafts.orderBy('updatedAt').toArray(),
      db.history.orderBy('createdAt').reverse().limit(50).toArray(),
      db.environments.orderBy('createdAt').toArray(),
      db.variables.toArray(),
      db.syncOutbox.where('state').equals('pending').count(),
      db.syncedEntities.toArray()
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
    if (!editorDrafts.length) {
      editorDrafts = [get().draft]
      await db.editorDrafts.put(editorDrafts[0])
    }
    // Background sync refreshes saved entities, but must not replace live editor state.
    const live = get()
    if (live.hydrated) editorDrafts = live.draftTabs
    let wantedDraftId = live.hydrated ? live.draft.id : localStorage.getItem(activeDraftKey)
    const deletedIds = new Set(markers.filter((m) => m.entityType === 'request' && m.deleted && !requests.some((r) => r.id === m.entityId)).map((m) => m.entityId))
    const candidates = editorDrafts.filter((tab) => deletedIds.has(tab.id))
    const detached = candidates.length ? await db.transaction('rw', db.editorDrafts, db.syncedEntities, async () => {
      const result: { oldId: string; draft: RequestDraft }[] = []
      for (const tab of candidates) {
        const marker = await db.syncedEntities.get(syncOutboxId('request', tab.id))
        if (!marker?.deleted) continue
        const id = marker.draftReplacementId ?? uid()
        const replacement = await db.editorDrafts.get(id)
        const draft = replacement ?? { ...detachDeletedRequest(tab, collections), id }
        await db.editorDrafts.delete(tab.id); await db.editorDrafts.put(draft)
        await db.syncedEntities.put({ ...marker, draftReplacementId: id })
        result.push({ oldId: tab.id, draft })
      }
      return result
    }) : []
    if (detached.length) {
      if (live.hydrated) { editorDrafts = get().draftTabs; wantedDraftId = get().draft.id }
      for (const item of detached) {
        get().cancelRun(item.oldId)
        if (wantedDraftId === item.oldId) wantedDraftId = item.draft.id
      }
      editorDrafts = editorDrafts.map((tab) => {
        const item = detached.find((entry) => entry.oldId === tab.id)
        if (!item) return tab
        const recovered = live.hydrated ? { ...detachDeletedRequest(tab, collections), id: item.draft.id } : item.draft
        if (live.hydrated) void persistDraft(recovered)
        return recovered
      })
      set(({ requestRuns }) => ({ requestRuns: Object.fromEntries(Object.entries(requestRuns).filter(([id]) => !deletedIds.has(id))) }))
    }
    const draft = editorDrafts.find((item) => item.id === wantedDraftId) ?? editorDrafts.at(-1)!
    localStorage.setItem(activeDraftKey, draft.id)
    set({ collections, requests, history, environments, variables, activeEnvironmentId, pendingSyncCount, draftTabs: editorDrafts, draft, hydrated: true })
  },
  updateDraft: (patch) => set(({ draft, draftTabs }) => {
    const updated = { ...draft, ...patch, updatedAt: Date.now() }
    void persistDraft(updated)
    return { draft: updated, draftTabs: draftTabs.map((item) => item.id === updated.id ? updated : item) }
  }),
  newDraft: () => {
    const draft = newRequest()
    void persistDraft(draft)
    localStorage.setItem(activeDraftKey, draft.id)
    set(({ draftTabs }) => ({ draft, draftTabs: [...draftTabs, draft] }))
  },
  closeDraft: async (id) => {
    get().cancelRun(id)
    await pendingWrites.get(id)
    await db.editorDrafts.delete(id)
    failedWrites.delete(id); persistenceStatus()
    set(({ draft, draftTabs, requestRuns }) => {
      const index = draftTabs.findIndex((item) => item.id === id)
      if (index < 0) return { draft, draftTabs }
      const remaining = draftTabs.filter((item) => item.id !== id)
      const remainingRuns = { ...requestRuns }
      delete remainingRuns[id]
      if (remaining.length) {
        const next = draft.id === id ? remaining[Math.min(index, remaining.length - 1)] : draft
        localStorage.setItem(activeDraftKey, next.id)
        return { draft: next, draftTabs: remaining, requestRuns: remainingRuns }
      }
      const next = newRequest()
      void persistDraft(next)
      localStorage.setItem(activeDraftKey, next.id)
      return { draft: next, draftTabs: [next], requestRuns: remainingRuns }
    })
  },
  revertDraft: async () => {
    const saved = get().requests.find((request) => request.id === get().draft.id)
    if (!saved) return
    const draft = structuredClone(hydrateLegacyQueryParams(saved))
    await pendingWrites.get(draft.id)
    await db.editorDrafts.put(draft)
    set((state) => ({ draft: state.draft.id === draft.id ? draft : state.draft, draftTabs: state.draftTabs.map((item) => item.id === draft.id ? draft : item) }))
  },
  selectRequest: (request) => set(({ draftTabs, requests }) => {
    const existing = draftTabs.find((item) => item.id === request.id)
    const draft = existing ?? structuredClone(hydrateLegacyQueryParams(requests.some((saved) => saved.id === request.id) ? request : { ...request, id: uid() }))
    if (!existing) void persistDraft(draft)
    localStorage.setItem(activeDraftKey, draft.id)
    return { draft, draftTabs: existing ? draftTabs : [...draftTabs, draft] }
  }),
  saveDraft: async () => {
    const draft = { ...get().draft, name: get().draft.name.trim() || 'Untitled request', updatedAt: Date.now() }
    set(({ draftTabs }) => ({ draft, draftTabs: draftTabs.map((item) => item.id === draft.id ? draft : item) }))
    await pendingWrites.get(draft.id)
    await db.transaction('rw', db.collections, db.requests, db.editorDrafts, db.syncOutbox, db.syncedEntities, async () => {
      if ((await db.syncedEntities.get(syncOutboxId('request', draft.id)))?.deleted && !await db.requests.get(draft.id)) throw new Error('This request was deleted. Refresh to recover the open copy as a new local draft before saving.')
      const collection = draft.collectionId ? await db.collections.get(draft.collectionId) : undefined
      if (draft.collectionId && !collection) throw new Error('The collection no longer exists. Choose Unfiled or another collection.')
      const path = validateFolderPath(draft.folderPath ?? [])
      if (path.length && (!collection || !collectionFolders(collection, await db.requests.toArray()).some((folder) => sameFolder(folder, path)))) throw new Error('The folder no longer exists. Choose the collection root or another folder.')
      await db.requests.put(draft)
      await db.editorDrafts.put(draft)
      if (draft.collectionId && await db.collections.get(draft.collectionId)) {
        await queueSyncMutation('collection', draft.collectionId, 'upsert')
      }
      await queueSyncMutation('request', draft.id, 'upsert')
    })
    failedWrites.delete(draft.id); persistenceStatus()
    const requests = await db.requests.orderBy('updatedAt').reverse().toArray()
    const pendingSyncCount = await db.syncOutbox.count()
    set({ requests, pendingSyncCount })
  },
  manageRequest: async (id, patch) => {
    await pendingWrites.get(id)
    const name = patch.name.trim()
    if (!name) throw new Error('Request name cannot be empty.')
    const result = await db.transaction('rw', db.requests, db.collections, db.editorDrafts, db.syncOutbox, async () => {
      const before = await db.requests.get(id)
      if (!before) throw new Error('This saved request no longer exists.')
      const destination = patch.collectionId ? await db.collections.get(patch.collectionId) : undefined
      if (patch.collectionId && !destination) throw new Error('The destination collection no longer exists.')
      const folderPath = validateFolderPath(patch.folderPath ?? (before.collectionId === patch.collectionId ? before.folderPath ?? [] : []))
      if (folderPath.length && (!destination || !collectionFolders(destination, await db.requests.toArray()).some((path) => sameFolder(path, folderPath)))) throw new Error('The destination folder no longer exists.')
      if (before.name === name && before.collectionId === patch.collectionId && sameFolder(before.folderPath, folderPath)) return undefined
      const next = { ...before, name, collectionId: patch.collectionId, folderPath, updatedAt: Date.now() }
      await db.requests.put(next)
      const tab = await db.editorDrafts.get(id)
      if (tab) await db.editorDrafts.put(applySavedMetadata(tab, before, next))
      if (next.collectionId) await queueSyncMutation('collection', next.collectionId, 'upsert')
      await queueSyncMutation('request', id, 'upsert')
      return { before, next, pending: await db.syncOutbox.count() }
    })
    if (!result) return
    set(({ draft, draftTabs, requests }) => ({
      draft: draft.id === id ? applySavedMetadata(draft, result.before, result.next) : draft,
      draftTabs: draftTabs.map((tab) => tab.id === id ? applySavedMetadata(tab, result.before, result.next) : tab),
      requests: requests.map((r) => r.id === id ? result.next : r), pendingSyncCount: result.pending,
    }))
  },
  addFolder: async (collectionId, parent, name) => {
    const path = childFolderPath(validateFolderPath(parent), name)
    const result = await db.transaction('rw', db.collections, db.requests, db.syncOutbox, db.syncedEntities, async () => {
      const collection = await db.collections.get(collectionId)
      if (!collection) throw new Error('The collection no longer exists.')
      const folders = collectionFolders(collection, await db.requests.toArray())
      if (parent.length && !folders.some((folder) => sameFolder(folder, parent))) throw new Error('The parent folder no longer exists.')
      if (folders.some((folder) => sameFolder(folder, path))) throw new Error('A folder with this name already exists here.')
      const next = { ...collection, folders: [...folders, path] }
      await db.collections.put(next)
      const marker = await db.syncedEntities.get(syncOutboxId('collection', collectionId))
      if ((marker && !marker.deleted) || await db.syncOutbox.get(syncOutboxId('collection', collectionId))) await queueSyncMutation('collection', collectionId, 'upsert')
      return { next, pending: await db.syncOutbox.count() }
    })
    set(({ collections }) => ({ collections: collections.map((c) => c.id === collectionId ? result.next : c), pendingSyncCount: result.pending }))
    return path
  },
  manageFolder: async (collectionId, path, change) => {
    await flushDraftPersistence()
    const result = await db.transaction('rw', db.collections, db.requests, db.editorDrafts, db.syncOutbox, db.syncedEntities, async () => {
      const collection = await db.collections.get(collectionId)
      if (!collection) throw new Error('The collection no longer exists.')
      const all = await db.requests.toArray(), folders = collectionFolders(collection, all)
      if (!path.length || !folders.some((f) => sameFolder(f, path))) throw new Error('The folder no longer exists.')
      const destination = change.remove ? [] : childFolderPath(validateFolderPath(change.parent), change.name)
      if (!change.remove) {
        if (inFolder(change.parent, path)) throw new Error('A folder cannot move into itself or its descendants.')
        if (change.parent.length && !folders.some((f) => sameFolder(f, change.parent))) throw new Error('The destination folder no longer exists.')
        if (!sameFolder(destination, path) && folders.some((f) => sameFolder(f, destination))) throw new Error('A folder with this name already exists there.')
        if (sameFolder(destination, path)) return undefined
      }
      const replace = (f: string[]) => validateFolderPath([...destination, ...f.slice(path.length)])
      const nextFolders = folders.flatMap((f) => inFolder(f, path) ? change.remove ? [] : [replace(f)] : [f])
      const next = { ...collection, folders: nextFolders }
      await db.collections.put(next)
      const changes = []
      for (const before of all.filter((r) => r.collectionId === collectionId && inFolder(r.folderPath, path))) {
        const after = { ...before, folderPath: change.remove ? [] : replace(before.folderPath ?? []), updatedAt: Date.now() }
        await db.requests.put(after)
        const tab = await db.editorDrafts.get(before.id)
        if (tab) await db.editorDrafts.put(applySavedMetadata(tab, before, after))
        await queueSyncMutation('request', before.id, 'upsert')
        changes.push({ before, after })
      }
      const marker = await db.syncedEntities.get(syncOutboxId('collection', collectionId))
      if (changes.length || (marker && !marker.deleted) || await db.syncOutbox.get(syncOutboxId('collection', collectionId))) await queueSyncMutation('collection', collectionId, 'upsert')
      return { next, changes, pending: await db.syncOutbox.count() }
    })
    if (!result) return
    const update = (tab: RequestDraft) => { const change = result.changes.find((c) => c.before.id === tab.id); return change ? applySavedMetadata(tab, change.before, change.after) : tab }
    set(({ draft, draftTabs, requests, collections }) => ({ draft: update(draft), draftTabs: draftTabs.map(update),
      requests: requests.map((r) => result.changes.find((c) => c.before.id === r.id)?.after ?? r),
      collections: collections.map((c) => c.id === collectionId ? result.next : c), pendingSyncCount: result.pending }))
  },
  duplicateRequest: async (id) => {
    const result = await db.transaction('rw', db.requests, db.collections, db.syncOutbox, async () => {
      const saved = await db.requests.get(id)
      if (!saved) throw new Error('This saved request no longer exists.')
      const copy = duplicateSavedRequest(saved, await db.requests.toArray())
      if (copy.collectionId && !await db.collections.get(copy.collectionId)) { copy.collectionId = undefined; copy.folderPath = [] }
      await db.requests.add(copy)
      if (copy.collectionId) await queueSyncMutation('collection', copy.collectionId, 'upsert')
      await queueSyncMutation('request', copy.id, 'upsert')
      return { copy, pending: await db.syncOutbox.count() }
    })
    set(({ requests }) => ({ requests: [result.copy, ...requests], pendingSyncCount: result.pending }))
    return result.copy
  },
  removeRequest: async (id) => {
    await pendingWrites.get(id)
    const result = await db.transaction('rw', db.requests, db.collections, db.editorDrafts, db.syncOutbox, db.syncedEntities, async () => {
      if (!await db.requests.get(id)) throw new Error('This saved request no longer exists.')
      const markerId = syncOutboxId('request', id)
      const marker = await db.syncedEntities.get(markerId)
      const pending = await db.syncOutbox.get(markerId)
      const tab = await db.editorDrafts.get(id)
      const detached = tab ? detachDeletedRequest(tab, await db.collections.toArray()) : undefined
      await db.requests.delete(id)
      if (tab && detached) { await db.editorDrafts.delete(id); await db.editorDrafts.put(detached) }
      // Pending upserts may already be on the wire: retain a distinct tombstone.
      if (pending || (marker && !marker.deleted)) await queueSyncMutation('request', id, 'delete')
      await db.syncedEntities.put({ id: markerId, entityType: 'request', entityId: id, deleted: true, draftReplacementId: detached?.id, syncedAt: marker?.syncedAt ?? 0 })
      return { detached, pending: await db.syncOutbox.count() }
    })
    get().cancelRun(id)
    set(({ draft, draftTabs, requests, requestRuns, collections }) => {
      const tabs = draftTabs.map((tab) => tab.id === id ? { ...detachDeletedRequest(tab, collections), id: result.detached?.id ?? uid() } : tab)
      const next = draft.id === id ? tabs.find((tab) => tab.id === result.detached?.id) ?? tabs[draftTabs.findIndex((tab) => tab.id === id)] : draft
      if (draft.id === id) localStorage.setItem(activeDraftKey, next.id)
      return { draft: next, draftTabs: tabs, requests: requests.filter((r) => r.id !== id), requestRuns: Object.fromEntries(Object.entries(requestRuns).filter(([key]) => key !== id)), pendingSyncCount: result.pending }
    })
  },
  importBackup: async (text, policy) => {
    const backup = parseCollectionBackup(text)
    const result = await db.transaction('rw', db.collections, db.requests, async () => {
      const existing = { collections: await db.collections.toArray(), requests: await db.requests.toArray() }
      const plan = planCollectionImport(backup, existing, policy)
      await db.collections.bulkAdd(plan.collections)
      await db.requests.bulkAdd(plan.requests)
      return {
        summary: { collections: plan.collections.length, requests: plan.requests.length, skipped: plan.skipped },
        collections: await db.collections.orderBy('createdAt').toArray(),
        requests: await db.requests.orderBy('updatedAt').reverse().toArray(),
      }
    })
    // Import is local-only: no outbox entries, run changes or draft replacement.
    set({ collections: result.collections, requests: result.requests })
    return result.summary
  },
  addCollection: async (name) => {
    const collection: Collection = { id: uid(), schemaVersion: 1, name: name.trim() || 'New collection', description: '', createdAt: Date.now() }
    await db.collections.add(collection)
    set(({ collections }) => ({ collections: [...collections, collection] }))
    return collection
  },
  removeCollection: async (id) => {
    await flushDraftPersistence()
    const updatedAt = Date.now()
    const changes = await db.transaction('rw', db.collections, db.requests, db.editorDrafts, db.syncOutbox, db.syncedEntities, async () => {
      const pendingCollection = await db.syncOutbox.get(syncOutboxId('collection', id))
      const syncedCollection = await db.syncedEntities.get(syncOutboxId('collection', id))
      const affected = await db.requests.where('collectionId').equals(id).toArray()
      await db.collections.delete(id)
      const moved = affected.map((before) => ({ before, next: { ...before, collectionId: undefined, folderPath: [], updatedAt } }))
      for (const change of moved) {
        await db.requests.put(change.next)
        const tab = await db.editorDrafts.get(change.before.id)
        if (tab) await db.editorDrafts.put(applySavedMetadata(tab, change.before, change.next))
        await queueSyncMutation('request', change.before.id, 'upsert')
      }
      if (pendingCollection || (syncedCollection && !syncedCollection.deleted)) await queueSyncMutation('collection', id, 'delete')
      return moved
    })
    const pendingSyncCount = await db.syncOutbox.count()
    const update = (tab: RequestDraft) => {
      const change = changes.find((entry) => entry.before.id === tab.id)
      return change ? applySavedMetadata(tab, change.before, change.next) : tab
    }
    set(({ collections, requests, draft, draftTabs }) => ({ collections: collections.filter((item) => item.id !== id),
      requests: requests.map((item) => changes.find((entry) => entry.before.id === item.id)?.next ?? item),
      draft: update(draft), draftTabs: draftTabs.map(update), pendingSyncCount }))
  },
  recordRun: async (request, response) => {
    const entry: HistoryEntry = {
      id: uid(), request: structuredClone(request),
      response: response ? { status: response.status, durationMs: response.durationMs } : undefined,
      createdAt: Date.now()
    }
    await db.transaction('rw', db.history, async () => {
      await db.history.add(entry)
      await db.history.orderBy('createdAt').reverse().offset(50).delete()
    })
    set(({ history }) => ({ history: [entry, ...history].slice(0, 50) }))
  },
  beginRun: (requestId) => {
    if (get().requestRuns[requestId]?.busy) return undefined
    const runId = uid()
    set(({ requestRuns }) => ({ requestRuns: { ...requestRuns, [requestId]: { runId, busy: true, controller: new AbortController() } } }))
    return runId
  },
  cancelRun: (requestId) => {
    const run = get().requestRuns[requestId]
    if (!run?.busy) return
    run.controller?.abort()
    set(({ requestRuns }) => ({ requestRuns: { ...requestRuns, [requestId]: { ...run, busy: false, response: undefined, error: 'Request cancelled.' } } }))
  },
  finishRun: (requestId, runId, response, error) => set(({ requestRuns }) => {
    // Closing/reopening a tab or starting a later run invalidates stale completions.
    if (requestRuns[requestId]?.runId !== runId) return {}
    if (response && requestRuns[requestId]?.controller?.signal.aborted) return {}
    return { requestRuns: { ...requestRuns, [requestId]: { runId, busy: false, response, error } } }
  }),
  clearResponse: (requestId) => set(({ requestRuns }) => {
    const run = requestRuns[requestId]
    return run ? { requestRuns: { ...requestRuns, [requestId]: { ...run, response: undefined, error: undefined } } } : {}
  }),
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
  applyEnvironmentMutations: async (environmentId, mutations) => {
    if (!mutations.length) return
    await db.transaction('rw', db.environments, db.variables, async () => {
      if (!await db.environments.get(environmentId)) throw new Error('The request environment was deleted; variable changes were not stored.')
      let rows = await db.variables.where('environmentId').equals(environmentId).toArray()
      for (const mutation of mutations) {
        const matching = rows.filter((row) => row.key === mutation.key)
        await db.variables.bulkDelete(matching.map((row) => row.id))
        rows = rows.filter((row) => row.key !== mutation.key)
        if (mutation.operation === 'set') {
          const variable: WorkspaceVariable = { id: matching[0]?.id ?? uid(), environmentId, key: mutation.key, value: mutation.value, enabled: true, secret: true, updatedAt: Date.now() }
          await db.variables.put(variable)
          rows.push(variable)
        }
      }
    })
    const variables = await db.variables.toArray()
    set({ variables })
  },
  captureVariable: async (key, value, environmentId = get().activeEnvironmentId) => {
    if (!get().environments.some((environment) => environment.id === environmentId)) throw new Error('The request environment was deleted; captured variables were not stored.')
    const existing = get().variables.find((item) => item.environmentId === environmentId && item.key === key)
    const variable: WorkspaceVariable = existing ? { ...existing, value, updatedAt: Date.now() } : { id: uid(), environmentId, key, value, enabled: true, secret: true, updatedAt: Date.now() }
    await db.variables.put(variable)
    set(({ variables }) => ({ variables: [...variables.filter((item) => item.id !== variable.id), variable] }))
  }
}))
