export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS'

export interface KeyValue {
  id: string
  key: string
  value: string
  enabled: boolean
}

export interface RequestDraft {
  id: string
  name: string
  method: HttpMethod
  url: string
  headers: KeyValue[]
  params: KeyValue[]
  body: string
  bodyType: 'none' | 'json' | 'text'
  preRequestScript: string
  postResponseScript: string
  collectionId?: string
  folderPath?: string[]
  updatedAt: number
}

export interface Environment {
  id: string
  name: string
  color: string
  createdAt: number
}

export interface WorkspaceVariable {
  id: string
  environmentId: string
  key: string
  value: string
  enabled: boolean
  secret: boolean
  updatedAt: number
}

export interface Collection {
  id: string
  name: string
  description: string
  createdAt: number
}

export interface ResponseSnapshot {
  status: number
  statusText: string
  durationMs: number
  sizeBytes: number
  headers: KeyValue[]
  body: string
  contentType: string
  requestedAt: number
  scriptLogs?: string[]
  scriptError?: string
}

export interface HistoryEntry {
  id: string
  request: RequestDraft
  response?: Pick<ResponseSnapshot, 'status' | 'durationMs'>
  createdAt: number
}

export const uid = () => crypto.randomUUID()

export const emptyPair = (): KeyValue => ({ id: uid(), key: '', value: '', enabled: true })

export const newRequest = (): RequestDraft => ({
  id: uid(),
  name: 'Untitled request',
  method: 'GET',
  url: '',
  headers: [emptyPair()],
  params: [emptyPair()],
  body: '',
  bodyType: 'none',
  preRequestScript: '',
  postResponseScript: '',
  updatedAt: Date.now()
})
