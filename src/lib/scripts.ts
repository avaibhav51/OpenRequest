import { emptyPair, type RequestDraft, type ResponseSnapshot } from '../types'
import { resolveText, type VariableMap } from './variables'

export interface ScriptRun {
  request: RequestDraft
  variables: VariableMap
  logs: string[]
}

const lines = (script: string) => script.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#') && !line.startsWith('//'))

export function runPreRequestScript(script: string, initialRequest: RequestDraft, initialVariables: VariableMap): ScriptRun {
  let request = structuredClone(initialRequest)
  const variables = { ...initialVariables }
  const logs: string[] = []

  lines(script).forEach((line, index) => {
    const variable = line.match(/^variable\s+([A-Za-z_$][\w$.-]*)\s*=\s*(.*)$/i)
    const header = line.match(/^header\s+([^=]+?)\s*=\s*(.*)$/i)
    if (variable) {
      variables[variable[1]] = resolveText(variable[2], variables)
      logs.push(`Set request variable ${variable[1]}`)
    } else if (header) {
      const key = header[1].trim()
      const value = resolveText(header[2], variables)
      const existing = request.headers.find((item) => item.key.toLowerCase() === key.toLowerCase())
      if (existing) request.headers = request.headers.map((item) => item.id === existing.id ? { ...item, value, enabled: true } : item)
      else request.headers = [...request.headers.filter((item) => item.key || item.value), { ...emptyPair(), key, value }, emptyPair()]
      logs.push(`Set header ${key}`)
    } else throw new Error(`Pre-request script line ${index + 1}: unsupported command`)
  })
  return { request, variables, logs }
}

const jsonPath = (body: string, path: string): unknown => {
  let value: unknown
  try { value = JSON.parse(body) } catch { throw new Error('Response body is not valid JSON') }
  return path.split('.').filter(Boolean).reduce<unknown>((current, key) => current && typeof current === 'object' ? (current as Record<string, unknown>)[key] : undefined, value)
}

export function runPostResponseScript(script: string, response: ResponseSnapshot): { captures: VariableMap; logs: string[] } {
  const captures: VariableMap = {}
  const logs: string[] = []
  lines(script).forEach((line, index) => {
    const status = line.match(/^assert\s+status\s*==\s*(\d{3})$/i)
    const exists = line.match(/^assert\s+json\.([\w.-]+)\s+exists$/i)
    const capture = line.match(/^capture\s+([A-Za-z_$][\w$.-]*)\s*=\s*json\.([\w.-]+)$/i)
    if (status) {
      if (response.status !== Number(status[1])) throw new Error(`Assertion failed: expected status ${status[1]}, received ${response.status}`)
      logs.push(`Status is ${status[1]}`)
    } else if (exists) {
      if (jsonPath(response.body, exists[1]) === undefined) throw new Error(`Assertion failed: json.${exists[1]} does not exist`)
      logs.push(`json.${exists[1]} exists`)
    } else if (capture) {
      const value = jsonPath(response.body, capture[2])
      if (value === undefined) throw new Error(`Capture failed: json.${capture[2]} does not exist`)
      captures[capture[1]] = typeof value === 'string' ? value : JSON.stringify(value)
      logs.push(`Captured ${capture[1]} from json.${capture[2]}`)
    } else throw new Error(`Post-response script line ${index + 1}: unsupported command`)
  })
  return { captures, logs }
}
