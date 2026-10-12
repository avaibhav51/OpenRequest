import { emptyPair, type RequestDraft, type ResponseSnapshot } from '../types'
import { resolveText, type VariableMap } from './variables'
import { hydrateLegacyQueryParams, urlWithQueryParams } from './queryParams'
import { abortableDelay, checkCancelled } from './requestControl'

export type EnvironmentMutation = { operation: 'set'; key: string; value: string } | { operation: 'unset'; key: string }

export interface ScriptRun {
  request: RequestDraft
  variables: VariableMap
  logs: string[]
  environmentMutations: EnvironmentMutation[]
}

const safeKey = (key: string) => {
  if (['__proto__', 'prototype', 'constructor'].includes(key)) throw new Error('Reserved field or variable name is not supported')
}

const textValue = (source: string, variables: VariableMap): string => {
  const resolved = resolveText(source, variables)
  if (!resolved.startsWith('"')) return resolved
  try {
    const value = JSON.parse(resolved)
    if (typeof value === 'string') return value
  } catch { /* Report syntax without including the possibly secret input. */ }
  throw new Error('Use a valid quoted string or plain text value')
}

const persistentCommand = (line: string, variables: VariableMap): EnvironmentMutation | undefined => {
  const set = line.match(/^environment-set\s+([A-Za-z_][\w.-]*)\s*=\s*(.*)$/i)
  const unset = line.match(/^environment-unset\s+([A-Za-z_][\w.-]*)$/i)
  if (!set && !unset) return undefined
  const key = (set ?? unset)![1]
  safeKey(key)
  if (unset) { delete variables[key]; return { operation: 'unset', key } }
  const value = textValue(set![2], variables)
  variables[key] = value
  return { operation: 'set', key, value }
}

const mutateBody = (request: RequestDraft, path: string, value: string | number | boolean | null, remove: boolean) => {
  if (['GET', 'HEAD'].includes(request.method)) throw new Error('Body field commands require a method that sends a body')
  if (request.bodyType !== 'json') throw new Error('Body field commands currently require JSON body mode')
  const keys = path.split('.')
  keys.forEach((key) => { safeKey(key); if (!key || /^\d+$/.test(key)) throw new Error('Body paths support named object fields, not array indexes') })
  let body: unknown
  try { body = JSON.parse(request.body) } catch { throw new Error('Request body must contain a valid JSON object') }
  if (body === null || typeof body !== 'object' || Array.isArray(body)) throw new Error('Request body must be a JSON object')
  let parent = body as Record<string, unknown>
  for (const key of keys.slice(0, -1)) {
    if (!Object.hasOwn(parent, key)) {
      if (remove) return
      parent[key] = {}
    }
    const child = parent[key]
    if (child === null || typeof child !== 'object' || Array.isArray(child)) throw new Error('Body path crosses a non-object field')
    parent = child as Record<string, unknown>
  }
  if (remove) delete parent[keys.at(-1)!]
  else parent[keys.at(-1)!] = value
  request.body = JSON.stringify(body, null, 2)
}

const lines = (script: string) => script.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#') && !line.startsWith('//'))

const safeLog = (argument: string, secrets: string[]): string => {
  let message: unknown
  try { message = JSON.parse(argument) } catch { throw new Error('log requires a double-quoted message') }
  if (typeof message !== 'string') throw new Error('log requires a double-quoted message')
  // Log templates are intentionally never expanded into potentially secret values.
  let text = message.replace(/\{\{[^{}]*\}\}/g, '[redacted]')
  for (const secret of [...new Set(secrets)].filter(Boolean).sort((a, b) => b.length - a.length)) text = text.split(secret).join('[redacted]')
  return `Log: ${text}`
}

export const requestLogSecrets = (request: RequestDraft): string[] => {
  const auth = request.auth
  const credentials = auth?.type === 'bearer' ? [auth.token]
    : auth?.type === 'basic' ? [auth.username, auth.password]
      : auth?.type === 'api-key' ? [auth.value] : []
  return [...credentials, ...request.headers.filter((header) => /authorization|cookie|api[-_]?key|token|secret/i.test(header.key)).map((header) => header.value)]
}

