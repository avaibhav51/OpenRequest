import { describe, expect, it } from 'vitest'
import { tokenizeJson, tokenizeXml } from './responseSyntax'

describe('response syntax highlighting', () => {
  it('classifies JSON values without changing their text', () => {
    const source = '{"name":"Ada","age":36,"active":true,"extra":null}'
    const tokens = tokenizeJson(source)
    expect(tokens.map((token) => token.text).join('')).toBe(source)
    expect(tokens.filter((token) => token.kind === 'key').map((token) => token.text)).toEqual(['"name"', '"age"', '"active"', '"extra"'])
    expect(tokens.some((token) => token.kind === 'string' && token.text === '"Ada"')).toBe(true)
    expect(tokens.some((token) => token.kind === 'number' && token.text === '36')).toBe(true)
    expect(tokens.some((token) => token.kind === 'boolean' && token.text === 'true')).toBe(true)
    expect(tokens.some((token) => token.kind === 'null' && token.text === 'null')).toBe(true)
  })

  it('classifies XML names and attributes without changing their text', () => {
    const source = '<user id="7"><name>Ada</name></user>'
    const tokens = tokenizeXml(source)
    expect(tokens.map((token) => token.text).join('')).toBe(source)
    expect(tokens.filter((token) => token.kind === 'tag').map((token) => token.text)).toEqual(['user', 'name', 'name', 'user'])
    expect(tokens.some((token) => token.kind === 'attribute' && token.text === 'id')).toBe(true)
    expect(tokens.some((token) => token.kind === 'string' && token.text === '"7"')).toBe(true)
  })
})
