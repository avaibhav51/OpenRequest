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
  return {
    ...request,
    url: resolveText(request.url, variables),
    body: resolveText(request.body, variables),
    headers: request.headers.map((item) => ({ ...item, key: resolveText(item.key, variables), value: resolveText(item.value, variables) })),
    params: request.params.map((item) => ({ ...item, key: resolveText(item.key, variables), value: resolveText(item.value, variables) }))
  }
}

export const referencedVariables = (request: RequestDraft) => {
  const source = [request.url, request.body, ...request.headers.flatMap((item) => [item.key, item.value]), ...request.params.flatMap((item) => [item.key, item.value])].join('\n')
  return [...new Set([...source.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)].map((match) => match[1].trim()))]
}
