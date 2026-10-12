import { useState } from 'react'
import { FolderPlus, X } from 'lucide-react'
import { useAppStore } from '../store'

export function CreateFolderModal({ collectionId, parent = [], close, created, collectionCreated }: { collectionId?: string; parent?: string[]; close: () => void; created?: (path: string[]) => void; collectionCreated?: (id: string) => void }) {
  const store = useAppStore()
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const label = collectionId ? parent.length ? 'Create subfolder' : 'Create folder' : 'Create collection'
  const collection = store.collections.find((c) => c.id === collectionId)
  const submit = async () => {
    setBusy(true); setError('')
    try {
      if (collectionId) { const path = await store.addFolder(collectionId, parent, name); created?.(path) }
      else { const collection = await store.addCollection(name); collectionCreated?.(collection.id) }
      close()
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not create this folder.') }
    finally { setBusy(false) }
  }
  return <div className="modal-backdrop" onMouseDown={(event) => !busy && event.target === event.currentTarget && close()}>
    <section className="modal" role="dialog" aria-modal="true" aria-label={label}>
      <header><div><FolderPlus /><div><h2>{label}</h2><p>{collectionId ? `${collection?.name ?? 'Collection'}${parent.length ? ` / ${parent.join(' / ')}` : ''}` : 'A top-level group for requests and folders.'}</p></div></div><button className="icon-button" aria-label="Close creation dialog" disabled={busy} onClick={close}><X /></button></header>
      <form className="modal-body" onSubmit={(event) => { event.preventDefault(); if (!busy && name.trim()) void submit() }}>
        <label>{collectionId ? 'Folder name' : 'Collection name'}<input autoFocus aria-label={collectionId ? 'Folder name' : 'Collection name'} value={name} maxLength={100} disabled={busy} onChange={(event) => setName(event.target.value)} /></label>
        {collectionId && <p className="folder-creation-note">Folders can contain requests and subfolders, up to 12 levels. Use a single name without slashes.</p>}
        {error && <p role="alert" className="error-note">{error}</p>}
        <div className="modal-actions"><button type="button" disabled={busy} onClick={close}>Cancel</button><button className="primary" type="submit" disabled={busy || !name.trim()}>{label}</button></div>
      </form>
    </section>
  </div>
}
