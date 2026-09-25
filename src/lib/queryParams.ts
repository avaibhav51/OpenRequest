import { emptyPair, uid, type KeyValue, type RequestDraft } from '../types'

const queryPart = (url: string) => {
  const question = url.indexOf('?')
  if (question < 0) return ''
  const hash = url.indexOf('#', question)
  return url.slice(question + 1, hash < 0 ? undefined : hash)
}

export function queryParamsFromUrl(url: string): KeyValue[] {
  const query = queryPart(url)
  if (!query) return [emptyPair()]
  const pairs = [...new URLSearchParams(query).entries()].map(([key, value]) => ({ id: uid(), key, value, enabled: true }))
  return [...pairs, emptyPair()]
}

const encodeTemplateValue = (value: string) => encodeURIComponent(value)
  .replaceAll('%7B%7B', '{{')
  .replaceAll('%7D%7D', '}}')

export function urlWithQueryParams(url: string, params: KeyValue[]): string {
  const hashAt = url.indexOf('#')
  const hash = hashAt < 0 ? '' : url.slice(hashAt)
  const withoutHash = hashAt < 0 ? url : url.slice(0, hashAt)
  const base = withoutHash.split('?')[0]
  const query = params
    .filter((pair) => pair.enabled && pair.key.trim())
    .map((pair) => `${encodeTemplateValue(pair.key.trim())}=${encodeTemplateValue(pair.value)}`)
    .join('&')
  return `${base}${query ? `?${query}` : ''}${hash}`
}

export function hydrateLegacyQueryParams(request: RequestDraft): RequestDraft {
  const hasStoredParams = request.params.some((pair) => pair.key.trim())
  if (hasStoredParams || !queryPart(request.url)) return request
  return { ...request, params: queryParamsFromUrl(request.url) }
}