export async function runPreRequestScript(script: string, initialRequest: RequestDraft, initialVariables: VariableMap, signal?: AbortSignal): Promise<ScriptRun> {
  checkCancelled(signal)
  let request = structuredClone(hydrateLegacyQueryParams(initialRequest))
  const variables = { ...initialVariables }
  const logs: string[] = []
  const environmentMutations: EnvironmentMutation[] = []
  const logSecrets = Object.values(initialVariables)

  const commands = lines(script)
  let totalSleep = 0
  // Validate the full sleep budget before waiting, including repeated commands.
  for (const [index, line] of commands.entries()) {
    if (!/^sleep\b/i.test(line)) continue
    const sleep = line.match(/^sleep\s+(\d+)$/i)
    if (!sleep || !Number.isSafeInteger(Number(sleep[1]))) throw new Error(`Pre-request script line ${index + 1}: sleep requires a non-negative whole number of milliseconds (e.g. sleep 3000)`)
    totalSleep += Number(sleep[1])
    if (totalSleep > 30_000) throw new Error('Pre-request script: total sleep cannot exceed 30000 ms (30 seconds)')
  }

  for (const [index, line] of commands.entries()) {
    const variable = line.match(/^variable\s+([A-Za-z_$][\w$.-]*)\s*=\s*(.*)$/i)
    const header = line.match(/^header\s+([^=]+?)\s*=\s*(.*)$/i)
    const sleep = line.match(/^sleep\s+(\d+)$/i)
    const log = line.match(/^log\s+(.+)$/i)
    const persistent = persistentCommand(line, variables)
    const query = line.match(/^query\s+([^\s=]+)\s*=\s*(.*)$/i)
    const queryRemove = line.match(/^query-remove\s+([^\s]+)$/i)
    const body = line.match(/^body\s+([\w.-]+)\s*=\s*(.+)$/i)
    const bodyRemove = line.match(/^body-remove\s+([\w.-]+)$/i)
    if (persistent) {
      environmentMutations.push(persistent)
      if (persistent.operation === 'set') logSecrets.push(persistent.value)
      logs.push(`${persistent.operation === 'set' ? 'Set' : 'Unset'} environment variable ${persistent.key}`)
    } else if (query || queryRemove) {
      const key = (query ?? queryRemove)![1]
      request.params = request.params.filter((pair) => pair.key !== key && (pair.key || pair.value))
      if (query) request.params.push({ ...emptyPair(), key, value: textValue(query[2], variables) })
      request.params.push(emptyPair())
      request.url = urlWithQueryParams(request.url, request.params)
      logs.push(`${query ? 'Set' : 'Removed'} query field ${key}`)
    } else if (body || bodyRemove) {
      const path = (body ?? bodyRemove)![1]
      mutateBody(request, path, body ? expectedValue(body[2], variables) : null, Boolean(bodyRemove))
      logs.push(`${body ? 'Set' : 'Removed'} JSON body field ${path}`)
    } else if (sleep) {
      const milliseconds = Number(sleep[1])
      await abortableDelay(milliseconds, signal)
      logs.push(`Slept ${milliseconds} ms before sending`)
    } else if (log) {
      logs.push(safeLog(log[1], [...logSecrets, ...Object.values(variables), ...requestLogSecrets(request)]))
    } else if (variable) {
      safeKey(variable[1])
      variables[variable[1]] = resolveText(variable[2], variables)
      logSecrets.push(variables[variable[1]])
      logs.push(`Set request variable ${variable[1]}`)
    } else if (header) {
      const key = header[1].trim()
      const value = resolveText(header[2], variables)
      const existing = request.headers.find((item) => item.key.toLowerCase() === key.toLowerCase())
      if (existing) request.headers = request.headers.map((item) => item.id === existing.id ? { ...item, value, enabled: true } : item)
      else request.headers = [...request.headers.filter((item) => item.key || item.value), { ...emptyPair(), key, value }, emptyPair()]
      logs.push(`Set header ${key}`)
    } else throw new Error(`Pre-request script line ${index + 1}: unsupported command`)
  }
  return { request, variables, logs, environmentMutations }
}

const jsonPath = (body: string, path: string): unknown => {
  let value: unknown
  try { value = JSON.parse(body) } catch { throw new Error('Response body is not valid JSON') }
  return path.split('.').filter(Boolean).reduce<unknown>((current, key) => current !== null && typeof current === 'object' && Object.hasOwn(current, key) ? (current as Record<string, unknown>)[key] : undefined, value)
}

const expectedValue = (source: string, variables: VariableMap): string | number | boolean | null => {
  const resolved = resolveText(source.trim(), variables)
  let value: unknown
  try { value = JSON.parse(resolved) } catch {
    if (resolved.startsWith('"') || /\s/.test(resolved) || !resolved) throw new Error('Use a JSON literal or a quoted string for the expected value')
    value = resolved
  }
  if (value !== null && !['string', 'number', 'boolean'].includes(typeof value)) throw new Error('Comparisons support strings, numbers, booleans, and null; schema/object comparisons are not supported')
  if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('Expected numbers must be finite')
  return value as string | number | boolean | null
}

