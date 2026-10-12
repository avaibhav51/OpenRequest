import { useEffect } from 'react'

/** One shared focus/Escape policy for all app dialogs, including nested flows. */
export function useModalAccessibility() {
  useEffect(() => {
    let current: HTMLElement | undefined
    let opener: HTMLElement | undefined
    let lastOutside = document.activeElement as HTMLElement
    let inert: Array<{ element: HTMLElement; previous: boolean }> = []
    const restore = () => { for (const item of inert) item.element.inert = item.previous; inert = [] }
    const focusable = (dialog: HTMLElement) => [...dialog.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]')].filter((el) => el.getClientRects().length && !el.closest('[inert]'))
    const refresh = () => {
      const dialogs = document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]')
      const next = [...dialogs].at(-1)
      if (next === current) return
      restore()
      if (!current && next) opener = lastOutside
      current = next
      if (next) {
        let branch: HTMLElement = next
        while (branch.parentElement && branch.parentElement !== document.body) {
          for (const sibling of branch.parentElement.children) if (sibling !== branch && sibling instanceof HTMLElement && !['SCRIPT', 'STYLE'].includes(sibling.tagName)) {
            inert.push({ element: sibling, previous: sibling.inert }); sibling.inert = true
          }
          branch = branch.parentElement
        }
        next.tabIndex = -1
        if (!next.contains(document.activeElement)) (focusable(next)[0] ?? next).focus()
      } else {
        if (opener?.isConnected && opener.getClientRects().length) opener.focus()
        else document.querySelector<HTMLElement>('.topbar button')?.focus()
        opener = undefined
      }
    }
    const keydown = (event: KeyboardEvent) => {
      if (!current || event.defaultPrevented) return
      if (event.key === 'Escape') {
        const close = current.querySelector<HTMLButtonElement>('header button')
        if (close && !close.disabled) { event.preventDefault(); close.click() }
      } else if (event.key === 'Tab') {
        const items = focusable(current), first = items[0], last = items.at(-1)
        if (!first) { event.preventDefault(); current.focus() }
        else if (event.shiftKey && (document.activeElement === first || !current.contains(document.activeElement))) { event.preventDefault(); last!.focus() }
        else if (!event.shiftKey && (document.activeElement === last || !current.contains(document.activeElement))) { event.preventDefault(); first.focus() }
      }
    }
    const focusin = (event: FocusEvent) => {
      const target = event.target as HTMLElement
      if (!target.closest('[role="dialog"]')) lastOutside = target
      if (current && !current.contains(target)) (focusable(current)[0] ?? current).focus()
    }
    const observer = new MutationObserver(refresh)
    const pointerdown = (event: PointerEvent) => {
      const target = event.target as HTMLElement
      if (!target.closest('[role="dialog"]')) lastOutside = target.closest<HTMLElement>('button,a,input,select,textarea') ?? target
    }
    observer.observe(document.body, { childList: true, subtree: true })
    document.addEventListener('keydown', keydown)
    document.addEventListener('focusin', focusin)
    document.addEventListener('pointerdown', pointerdown, true)
    refresh()
    return () => { observer.disconnect(); restore(); document.removeEventListener('keydown', keydown); document.removeEventListener('focusin', focusin); document.removeEventListener('pointerdown', pointerdown, true) }
  }, [])
}
