import { describe, expect, it } from 'vitest'
import { scriptCommands, scriptSuggestions } from './scriptSuggestions'

describe('script suggestions', () => {
  it('offers commands only for their supported phase', () => {
    expect(scriptCommands('before').some((item) => item.label === 'sleep')).toBe(true)
    expect(scriptCommands('after').some((item) => item.label === 'sleep')).toBe(false)
    expect(scriptCommands('before').some((item) => item.label === 'capture')).toBe(false)
    expect(scriptCommands('after').some((item) => item.label === 'capture')).toBe(true)
  })
  it('completes the current line without replacing other lines', () => {
    const result = scriptSuggestions('log "hello"\n  sle\nquery page = 1', 17, 'before', [])
    expect(result.items[0].text).toBe('sleep 3000')
    expect(result.start).toBe(14)
    expect(result.end).toBe(17)
    expect(scriptSuggestions('', 0, 'before', []).items).toEqual([])
    expect(scriptSuggestions('', 0, 'before', [], true).items.length).toBeGreaterThan(0)
  })
  it('completes names without values and consumes existing closing braces', () => {
    const value = 'header X-Token = {{tok}}'
    const result = scriptSuggestions(value, value.length - 2, 'before', ['token', 'token', 'other'])
    expect(result.items.map((item) => item.text)).toEqual(['{{token}}'])
    expect(value.slice(0, result.start) + result.items[0].text + value.slice(result.end)).toBe('header X-Token = {{token}}')
  })
})
