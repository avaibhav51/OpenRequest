import { useRef, useState } from 'react'
import { Upload, X } from 'lucide-react'
import { MAX_IMPORT_BYTES, parseCollectionBackup, type CollectionBackup, type DuplicatePolicy } from '../lib/collectionImport'
import { useAppStore } from '../store'

export function CollectionImportModal({ close }: { close: () => void }) {
  const [text, setText] = useState('')
  const [preview, setPreview] = useState<CollectionBackup>()
  const [policy, setPolicy] = useState<DuplicatePolicy>('copy')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [complete, setComplete] = useState(false)
  const readId = useRef(0)
  const { collections, requests, importBackup } = useAppStore()
  const duplicates = preview ? preview.collections.filter((c) => collections.some((old) => old.id === c.id)).length + preview.requests.filter((r) => requests.some((old) => old.id === r.id)).length : 0
  const load = async (file?: File) => {
    const reading = ++readId.current
    setPreview(undefined); setText(''); setMessage(''); setComplete(false)
    if (!file) return
    try {
      if (file.size > MAX_IMPORT_BYTES) throw new Error('Backup exceeds the 5 MiB limit.')
      const value = await file.text()
      const parsed = parseCollectionBackup(value)
      if (reading !== readId.current) return
      setText(value); setPreview(parsed)
    } catch (error) { if (reading === readId.current) setMessage(error instanceof Error ? error.message : 'Could not read this file.') }
  }
  const restore = async () => {
    setBusy(true); setMessage('')
    try {
      const result = await importBackup(text, policy)
      setMessage(`Imported ${result.collections} collections and ${result.requests} requests. Skipped ${result.skipped} matching IDs.`)
      setComplete(true)
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Import failed. Nothing was imported.') }
    finally { setBusy(false) }
  }
  return <div className="modal-backdrop" onMouseDown={(event) => !busy && event.target === event.currentTarget && close()}>
    <section className="modal" role="dialog" aria-modal="true" aria-label="Import OpenRequest backup">
      <header><div><Upload /><div><h2>Import OpenRequest backup</h2><p>Restore saved collections and requests locally.</p></div></div><button className="icon-button" aria-label="Close import" disabled={busy} onClick={close}><X /></button></header>
      <div className="modal-body">
        <label>OpenRequest JSON file<input aria-label="OpenRequest JSON file" type="file" accept=".json,application/json" disabled={busy} onChange={(event) => void load(event.target.files?.[0])} /></label>
        <p>Up to 5 MiB. Files can contain credentials and scripts. Review their source before sending imported requests. Import never executes them.</p>
        <p>First-time sync enablement includes all saved requests, including imports. Backups do not restore variables, drafts, history or sync keys.</p>
        {preview && <><p>{preview.collections.length} collections · {preview.requests.length} requests · {duplicates} matching IDs</p><label>Duplicate handling<select aria-label="Duplicate handling" disabled={busy || complete} value={policy} onChange={(event) => setPolicy(event.target.value as DuplicatePolicy)}><option value="copy">Keep both — import as new copies</option><option value="skip">Skip existing IDs — restore only missing items</option></select></label><p>Existing saved requests and open drafts are never replaced. Matching IDs, not names or URLs, define duplicates. Imports stay local; use Save on a request to make it sync-eligible.</p>{(preview.collections.some((c) => c.folders?.length) || preview.requests.some((r) => r.folderPath?.length)) && <p>Folder paths and empty folders are included. Skip existing IDs keeps existing collection metadata unchanged; Keep both restores the complete imported hierarchy separately.</p>}</>}
        {message && <p role={complete ? 'status' : 'alert'} className={complete ? '' : 'error-note'}>{message}</p>}
        <div className="modal-actions"><button disabled={busy} onClick={close}>{complete ? 'Done' : 'Cancel'}</button><button className="primary" disabled={!preview || busy || complete} onClick={() => void restore()}>{busy ? 'Importing…' : 'Import locally'}</button></div>
      </div>
    </section>
  </div>
}
