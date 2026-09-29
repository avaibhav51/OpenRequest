import { useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { Info } from 'lucide-react'

export function InfoTip({ label, text }: { label: string; text: string }) {
  const trigger = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const rect = open ? trigger.current?.getBoundingClientRect() : undefined
  const width = Math.min(330, window.innerWidth - 24)
  const center = rect ? Math.max(12 + width / 2, Math.min(window.innerWidth - 12 - width / 2, rect.left + rect.width / 2)) : 0
  const below = Boolean(rect && rect.top < 190)
  const style = rect ? ({
    '--tip-left': `${center}px`,
    '--tip-top': `${below ? rect.bottom + 8 : rect.top - 8}px`,
    '--tip-width': `${width}px`,
    '--tip-shift': below ? '0' : '-100%',
  } as CSSProperties) : undefined

  return <>
    <button ref={trigger} type="button" className="info-tip" aria-label={label} aria-expanded={open}
      onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onClick={() => setOpen((value) => !value)}>
      <Info size={12} />
    </button>
    {open && rect && createPortal(<div className="info-tooltip" role="tooltip" style={style}>{text}</div>, document.body)}
  </>
}
