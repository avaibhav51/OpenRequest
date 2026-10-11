import { type KeyValue, type RequestDraft } from '../types'
import { hydrateLegacyQueryParams } from './queryParams'

const pairs = (rows: KeyValue[] = []) => rows
  .filter((row) => row.key !== '' || row.value !== '')
  .map(({ key, value, enabled }) => ({ key, value, enabled }))

const content = (draft: RequestDraft) => {
  const normalized = hydrateLegacyQueryParams(draft)
  return JSON.stringify({
    name: normalized.name, method: normalized.method, url: normalized.url,
    headers: pairs(normalized.headers), params: pairs(normalized.params),
    body: normalized.body, bodyType: normalized.bodyType,
    bodyFields: pairs(normalized.bodyFields), auth: normalized.auth ?? { type: 'none' },
    preRequestScript: normalized.preRequestScript, postResponseScript: normalized.postResponseScript,
    collectionId: normalized.collectionId ?? '', folderPath: normalized.folderPath ?? []
  })
}

/** Compare editable content, not timestamps or generated row identities. */
export const isDraftDirty = (draft: RequestDraft, saved?: RequestDraft): boolean => {
  const baseline = saved ?? {
    ...draft, name: 'Untitled request', method: 'GET', url: '', headers: [], params: [],
    body: '', bodyType: 'none', bodyFields: [], auth: { type: 'none' },
    preRequestScript: '', postResponseScript: '', collectionId: undefined, folderPath: []
  } satisfies RequestDraft
  return content(draft) !== content(baseline)
}