const compare = (actual: unknown, operator: string, expected: string | number | boolean | null): boolean => {
  if (actual === undefined) throw new Error('The required response field or header is missing')
  if (operator === 'contains') {
    if (typeof actual === 'string' && typeof expected === 'string') return actual.includes(expected)
    if (Array.isArray(actual)) return actual.some((item) => item === expected)
    throw new Error('contains requires text or an array of scalar values')
  }
  if (operator === '==' || operator === '!=') {
    if (actual !== null && !['string', 'number', 'boolean'].includes(typeof actual)) throw new Error('Equality requires a scalar response value')
    return operator === '==' ? actual === expected : actual !== expected
  }
  if (typeof actual !== 'number' || typeof expected !== 'number') throw new Error('Ordering comparisons require numeric values')
  if (operator === '<') return actual < expected
  if (operator === '<=') return actual <= expected
  if (operator === '>') return actual > expected
  return actual >= expected
}

export function runPostResponseScript(script: string, response: ResponseSnapshot, variables: VariableMap = {}, secrets: string[] = []): { captures: VariableMap; logs: string[]; checks: NonNullable<ResponseSnapshot['scriptChecks']>; errors: string[]; environmentMutations: EnvironmentMutation[] } {
  const captures: VariableMap = Object.create(null)
  const logs: string[] = []
  const checks: NonNullable<ResponseSnapshot['scriptChecks']> = []
  const errors: string[] = []
  const scope = { ...variables }
  const environmentMutations: EnvironmentMutation[] = []
  const logSecrets = [...secrets, ...Object.values(variables)]
  script.split(/\r?\n/).forEach((rawLine, index) => {
    const line = rawLine.trim()
    if (!line || line.startsWith('#') || line.startsWith('//')) return
    const assertion = /^assert\b/i.test(line)
    let name = 'Assertion syntax'
    try {
      const exists = line.match(/^assert\s+(json\.[\w.-]+|header\s+[^\s]+)\s+exists$/i)
      const comparison = line.match(/^assert\s+(status|durationMs|body|json\.[\w.-]+|header\s+[^\s]+)\s*(==|!=|<=|>=|<|>|\bcontains\b)\s*(.+)$/i)
      const capture = line.match(/^capture\s+([A-Za-z_$][\w$.-]*)\s*=\s*json\.([\w.-]+)$/i)
      const log = line.match(/^log\s+(.+)$/i)
      const persistent = persistentCommand(line, scope)
      const actualValue = (target: string): unknown => {
        if (/^status$/i.test(target)) return response.status
        if (/^durationMs$/i.test(target)) return response.durationMs
        if (/^header\s/i.test(target)) return response.headers.find((header) => header.key.toLowerCase() === target.slice(7).toLowerCase())?.value
        if (response.bodyEncoding === 'base64') throw new Error('Text/JSON assertions are not supported for binary responses')
        return /^body$/i.test(target) ? response.body : jsonPath(response.body, target.slice(5))
      }
      if (persistent) {
        environmentMutations.push(persistent)
        delete captures[persistent.key]
        if (persistent.operation === 'set') logSecrets.push(persistent.value)
        logs.push(`${persistent.operation === 'set' ? 'Set' : 'Unset'} environment variable ${persistent.key}`)
      } else if (exists) {
        name = `${exists[1]} exists`
        if (actualValue(exists[1]) === undefined) throw new Error('The required response field or header is missing')
      } else if (comparison) {
        name = `${comparison[1]} ${comparison[2]} expected value`
        const expected = expectedValue(comparison[3], scope)
        if (!compare(actualValue(comparison[1]), comparison[2].toLowerCase(), expected)) throw new Error('Comparison failed (values omitted for privacy)')
      } else if (capture) {
        safeKey(capture[1])
        if (response.bodyEncoding === 'base64') throw new Error('Cannot capture JSON from a binary response')
        const value = jsonPath(response.body, capture[2])
        if (value === undefined) throw new Error('Capture failed: the required JSON field is missing')
        captures[capture[1]] = typeof value === 'string' ? value : JSON.stringify(value)
        scope[capture[1]] = captures[capture[1]]
        environmentMutations.push({ operation: 'set', key: capture[1], value: captures[capture[1]] })
        logSecrets.push(captures[capture[1]])
        logs.push(`Captured ${capture[1]} from json.${capture[2]}`)
      } else if (log) {
        logs.push(safeLog(log[1], logSecrets))
      } else throw new Error('Unsupported command or invalid syntax')
      if (assertion) checks.push({ line: index + 1, name, passed: true })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Script command failed'
      errors.push(`Line ${index + 1}: ${message}`)
      if (assertion) checks.push({ line: index + 1, name, passed: false, message })
    }
  })
  return { captures, logs, checks, errors, environmentMutations }
}
