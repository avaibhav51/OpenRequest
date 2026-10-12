import type { Collection, RequestDraft } from '../types'

export const MAX_FOLDER_DEPTH = 12
export const folderKey = (path: string[]) => JSON.stringify(path)
export const sameFolder = (left: string[] = [], right: string[] = []) => folderKey(left) === folderKey(right)
export const inFolder = (path: string[] = [], parent: string[]) => parent.every((segment, index) => path[index] === segment)
export function validateFolderPath(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > MAX_FOLDER_DEPTH || value.some((name) => typeof name !== 'string' || !name.trim() || name.length > 100)) throw new Error('Folder paths need non-empty names of at most 100 characters and at most 12 levels.')
  return [...value] as string[]
}
export function collectionFolders(collection: Collection, requests: RequestDraft[]): string[][] {
  const found = new Map<string, string[]>()
  for (const path of [...(collection.folders ?? []), ...requests.filter((r) => r.collectionId === collection.id).map((r) => r.folderPath ?? [])]) {
    for (let depth = 1; depth <= path.length; depth++) {
      const parent = path.slice(0, depth)
      found.set(folderKey(parent), parent)
    }
  }
  return [...found.values()].sort((a, b) => a.join('/').localeCompare(b.join('/')))
}
export function childFolderPath(parent: string[], name: string): string[] {
  const trimmed = name.trim()
  if (/[\/\\]/.test(trimmed)) throw new Error('Use a single folder name; choose its parent separately.')
  return validateFolderPath([...parent, trimmed])
}
export function folderBackup(collection: Collection, requests: RequestDraft[], path: string[]) {
  return { format: 'openrequest.collection', version: 1,
    collection: { ...collection, folders: collectionFolders(collection, requests).filter((folder) => inFolder(folder, path) || inFolder(path, folder)) },
    requests: requests.filter((r) => r.collectionId === collection.id && inFolder(r.folderPath, path)) }
}
