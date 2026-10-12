export type ScriptPhase = 'before' | 'after'
export interface ScriptSuggestion { label: string; text: string; detail: string }

const common: ScriptSuggestion[] = [
  { label: 'log', text: 'log "Checking request"', detail: 'Debug message; known secrets are masked' },
  { label: 'environment-set', text: 'environment-set token = example', detail: 'Changes local environment · marked secret' },
  { label: 'environment-unset', text: 'environment-unset staleToken', detail: 'Removes a local environment variable' },
]
export const scriptCommands = (phase: ScriptPhase): ScriptSuggestion[] => phase === 'before' ? [
  { label: 'variable', text: 'variable traceId = {{$randomUUID}}', detail: 'Temporary variable for this run' },
  { label: 'header', text: 'header X-Trace-Id = {{traceId}}', detail: 'Outgoing header only' },
  { label: 'sleep', text: 'sleep 3000', detail: 'Delay in milliseconds · total maximum 30000' },
  { label: 'query', text: 'query page = 1', detail: 'Outgoing query parameter only' },
  { label: 'query-remove', text: 'query-remove obsolete', detail: 'Removes matching outgoing query parameters' },
  { label: 'body', text: 'body data.name = "example"', detail: 'Outgoing JSON object field · JSON body required' },
  { label: 'body-remove', text: 'body-remove data.obsolete', detail: 'Removes an outgoing JSON object field' },
  ...common,
] : [
  { label: 'assert status', text: 'assert status == 200', detail: 'Check HTTP status' },
  { label: 'assert durationMs', text: 'assert durationMs < 2000', detail: 'Check network duration in milliseconds' },
  { label: 'assert json', text: 'assert json.success == true', detail: 'Check a response JSON field · adapt the path' },
  { label: 'assert header', text: 'assert header Content-Type contains "application/json"', detail: 'Check a browser-visible response header' },
  { label: 'assert body', text: 'assert body contains "created"', detail: 'Check response text' },
  { label: 'capture', text: 'capture token = json.data.token', detail: 'Changes local environment · adapt the response path' },
  ...common,
]

export function scriptSuggestions(value: string, caret: number, phase: ScriptPhase, names: string[], showAll = false) {
  const start = value.lastIndexOf('\n', caret - 1) + 1
  const prefix = value.slice(start, caret)
  const variable = /\{\{([\w$.-]*)$/.exec(prefix)
  if (variable) return {
    start: caret - variable[0].length,
    end: value.slice(caret, caret + 2) === '}}' ? caret + 2 : caret,
    items: [...new Set([...names, '$randomUUID', '$timestamp', '$isoTimestamp'])].filter((name) => name.startsWith(variable[1])).map((name) => ({ label: name, text: `{{${name}}}`, detail: 'Variable name only · value not displayed' })),
  }
  const trimmed = prefix.trimStart()
  return {
    start: start + prefix.length - trimmed.length,
    end: value.indexOf('\n', caret) < 0 ? value.length : value.indexOf('\n', caret),
    items: !showAll && !trimmed ? [] : scriptCommands(phase).filter((item) => showAll || item.label.startsWith(trimmed)),
  }
}
