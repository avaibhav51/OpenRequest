import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'

const storageKey = 'openrequest-script-split'
export function scriptSplitRatio(value: unknown): number {
  const number = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN
  return Number.isFinite(number) ? Math.max(20, Math.min(80, number)) : 50
}

export function ScriptSplit({ children }: { children: [ReactNode, ReactNode] }) {
  const container = useRef<HTMLDivElement>(null)
  const [ratio, setRatio] = useState(() => {
    try { return scriptSplitRatio(localStorage.getItem(storageKey)) } catch { return 50 }
  })
  useEffect(() => { try { localStorage.setItem(storageKey, String(ratio)) } catch { /* Resizing still works when browser storage is unavailable. */ } }, [ratio])
  const adjust = (next: number) => {
    const height = (container.current?.clientHeight ?? 292) - 12
    const minimum = Math.min(50, 140 / height * 100)
    setRatio(Math.max(minimum, Math.min(100 - minimum, scriptSplitRatio(next))))
  }
  return <div ref={container} className="script-split" style={{ '--script-before': `${ratio}fr`, '--script-after': `${100 - ratio}fr` } as CSSProperties}>
    {children[0]}
    <button type="button" className="script-resizer" role="separator" aria-label="Resize before and after scripts" aria-orientation="horizontal"
      aria-valuemin={20} aria-valuemax={80} aria-valuenow={Math.round(ratio)} aria-valuetext={`Before request ${Math.round(ratio)}%, after response ${Math.round(100 - ratio)}%`}
      title="Drag to resize scripts; arrow keys adjust; double-click or Home resets"
      onDoubleClick={() => setRatio(50)}
      onKeyDown={(event) => {
        if (event.key === 'Home') { event.preventDefault(); setRatio(50) }
        else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') { event.preventDefault(); adjust(ratio + (event.key === 'ArrowDown' ? 5 : -5)) }
      }}
      onPointerDown={(event) => { if (event.button === 0) event.currentTarget.setPointerCapture(event.pointerId) }}
      onPointerMove={(event) => {
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
        const bounds = container.current?.getBoundingClientRect()
        if (bounds) adjust((event.clientY - bounds.top - 6) / (bounds.height - 12) * 100)
      }}
      onPointerUp={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId) }}
    ><span /></button>
    {children[1]}
  </div>
}
