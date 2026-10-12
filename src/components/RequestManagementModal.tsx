import { useState } from 'react'
import { Copy, Trash2, X } from 'lucide-react'
import { useAppStore } from '../store'
import { CreateFolderModal } from './CreateFolderModal'
import { collectionFolders, folderKey, sameFolder } from '../lib/folders'
import { authConfigured } from '../lib/auth'
import { requestSyncHistory } from '../lib/syncService'
import { duplicateSavedRequest } from '../lib/requestManagement'
import { InfoTip } from './InfoTip'

export function RequestManagementModal({ id, close }: { id: string; close: () => void }) {
  const store = useAppStore()
  const saved = store.requests.find((r) => r.id === id)
  const [name, setName] = useState(saved?.name ?? '')
  const [collectionId, setCollectionId] = useState(saved?.collectionId ?? '')
  const [folderPath, setFolderPath] = useState(saved?.folderPath ?? [])
  const [creating, setCreating] = useState<'collection' | 'folder'>()
  const [deleting, setDeleting] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [versions, setVersions] = useState<Awaited<ReturnType<typeof requestSyncHistory>>>()
  const loadVersions = async () => {
    setBusy(true); setError('')
    try { setVersions(await requestSyncHistory(id)) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not read encrypted history.') }
    finally { setBusy(false) }
  }
  const openVersion = (request: Parameters<typeof duplicateSavedRequest>[0]) => {
    const copy = duplicateSavedRequest(request, store.requests)
    const destination = store.collections.find((c) => c.id === copy.collectionId)
    const validPath = destination && collectionFolders(destination, store.requests).some((f) => sameFolder(f, copy.folderPath))
    store.selectRequest({ ...copy, collectionId: destination?.id, folderPath: validPath ? copy.folderPath : [] })
    close()
  }
  const perform = async (action: () => Promise<void>) => {
    setBusy(true); setError('')
    try { await action(); close() } catch (reason) { setError(reason instanceof Error ? reason.message : 'Request action failed.') }
    finally { setBusy(false) }
  }
  const collection = store.collections.find((c) => c.id === collectionId)
  if (creating === 'collection' || (creating === 'folder' && collection)) return <CreateFolderModal collectionId={creating === 'folder' ? collectionId : undefined} parent={creating === 'folder' ? folderPath : []} close={() => setCreating(undefined)} created={setFolderPath} collectionCreated={(id) => { setCollectionId(id); setFolderPath([]) }} />
  return <div className="modal-backdrop" onMouseDown={(event) => !busy && event.target === event.currentTarget && close()}>
    <section className="modal" role="dialog" aria-modal="true" aria-label={deleting ? 'Delete saved request' : 'Manage saved request'}>
      <header><div><div><h2>{deleting ? 'Delete saved request?' : 'Manage saved request'}</h2><p>{saved?.name ?? 'Request no longer exists'}</p></div></div><button className="icon-button" aria-label="Close request management" disabled={busy} onClick={close}><X /></button></header>
      <div className="modal-body">
        {!saved ? <p role="alert">This saved request no longer exists. Any open local draft is preserved.</p> : deleting ? <>
          <p>This removes the saved request and propagates its deletion when sync is configured. Any open copy stays as a new local draft; history remains. Saving that draft later creates a separate request. Keep a backup if you need the saved copy.</p>
          <div className="modal-actions"><button disabled={busy} autoFocus onClick={() => setDeleting(false)}>Cancel</button><button className="primary" disabled={busy} onClick={() => void perform(() => store.removeRequest(id))}>Confirm delete</button></div>
        </> : <>
          <label>Request name<input aria-label="Saved request name" value={name} disabled={busy} onChange={(event) => setName(event.target.value)} /></label>
          <label>Move to collection<select aria-label="Move to collection" value={collectionId} disabled={busy} onChange={(event) => { if (event.target.value === '__create_collection__') { setCreating('collection'); return } setCollectionId(event.target.value); setFolderPath([]) }}><option value="">Unfiled</option>{store.collections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}<option value="__create_collection__">＋ New collection…</option></select></label>
          {collection && <label>Move to folder<select aria-label="Move to folder" value={folderKey(folderPath)} disabled={busy} onChange={(event) => { if (event.target.value === '__create_folder__') { setCreating('folder'); return } setFolderPath(JSON.parse(event.target.value) as string[]) }}><option value="[]">Collection root</option>{collectionFolders(collection, store.requests).map((path) => <option key={folderKey(path)} value={folderKey(path)}>{path.join(' / ')}</option>)}<option value="__create_folder__">{folderPath.length ? '＋ New subfolder in selected folder…' : '＋ New folder…'}</option></select></label>}
          <p className="request-management-note"><span>Saved copy only. Unsaved edits stay local.</span><InfoTip label="About saved request actions" text="These actions use the saved request. Unsaved tab edits stay local. Rename and move preserve edited request content; duplicate opens a saved copy in a new tab." /></p>
          {authConfigured && <><button disabled={busy} onClick={() => void loadVersions()}>View encrypted versions</button>{versions && <div className="version-list">{!versions.length && <p>No uploaded versions are available.</p>}{versions.map((v) => <button key={v.id} disabled={busy} onClick={() => openVersion(v.request)}>Open version from {new Date(v.createdAt).toLocaleString()} as local copy</button>)}</div>}</>}
          <div className="modal-actions"><button disabled={busy} onClick={() => void perform(async () => { const copy = await store.duplicateRequest(id); store.selectRequest(copy) })}><Copy size={14} /> Duplicate saved request</button><button disabled={busy} onClick={() => setDeleting(true)}><Trash2 size={14} /> Delete saved request</button></div>
          <div className="modal-actions"><button disabled={busy} onClick={close}>Cancel</button><button className="primary" disabled={busy || !name.trim()} onClick={() => void perform(() => store.manageRequest(id, { name, collectionId: collectionId || undefined, folderPath: collectionId ? folderPath : [] }))}>Save changes</button></div>
        </>}
        {error && <p className="error-note" role="alert">{error}</p>}
      </div>
    </section>
  </div>
}
