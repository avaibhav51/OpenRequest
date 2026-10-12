import { uid, type Collection, type RequestDraft } from '../types'

export const matchesRequest = (request: RequestDraft, query: string, collectionName = '') =>
  `${request.name}\n${request.method}\n${request.url}\n${collectionName}`.toLowerCase().includes(query.trim().toLowerCase())

export function duplicateSavedRequest(request: RequestDraft, existing: RequestDraft[], now = Date.now()): RequestDraft {
  const names = new Set(existing.map((item) => item.name))
  let name = `${request.name} (copy)`
  for (let index = 2; names.has(name); index++) name = `${request.name} (copy ${index})`
  return { ...structuredClone(request), id: uid(), name, updatedAt: now }
}

export function detachDeletedRequest(draft: RequestDraft, collections: Collection[], now = Date.now()): RequestDraft {
  const collectionId = collections.some((item) => item.id === draft.collectionId) ? draft.collectionId : undefined
  return { ...structuredClone(draft), id: uid(), collectionId, folderPath: collectionId ? draft.folderPath : [], updatedAt: now }
}

// Update only metadata the user has not independently edited in this tab.
export function applySavedMetadata(draft: RequestDraft, before: RequestDraft, after: RequestDraft): RequestDraft {
  return { ...draft, name: draft.name === before.name ? after.name : draft.name,
    ...(draft.collectionId === before.collectionId && JSON.stringify(draft.folderPath ?? []) === JSON.stringify(before.folderPath ?? [])
      ? { collectionId: after.collectionId, folderPath: after.folderPath } : {}),
    updatedAt: after.updatedAt }
}
