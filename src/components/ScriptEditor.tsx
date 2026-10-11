import { useId, useLayoutEffect, useRef, useState } from 'react'
import { scriptSuggestions, type ScriptPhase } from '../lib/scriptSuggestions'

export function ScriptEditor({ phase, value, onChange, variableNames, placeholder }: {
  phase: ScriptPhase; value: string; onChange: (value: string) => void; variableNames: string[]; placeholder: string
}) {
  const id = useId()
  const editor = useRef<HTMLTextAreaElement>(null)
  const pendingCaret = useRef<number | null>(null)
  useLayoutEffect(() => {
    if (pendingCaret.current === null) return
    editor.current?.focus()
    editor.current?.setSelectionRange(pendingCaret.current, pendingCaret.current)
    pendingCaret.current = null
  })
  const [caret, setCaret] = useState(0)
  const [visible, setVisible] = useState(false)
  const [all, setAll] = useState(false)
  const [selected, setSelected] = useState(0)
  const suggestions = scriptSuggestions(value, caret, phase, variableNames, all)
  const open = visible && suggestions.items.length > 0
  const insert = (index: number) => {
    const item = suggestions.items[index]
    if (!item) return
    // Explicit menu insertion appends on a fresh line when the current line has content.
    const prefix = value.slice(value.lastIndexOf('\n', caret - 1) + 1, caret).trim()
    const lineStart = value.lastIndexOf('\n', caret - 1) + 1
    const append = all && value.slice(lineStart, suggestions.end).trim() && !/\{\{[\w$.-]*$/.test(value.slice(0, caret)) && (!prefix || !item.label.startsWith(prefix))
    const start = append ? suggestions.end : suggestions.start
    const end = suggestions.end
    const text = `${append ? '\n' : ''}${item.text}`
    pendingCaret.current = start + text.length
    onChange(value.slice(0, start) + text + value.slice(end))
    setVisible(false); setAll(false)
  }
  return <div className="script-field">
    <div className="script-field-heading"><label htmlFor={id}>{phase === 'before' ? 'Before request' : 'After response'}</label><button type="button" aria-expanded={open} aria-controls={`${id}-suggestions`} onClick={() => { setCaret(editor.current?.selectionStart ?? value.length); setAll(true); setSelected(0); setVisible(!open) }}>Insert command</button></div>
    <textarea id={id} ref={editor} spellCheck={false} value={value} placeholder={placeholder} aria-describedby={open ? `${id}-suggestions` : undefined}
      onChange={(event) => { onChange(event.target.value); setCaret(event.target.selectionStart); setAll(false); setVisible(true); setSelected(0) }}
      onClick={(event) => { setCaret(event.currentTarget.selectionStart); setAll(false); setVisible(false) }}
      onKeyDown={(event) => {
        if (event.nativeEvent.isComposing) return
        if (event.ctrlKey && event.code === 'Space') { event.preventDefault(); setCaret(event.currentTarget.selectionStart); setAll(true); setVisible(true); setSelected(0) }
        else if (open && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) { event.preventDefault(); setSelected((index) => (index + (event.key === 'ArrowDown' ? 1 : -1) + suggestions.items.length) % suggestions.items.length) }
        else if (open && event.key === 'Enter') { event.preventDefault(); insert(selected) }
        else if (event.key === 'Escape') { setVisible(false); setAll(false) }
        else if (event.key === 'Tab') setVisible(false)
      }} />
    {open && <div id={`${id}-suggestions`} className="script-suggestions" aria-label={`${phase === 'before' ? 'Before request' : 'After response'} suggestions`}>
      <small>Choose to insert · ↑↓ / Enter · Esc to dismiss · edit examples before running</small>
      {suggestions.items.map((item, index) => <button type="button" className={selected === index ? 'selected' : ''} key={item.label} onClick={() => insert(index)}><code>{item.label}</code><span>{item.detail}</span></button>)}
    </div>}
  </div>
}
