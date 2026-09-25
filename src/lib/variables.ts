import type { RequestDraft, WorkspaceVariable } from '../types'

export type VariableMap = Record<string, string>

export const variableMap = (variables: WorkspaceVariable[], environmentId: string): VariableMap => Object.fromEntries(
  variables.filter((item) => item.environmentId === environmentId && item.enabled && item.key.trim()).map((item) => [item.key.trim(), item.value])
)

const builtins = (): VariableMap => ({
  '$timestamp': String(Date.now()),
  '$isoTimestamp': new Date().toISOString(),
  '$randomUUID': crypto.randomUUID()
})

export function resolveText(input: string, variables: VariableMap, strict = true): string {
  const values = { ...builtins(), ...variables }
  const missing = new Set<string>()
  const resolved = input.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_, rawKey: string) => {
    const key = rawKey.trim()
    if (Object.hasOwn(values, key)) return values[key]
    missing.add(key)
    return `{{${key}}}`
  })
  if (strict && missing.size) throw new Error(`Missing variable${missing.size > 1 ? 's' : ''}: ${[...missing].join(', ')}`)
  return resolved
}

export function resolveRequest(request: RequestDraft, variables: VariableMap): RequestDraft {
  const auth = request.auth?.type === 'bearer'
    ? { ...request.auth, token: resolveText(request.auth.token, variables) }
    : request.auth?.type === 'basic'
      ? { ...request.auth, username: resolveText(request.auth.username, variables), password: resolveText(request.auth.password, variables) }
      : request.auth?.type === 'api-key'
        ? { ...request.auth, key: resolveText(request.auth.key, variables), value: resolveText(request.auth.value, variables) }
        : request.auth
  return {
    ...request,
    url: resolveText(request.url, variables),
    body: resolveText(request.body, variables),
    headers: request.headers.map((item) => ({ ...item, key: resolveText(item.key, variables), value: resolveText(item.value, variables) })),
    params: request.params.map((item) => ({ ...item, key: resolveText(item.key, variables), value: resolveText(item.value, variables) })),
    bodyFields: request.bodyFields?.map((item) => ({ ...item, key: resolveText(item.key, variables), value: resolveText(item.value, variables) })),
    auth
  }
}

export const referencedVariables = (request: RequestDraft) => {
  const authValues = request.auth?.type === 'bearer' ? [request.auth.token]
    : request.auth?.type === 'basic' ? [request.auth.username, request.auth.password]
      : request.auth?.type === 'api-key' ? [request.auth.key, request.auth.value] : []
  const source = [request.url, request.body, ...request.headers.flatMap((item) => [item.key, item.value]), ...request.params.flatMap((item) => [item.key, item.value]), ...(request.bodyFields ?? []).flatMap((item) => [item.key, item.value]), ...authValues].join('\n')
  return [...new Set([...source.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)].map((match) => match[1].trim()))]
}
