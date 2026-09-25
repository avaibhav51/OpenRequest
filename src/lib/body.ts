import { emptyPair, uid, type KeyValue, type RequestDraft } from '../types'

export type BodyType = RequestDraft['bodyType']

export function contentTypeForBody(type: BodyType): string | undefined {
  if (type === 'json') return 'application/json'
  if (type === 'text') return 'text/plain'
  if (type === 'form') return 'application/x-www-form-urlencoded'
  return undefined
}

export function bodyTypeFromContentType(contentType: string): BodyType | undefined {
  const value = contentType.toLowerCase()
  if (value.includes('application/json') || value.includes('+json')) return 'json'
  if (value.includes('application/x-www-form-urlencoded')) return 'form'
  if (value.includes('multipart/form-data')) return 'multipart'
  if (value.startsWith('text/')) return 'text'
  return undefined
}

export function headersForBodyType(headers: KeyValue[], type: BodyType): KeyValue[] {
  const withoutGenerated = headers.filter((header) => !(header.source === 'generated' && header.key.toLowerCase() === 'content-type'))
  const hasUserContentType = withoutGenerated.some((header) => header.enabled && header.key.toLowerCase() === 'content-type')
  const contentType = contentTypeForBody(type)
  if (!contentType || hasUserContentType) return withoutGenerated.length ? withoutGenerated : [emptyPair()]
  const blankAt = withoutGenerated.findIndex((header) => !header.key && !header.value)
  const generated: KeyValue = { id: uid(), key: 'Content-Type', value: contentType, enabled: true, source: 'generated' }
  if (blankAt < 0) return [...withoutGenerated, generated, emptyPair()]
  return [...withoutGenerated.slice(0, blankAt), generated, ...withoutGenerated.slice(blankAt)]
}

export function formFieldsFromBody(body: string): KeyValue[] {
  const fields = [...new URLSearchParams(body).entries()].map(([key, value]) => ({ id: uid(), key, value, enabled: true }))
  return [...fields, emptyPair()]
}
