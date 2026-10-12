import { useState } from 'react'
import { X } from 'lucide-react'
import { useAppStore } from '../store'
import { collectionFolders, folderKey, inFolder } from '../lib/folders'

export function FolderManagementModal({ collectionId, path, close }: { collectionId: string; path: string[]; close: () => void }) {
  const store = useAppStore(), collection = store.collections.find((c) => c.id === collectionId)
  const [name, setName] = useState(path.at(-1) ?? '')
  const [parent, setParent] = useState(path.slice(0, -1))
  const [deleting, setDeleting] = useState(false)
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const perform = async (remove = false) => {
    setBusy(true); setError('')
    try { await store.manageFolder(collectionId, path, { name, parent, remove }); close() }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Folder action failed.') }
    finally { setBusy(false) }
  }
  return <div className="modal-backdrop" onMouseDown={(event) => !busy && event.target === event.currentTarget && close()}>
    <section className="modal" role="dialog" aria-modal="true" aria-label="Manage folder">
      <header><h2>{deleting ? 'Delete folder and subfolders?' : 'Manage folder'}</h2><button className="icon-button" aria-label="Close folder management" disabled={busy} onClick={close}><X /></button></header>
      <div className="modal-body">
        {deleting ? <p>All saved requests in this folder and its subfolders will be kept at the collection root. Only the folder hierarchy is removed. Open content edits stay untouched; saved placement changes synchronize when enabled.</p> : <>
          <label>Folder name<input autoFocus value={name} maxLength={100} disabled={busy} onChange={(event) => setName(event.target.value)} /></label>
          <label>Parent folder<select value={folderKey(parent)} disabled={busy} onChange={(event) => setParent(JSON.parse(event.target.value))}><option value="[]">Collection root</option>{collection && collectionFolders(collection, store.requests).filter((f) => !inFolder(f, path)).map((f) => <option key={folderKey(f)} value={folderKey(f)}>{f.join(' / ')}</option>)}</select></label>
          <p>Rename or move this entire folder subtree within its collection. Requests and unfinished content edits are preserved.</p>
        </>}
        {error && <p role="alert" className="error-note">{error}</p>}
        <div className="modal-actions"><button disabled={busy} onClick={() => deleting ? setDeleting(false) : close()}>Cancel</button>{!deleting && <button disabled={busy} onClick={() => setDeleting(true)}>Delete folder</button>}<button className="primary" disabled={busy || !name.trim()} onClick={() => void perform(deleting)}>{deleting ? 'Confirm folder deletion' : 'Save folder changes'}</button></div>
      </div>
    </section>
  </div>
}
