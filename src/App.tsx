import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ClipboardEvent, type CSSProperties, type DragEvent, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import {
  Archive, Braces, ChevronDown, ChevronRight, CircleHelp, ClipboardPaste, Clock3, Code2, Copy, Download,
  Folder, History, KeyRound, LogIn, Menu, Moon, MoreHorizontal, Plus, RotateCcw, Save, Send, Settings, Sun, Tags, Trash2, UserRound, X
} from 'lucide-react'
import { AuthModal } from './components/AuthModal'
import { HelpModal } from './components/HelpModal'
import { CollectionImportModal } from './components/CollectionImportModal'
import { BackupExportConfirmation } from './components/BackupExportConfirmation'
import { RequestManagementModal } from './components/RequestManagementModal'
import { matchesRequest } from './lib/requestManagement'
import { workspaceBackup } from './lib/collectionImport'
import { CreateFolderModal } from './components/CreateFolderModal'
import { collectionFolders, folderBackup, folderKey, inFolder, sameFolder } from './lib/folders'
import { InfoTip } from './components/InfoTip'
import { ScriptEditor } from './components/ScriptEditor'
import { ScriptSplit } from './components/ScriptSplit'
import { VariablesModal } from './components/VariablesModal'
import { bodyTypeFromContentType, headersForBodyType } from './lib/body'
import { parseCurl, toCurl } from './lib/curl'
import { authClient, type AuthUser } from './lib/auth'
import { httpStatusTooltip } from './lib/httpStatus'
import { isDraftDirty } from './lib/draftState'
import { queryParamsFromUrl, urlWithQueryParams } from './lib/queryParams'
import { executeRequest, friendlyRequestError } from './lib/request'
import { checkCancelled } from './lib/requestControl'
import { tokenizeJson, tokenizeXml, type SyntaxToken } from './lib/responseSyntax'
import { requestLogSecrets, runPostResponseScript, runPreRequestScript } from './lib/scripts'
import { getSyncStatus, syncNow } from './lib/syncService'
import { syncRetryDelay } from './lib/syncRetry'
import { FolderManagementModal } from './components/FolderManagementModal'
import { useModalAccessibility } from './lib/modalAccessibility'
import { applyAppUpdate, subscribeUpdates, updateAvailable } from './lib/pwaUpdate'
import { flushDraftPersistence } from './store'
import { referencedVariables, resolveRequest, variableMap } from './lib/variables'
import { emptyPair, type Collection, type KeyValue, type RequestAuth, type ResponseSnapshot } from './types'
import { useAppStore } from './store'

type EditorTab = 'params' | 'headers' | 'auth' | 'body' | 'scripts'
type ResponseTab = 'body' | 'raw' | 'headers'
type Modal = 'curl' | 'save' | 'settings' | 'variables' | 'help' | 'auth' | 'backup' | null

const appMarkUrl = `${import.meta.env.BASE_URL}mark.svg`

const download = (filename: string, value: unknown) => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

const formatXml = (value: string) => {
  try {
    const document = new DOMParser().parseFromString(value, 'application/xml')
    if (document.querySelector('parsererror')) return value
    const serialized = new XMLSerializer().serializeToString(document).replace(/>\s*</g, '>\n<')
    let depth = 0
    return serialized.split('\n').map((line) => {
      if (/^<\//.test(line)) depth = Math.max(0, depth - 1)
      const formatted = `${'  '.repeat(depth)}${line}`
      if (/^<[^!?/][^>]*[^/]?>$/.test(line) && !line.includes('</')) depth += 1
      return formatted
    }).join('\n')
  } catch { return value }
}

function HighlightedResponse({ value, contentType }: { value: string; contentType: string }) {
  const language = /json/i.test(contentType) ? 'json' : /xml|svg/i.test(contentType) ? 'xml' : undefined
  const tokens: SyntaxToken[] = language === 'json' ? tokenizeJson(value) : language === 'xml' ? tokenizeXml(value) : [{ text: value, kind: 'plain' }]
  return <pre className={language ? 'syntax-response' : undefined} data-language={language}>{tokens.map((token, index) => <span className={`syntax-${token.kind}`} key={index}>{token.text}</span>)}</pre>
}

function ScriptResults({ response }: { response: ResponseSnapshot }) {
  const checks = response.scriptChecks ?? []
  const logs = response.scriptLogs ?? []
  if (!checks.length && !logs.length && !response.scriptError) return null
  return <details className="script-report" open={Boolean(response.scriptError)}>
    <summary className={`script-banner ${response.scriptError ? 'bad' : 'ok'}`}><b>{response.scriptError ? 'Script failed' : 'Scripts passed'}</b><span>{checks.length ? `${checks.filter((check) => check.passed).length}/${checks.length} checks passed` : `${logs.length} log entries`} · Details</span></summary>
    <div className="script-report-content" aria-label="Script results">
      {checks.map((check, index) => <div className={`script-check ${check.passed ? 'ok' : 'bad'}`} key={index}><b>{check.passed ? 'PASS' : 'FAIL'}</b><span>Line {check.line}: {check.name}{check.message && ` — ${check.message}`}</span></div>)}
      {response.scriptError && <p>{response.scriptError}</p>}
      {logs.map((message, index) => <div className="script-log" key={index}>{message}</div>)}
    </div>
  </details>
}

function UrlDetails({ value }: { value: string }) {
  const match = value.trim().match(/^([a-z][a-z\d+.-]*:\/\/)([^/?#\s]+)([^?#\s]*)(\?[^#\s]*)?(#\S*)?$/i)
  if (!match) return null
  const [, protocol, authority, pathname, query = '', fragment = ''] = match
  const pathSegments = pathname.split('/')
  const lastPathIndex = pathSegments.reduce((last, segment, index) => segment ? index : last, -1)
  const isPathParameter = (segment: string) => /^(?:\{\{[^}]+\}\}|\{[^}]+\}|:[A-Za-z_][\w-]*)$/.test(segment)
  const queryParts = query.slice(1).split('&').filter(Boolean)

  return <>
    <button className="url-details-trigger" type="button" aria-label="Show URL details" title="Show URL details"><Code2 size={13} /></button>
    <div className="url-details" role="tooltip">
      <Code2 size={12} />
      <code>
      <span className="url-protocol" title="Protocol">{protocol}</span>
      <span className="url-authority" title="Domain / host and port">{authority}</span>
      {pathSegments.map((segment, index) => <span key={`path-${index}`}>
        {index > 0 && <span className="url-punctuation">/</span>}
        {segment && <span
          className={isPathParameter(segment) ? 'url-path-param' : index === lastPathIndex ? 'url-endpoint' : 'url-path'}
          title={isPathParameter(segment) ? 'Path parameter' : index === lastPathIndex ? 'Endpoint' : 'Path'}
        >{segment}</span>}
      </span>)}
      {queryParts.length > 0 && <span className="url-punctuation">?</span>}
      {queryParts.map((part, index) => {
        const equals = part.indexOf('=')
        const key = equals < 0 ? part : part.slice(0, equals)
        const queryValue = equals < 0 ? '' : part.slice(equals + 1)
        return <span key={`query-${index}`}>
          {index > 0 && <span className="url-punctuation">&amp;</span>}
          <span className="url-query-key" title="Query parameter key">{key}</span>
          {equals >= 0 && <><span className="url-punctuation">=</span><span className="url-query-value" title="Query parameter value">{queryValue}</span></>}
        </span>
      })}
      {fragment && <span className="url-fragment" title="Fragment">{fragment}</span>}
      </code>
    </div>
  </>
}

function PairEditor({ value, onChange, generated = [], disabled = false }: { value: KeyValue[]; onChange: (value: KeyValue[]) => void; generated?: KeyValue[]; disabled?: boolean }) {
  const update = (id: string, patch: Partial<KeyValue>) => {
    const next = value.map((pair) => pair.id === id ? { ...pair, ...patch, ...((patch.key !== undefined || patch.value !== undefined) && pair.source === 'generated' ? { source: undefined } : {}) } : pair)
    const last = next.at(-1)
    if (last?.key || last?.value) next.push(emptyPair())
    onChange(next)
  }
  return <div className="pair-list">
    <div className="pair-head"><span>Use</span><span>Key</span><span>Value</span><span /></div>
    {generated.map((pair) => <div className="pair-row generated-row" key={pair.id} title="Generated by the Auth tab"><input aria-label="Generated field" type="checkbox" checked readOnly disabled /><input aria-label="Generated key" value={pair.key} readOnly disabled /><input aria-label="Generated value" value={pair.value.includes('{{') ? pair.value : '••••••••'} readOnly disabled /><span className="generated-tag">Auth</span></div>)}
    {value.map((pair, index) => <div className="pair-row" key={pair.id}>
      <input aria-label="Enable field" type="checkbox" checked={pair.enabled} disabled={disabled} onChange={(event) => update(pair.id, { enabled: event.target.checked })} />
      <input aria-label="Key" placeholder="Key" value={pair.key} disabled={disabled} onChange={(event) => update(pair.id, { key: event.target.value })} />
      <input aria-label="Value" placeholder="Value" value={pair.value} disabled={disabled} onChange={(event) => update(pair.id, { value: event.target.value })} />
      {pair.source === 'generated' ? <span className="generated-tag" title="Generated from the selected body type">Auto</span> : <button className="icon-button subtle" aria-label="Remove field" disabled={disabled || value.length === 1} onClick={() => onChange(value.filter((item) => item.id !== pair.id))}><X size={15} /></button>}
      {index === value.length - 1 && <span className="sr-only">Blank row</span>}
    </div>)}
  </div>
}

function AuthorizationEditor({ value, onChange }: { value?: RequestAuth; onChange: (value: RequestAuth) => void }) {
  const auth = value ?? { type: 'none' }
  const selectType = (type: RequestAuth['type']) => {
    if (type === 'bearer') onChange({ type, token: '' })
    else if (type === 'basic') onChange({ type, username: '', password: '' })
    else if (type === 'api-key') onChange({ type, key: 'X-API-Key', value: '', location: 'header' })
    else onChange({ type: 'none' })
  }
  return <div className="auth-editor">
    <div className="auth-editor-heading"><KeyRound size={17} /><div><strong>Request authorization</strong><span>Credentials stay in this browser and support environment variables.</span></div></div>
    <label>Type<select value={auth.type} onChange={(event) => selectType(event.target.value as RequestAuth['type'])}><option value="none">No Auth</option><option value="bearer">Bearer Token / JWT</option><option value="basic">Basic Auth</option><option value="api-key">API Key</option></select></label>
    {auth.type === 'none' && <div className="empty-editor">This request does not add an authorization credential.</div>}
    {auth.type === 'bearer' && <label>Token<input type="password" autoComplete="off" value={auth.token} onChange={(event) => onChange({ ...auth, token: event.target.value })} placeholder="{{accessToken}} or eyJ…" /></label>}
    {auth.type === 'basic' && <div className="auth-fields"><label>Username<input autoComplete="off" value={auth.username} onChange={(event) => onChange({ ...auth, username: event.target.value })} placeholder="{{username}}" /></label><label>Password<input type="password" autoComplete="off" value={auth.password} onChange={(event) => onChange({ ...auth, password: event.target.value })} placeholder="{{password}}" /></label></div>}
    {auth.type === 'api-key' && <><div className="auth-fields"><label>Key<input value={auth.key} onChange={(event) => onChange({ ...auth, key: event.target.value })} placeholder="X-API-Key" /></label><label>Value<input type="password" autoComplete="off" value={auth.value} onChange={(event) => onChange({ ...auth, value: event.target.value })} placeholder="{{apiKey}}" /></label></div><label>Add to<select value={auth.location} onChange={(event) => onChange({ ...auth, location: event.target.value as 'header' | 'query' })}><option value="header">Header</option><option value="query">Query parameter</option></select></label></>}
    {auth.type !== 'none' && <p className="auth-editor-note">Use <code>{'{{variableName}}'}</code> to keep the value isolated in the active environment.</p>}
  </div>
}

function Sidebar({ open, close, importBackup, account, syncState }: { open: boolean; close: () => void; importBackup: () => void; account: boolean; syncState: string }) {
  const { collections, requests, history, removeCollection, selectRequest, clearHistory, manageRequest } = useAppStore()
  const [section, setSection] = useState<'collections' | 'history'>('collections')
  const [pendingExport, setPendingExport] = useState<{ filename: string; data: unknown }>()
  const [createLocation, setCreateLocation] = useState<{ collectionId?: string; parent?: string[] }>()
  const [manageId, setManageId] = useState<string>()
  const [manageFolder, setManageFolder] = useState<{ collectionId: string; path: string[] }>()
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const draggedRequest = useRef<string | undefined>(undefined)
  const movePending = useRef(false)
  const [dragging, setDragging] = useState(false)
  const [dropTarget, setDropTarget] = useState<string>()
  const [moveMessage, setMoveMessage] = useState('')
  const [moveError, setMoveError] = useState('')
  const dragType = 'application/x-openrequest-request-id'
  const dragHover = useRef<{ key?: string; timer?: number }>({})
  const endDrag = () => { window.clearTimeout(dragHover.current.timer); dragHover.current = {}; draggedRequest.current = undefined; setDragging(false); setDropTarget(undefined) }
  const dropProps = (label: string, collectionId?: string, folderPath: string[] = []) => {
    const targetKey = JSON.stringify([collectionId ?? null, folderPath])
    return {
      'data-drop-target': label,
      'data-drop-active': dropTarget === targetKey ? 'true' : undefined,
      onDragOver: (event: DragEvent<HTMLDivElement>) => {
        // Only accept a drag started by this sidebar, never external text/files.
        if (!draggedRequest.current || movePending.current || !event.dataTransfer.types.includes(dragType)) return
        event.preventDefault(); event.stopPropagation()
        event.dataTransfer.dropEffect = 'move'
        setDropTarget(targetKey)
        if (collectionId && dragHover.current.key !== targetKey) {
          window.clearTimeout(dragHover.current.timer)
          dragHover.current = { key: targetKey, timer: window.setTimeout(() => setExpanded((current) => ({ ...current, [collectionId]: true,
            ...Object.fromEntries(folderPath.map((_, i) => [`${collectionId}:folder:${folderKey(folderPath.slice(0, i + 1))}`, true])) })), 600) }
        }
      },
      onDragLeave: (event: DragEvent<HTMLDivElement>) => {
        if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return
        setDropTarget((current) => current === targetKey ? undefined : current)
        if (dragHover.current.key === targetKey) { window.clearTimeout(dragHover.current.timer); dragHover.current = {} }
      },
      onDrop: async (event: DragEvent<HTMLDivElement>) => {
        const id = draggedRequest.current
        if (!id || movePending.current || event.dataTransfer.getData(dragType) !== id) return
        event.preventDefault(); event.stopPropagation(); endDrag()
        const request = useAppStore.getState().requests.find((r) => r.id === id)
        if (!request) { setMoveError('This saved request no longer exists.'); return }
        if (request.collectionId === collectionId && sameFolder(request.folderPath, folderPath)) {
          setMoveMessage(`${request.name} is already in ${label}.`); return
        }
        movePending.current = true
        try {
          await manageRequest(id, { name: request.name, collectionId, folderPath })
          if (collectionId) setExpanded((current) => ({ ...current, [collectionId]: true,
            ...Object.fromEntries(folderPath.map((_, i) => [`${collectionId}:folder:${folderKey(folderPath.slice(0, i + 1))}`, true])) }))
          setMoveMessage(`Moved ${request.name} to ${label}.`)
        } catch (error) { setMoveError(error instanceof Error ? error.message : 'Could not move this request.') }
        finally { movePending.current = false }
      }
    }
  }

  const add = () => { close(); setCreateLocation({}) }
  const exportCollection = (collection: Collection) => {
    close(); setPendingExport({ filename: `${collection.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.openrequest.json`, data: {
      format: 'openrequest.collection', version: 1, collection,
      requests: requests.filter((request) => request.collectionId === collection.id)
    } })
  }
  const renderRequest = (request: typeof requests[number]) => <div className="managed-request-row" key={request.id}>
    <button className="request-item" draggable title="Drag to a collection or folder; use ⋯ to move with keyboard or touch"
      onDragStart={(event) => {
        if (movePending.current) { event.preventDefault(); return }
        draggedRequest.current = request.id
        event.dataTransfer.setData(dragType, request.id)
        event.dataTransfer.effectAllowed = 'move'
        setDragging(true); setMoveMessage(''); setMoveError('')
      }} onDragEnd={endDrag}
      onClick={() => { selectRequest(request); close() }}><b className={`method ${request.method.toLowerCase()}`}>{request.method}</b><span>{request.name}</span></button>
    <button className="request-manage-button" aria-label={`Manage ${request.name}`} title="Rename, move, duplicate or delete" onClick={() => { close(); setManageId(request.id) }}><MoreHorizontal size={16} strokeWidth={1.8} /></button>
  </div>
  const visibleUnfiled = requests.filter((request) => !request.collectionId && matchesRequest(request, query, 'Unfiled'))

  return <><aside className={`sidebar ${open ? 'open' : ''}`}>
    <div className="brand"><img src={appMarkUrl} alt="" /><span>OpenRequest</span><button className="icon-button mobile-only" aria-label="Close menu" onClick={close}><X size={18} /></button></div>
    <div className="side-tabs">
      <button className={section === 'collections' ? 'active' : ''} onClick={() => setSection('collections')}><Archive size={16} /> Collections</button>
      <button className={section === 'history' ? 'active' : ''} onClick={() => setSection('history')}><History size={16} /> History</button>
    </div>
    <div className="side-content" onDragOverCapture={(event) => {
      if (!draggedRequest.current || !event.dataTransfer.types.includes(dragType)) return
      const pane = event.currentTarget, box = pane.getBoundingClientRect()
      if (event.clientY < box.top + 36) pane.scrollTop -= 24
      else if (event.clientY > box.bottom - 36) pane.scrollTop += 24
    }}>
      {section === 'collections' ? <>
        <div className="section-title"><span>Local workspace</span><button className="icon-button" aria-label="Add collection" onClick={add}><Plus size={17} /></button></div>
        <div className="backup-actions"><button onClick={() => { close(); importBackup() }}>Import backup</button><button onClick={() => { close(); setPendingExport({ filename: 'workspace.openrequest.json', data: workspaceBackup(collections, requests) }) }}>Export backup</button></div>
        <div className="request-search"><input aria-label="Search saved requests" placeholder="Search name, URL or method" value={query} onChange={(event) => setQuery(event.target.value)} />{query && <button aria-label="Clear request search" onClick={() => setQuery('')}><X size={14} /></button>}</div>
        {query.trim() && !requests.some((r) => matchesRequest(r, query, `${collections.find((c) => c.id === r.collectionId)?.name ?? 'Unfiled'} ${(r.folderPath ?? []).join(' / ')}`)) && !collections.some((c) => c.name.toLowerCase().includes(query.trim().toLowerCase()) || collectionFolders(c, requests).some((path) => `${c.name} / ${path.join(' / ')}`.toLowerCase().includes(query.trim().toLowerCase()))) && <p className="empty-small">No saved requests match.</p>}
        {collections.length === 0 && <div className="empty-small"><Folder size={22} /><p>Your collections stay in this browser.</p><button onClick={add}>Create collection</button></div>}
        {collections.map((collection) => {
          const folders = collectionFolders(collection, requests)
          const children = requests.filter((request) => request.collectionId === collection.id && matchesRequest(request, query, `${collection.name} ${(request.folderPath ?? []).join(' / ')}`))
          const folderMatches = (path: string[]) => `${collection.name} / ${path.join(' / ')}`.toLowerCase().includes(query.trim().toLowerCase())
          const folderVisible = (path: string[]) => !query.trim() || children.some((r) => inFolder(r.folderPath, path)) || folders.some((f) => inFolder(f, path) && folderMatches(f))
          if (query.trim() && !children.length && !folderMatches([]) && !folders.some(folderMatches)) return null
          const isOpen = Boolean(query.trim()) || (expanded[collection.id] ?? true)
          const renderGroup = (parent: string[]): ReactNode => <>
            {folders.filter((path) => path.length === parent.length + 1 && inFolder(path, parent) && folderVisible(path)).map((path) => {
              const key = `${collection.id}:folder:${folderKey(path)}`
              const open = Boolean(query.trim()) || (expanded[key] ?? true)
              const label = `${collection.name} / ${path.join(' / ')}`
              return <div className="folder-tree" key={key}>
                <div className="tree-label folder-label" {...dropProps(label, collection.id, path)} style={{ paddingLeft: `${path.length * 9}px` }}>
                  <button className="tree-main" aria-label={`Folder ${label}`} title={label} onClick={() => setExpanded({ ...expanded, [key]: !open })}>{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}<Folder size={14} /><span>{path.at(-1)}</span><small>{children.filter((r) => inFolder(r.folderPath, path)).length}</small></button>
                  <div className="tree-actions"><button aria-label={`Add subfolder in ${label}`} title="Create subfolder" onClick={() => { close(); setCreateLocation({ collectionId: collection.id, parent: path }) }}><Plus size={14} /></button><button aria-label={`Export folder ${label}`} title="Export folder and subfolders" onClick={() => { close(); setPendingExport({ filename: `${[collection.name, ...path].join('-').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.openrequest.json`, data: folderBackup(collection, requests, path) }) }}><Download size={14} /></button></div>
                  <button className="request-manage-button" aria-label={`Manage folder ${label}`} onClick={() => { close(); setManageFolder({ collectionId: collection.id, path }) }}><MoreHorizontal size={16} /></button>
                </div>
                {open && renderGroup(path)}
              </div>
            })}
            {children.filter((request) => sameFolder(request.folderPath, parent)).map((request) => <div key={request.id} style={{ paddingLeft: `${parent.length * 9}px` }}>{renderRequest(request)}</div>)}
          </>
          return <div className="tree" key={collection.id}>
            <div className="tree-label" {...dropProps(collection.name, collection.id)}>
              <button className="tree-main" onClick={() => setExpanded({ ...expanded, [collection.id]: !isOpen })}>
                {isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}<Folder size={16} /><span>{collection.name}</span><small>{children.length}</small>
              </button>
              <div className="tree-actions"><button aria-label={`Add folder in ${collection.name}`} title="Create folder" onClick={() => { close(); setCreateLocation({ collectionId: collection.id, parent: [] }) }}><Plus size={14} /></button><button title="Export collection" onClick={() => exportCollection(collection)}><Download size={14} /></button><button title="Delete collection" onClick={() => window.confirm(`Delete ${collection.name}? Requests will remain unfiled.`) && removeCollection(collection.id)}><Trash2 size={14} /></button></div>
            </div>
            {isOpen && renderGroup([])}
          </div>
        })}
        {(visibleUnfiled.length > 0 || dragging) && <div className="tree unfiled"><div className="section-title" {...dropProps('Unfiled')}>Unfiled</div>{visibleUnfiled.map(renderRequest)}</div>}
      </> : <>
        <div className="section-title"><span>Recent requests</span>{history.length > 0 && <button className="text-button" onClick={() => window.confirm('Clear local history?') && clearHistory()}>Clear</button>}</div>
        {history.length === 0 && <div className="empty-small"><Clock3 size={22} /><p>Requests you send will appear here.</p></div>}
        {history.map((entry) => <button className="history-item" key={entry.id} onClick={() => { selectRequest(entry.request); close() }}><b className={`method ${entry.request.method.toLowerCase()}`}>{entry.request.method}</b><span><strong>{entry.request.name}</strong><small>{new Date(entry.createdAt).toLocaleString()}</small></span>{entry.response && <em className={entry.response.status < 400 ? 'ok' : 'bad'} title={httpStatusTooltip(entry.response.status)} aria-label={httpStatusTooltip(entry.response.status)}>{entry.response.status}</em>}</button>)}
      </>}
    </div>
    {(dragging || moveMessage || moveError) && <div className="request-move-feedback">
      {dragging && <p className="request-move-note">Drop on a collection, folder or Unfiled.</p>}
      {moveMessage && <p className="request-move-note" role="status">{moveMessage}</p>}
      {moveError && <p className="request-move-note" role="alert">{moveError}</p>}
      {!dragging && <button className="icon-button" aria-label="Dismiss move notification" onClick={() => { setMoveMessage(''); setMoveError('') }}><X size={14} /></button>}
    </div>}
    <div className="local-badge"><span className="status-dot" /> {syncState === 'synced' ? 'Encrypted sync active' : syncState === 'syncing' ? 'Synchronizing…' : syncState === 'paused' ? 'Sync needs attention' : 'Local-only mode'} <small>{account ? 'Signed in' : 'No account'}</small></div>
    <a className="developer-link" href="https://avaibhav51.github.io" target="_blank" rel="noreferrer">Built by Vaibhav Agarwal <span>↗</span></a>
  </aside>{pendingExport && <BackupExportConfirmation close={() => setPendingExport(undefined)} confirm={() => {
    download(pendingExport.filename, pendingExport.data)
    setPendingExport(undefined)
  }} />}{manageId && <RequestManagementModal id={manageId} close={() => setManageId(undefined)} />}{manageFolder && <FolderManagementModal {...manageFolder} close={() => setManageFolder(undefined)} />}{createLocation && <CreateFolderModal {...createLocation} close={() => setCreateLocation(undefined)} />}</>
}

function ModalPanel({ modal, close }: { modal: 'curl' | 'save' | 'settings'; close: () => void }) {
  const { collections, requests, draft, updateDraft, saveDraft, pendingSyncCount } = useAppStore()
  const [curl, setCurl] = useState('')
  const [message, setMessage] = useState('')
  const [name, setName] = useState(draft.name)
  const [collectionId, setCollectionId] = useState(draft.collectionId ?? '')
  const [folderPath, setFolderPath] = useState(draft.folderPath ?? [])
  const [creating, setCreating] = useState<'collection' | 'folder'>()
  const [saving, setSaving] = useState(false)
  const selectedCollection = collections.find((c) => c.id === collectionId)

  const importCurl = () => {
    try { updateDraft(parseCurl(curl)); close() } catch (error) { setMessage(error instanceof Error ? error.message : String(error)) }
  }
  const save = async () => {
    if (saving) return
    setSaving(true)
    updateDraft({ name, collectionId: selectedCollection?.id, folderPath: selectedCollection ? folderPath : [] })
    await new Promise((resolve) => setTimeout(resolve, 0))
    try { await saveDraft(); close() } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save this request.') }
    finally { setSaving(false) }
  }
  if (modal === 'save' && (creating === 'collection' || (creating === 'folder' && selectedCollection))) return <CreateFolderModal collectionId={creating === 'folder' ? selectedCollection?.id : undefined} parent={creating === 'folder' ? folderPath : []} close={() => setCreating(undefined)} created={setFolderPath} collectionCreated={(id) => { setCollectionId(id); setFolderPath([]) }} />
  return <div className="modal-backdrop" onMouseDown={(event) => !saving && event.target === event.currentTarget && close()}>
    <section className="modal" role="dialog" aria-modal="true" aria-label={modal === 'curl' ? 'Import cURL' : modal === 'save' ? 'Save request' : 'Workspace settings'}>
      <header><div>{modal === 'curl' ? <ClipboardPaste /> : modal === 'save' ? <Save /> : <Settings />}<div><h2>{modal === 'curl' ? 'Import cURL' : modal === 'save' ? 'Save request' : 'Workspace settings'}</h2><p>{modal === 'settings' ? 'This workspace is private by default.' : ''}</p></div></div><button className="icon-button" disabled={saving} aria-label="Close dialog" onClick={close}><X /></button></header>
      {modal === 'curl' && <div className="modal-body"><label>cURL command<textarea autoFocus rows={9} value={curl} onChange={(event) => setCurl(event.target.value)} placeholder="curl 'https://api.example.com/users' \
  -H 'Authorization: Bearer …'" /></label>{message && <p className="error-note">{message}</p>}<div className="modal-actions"><button onClick={close}>Cancel</button><button className="primary" onClick={importCurl}>Import request</button></div></div>}
      {modal === 'save' && <div className="modal-body">
        <label>Request name<input autoFocus disabled={saving} value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label>Collection<select aria-label="Collection" value={collectionId} disabled={saving} onChange={(event) => {
          if (event.target.value === '__create_collection__') { setCreating('collection'); return }
          setCollectionId(event.target.value); setFolderPath([])
        }}><option value="">Unfiled</option>{collections.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}<option value="__create_collection__">＋ New collection…</option></select></label>
        {selectedCollection && <label>Folder<select aria-label="Save to folder" value={folderKey(folderPath)} disabled={saving} onChange={(event) => {
          if (event.target.value === '__create_folder__') { setCreating('folder'); return }
          setFolderPath(JSON.parse(event.target.value) as string[])
        }}><option value="[]">Collection root</option>{collectionFolders(selectedCollection, requests).map((path) => <option key={folderKey(path)} value={folderKey(path)}>{path.join(' / ')}</option>)}<option value="__create_folder__">{folderPath.length ? '＋ New subfolder in selected folder…' : '＋ New folder…'}</option></select></label>}
        {message && <p className="error-note" role="alert">{message}</p>}
        <div className="modal-actions"><button disabled={saving} onClick={close}>Cancel</button><button className="primary" disabled={saving} onClick={save}>Save locally</button></div>
      </div>}
      {modal === 'settings' && <div className="modal-body settings-copy"><div className="privacy-card"><span className="status-dot" /><div><strong>Local-first workspace</strong><p>Your work stays in this browser unless you sign in and explicitly enable encrypted sync.</p></div></div><h3 className="with-info">End-to-end encrypted sync <InfoTip label="How encrypted sync protects data" text="Saved requests are encrypted in this browser before upload. Supabase stores ciphertext and limited account/revision metadata, not the plaintext workspace key, sync passphrase, or decrypted requests. Database operators can copy, delete, or alter encrypted rows but cannot decrypt them with database credentials alone." /></h3><p>{pendingSyncCount} local change{pendingSyncCount === 1 ? '' : 's'} waiting to sync. A new browser needs both your account login and sync passphrase once.</p><h3 className="with-info">Private on this browser <InfoTip label="What does not synchronize" text="Unsaved edits, responses, history, variables, never-synced empty collections, and known active authorization values remain local. Local use never requires an account." /></h3><p>Only explicitly saved requests and the collection details needed to organize them participate in sync.</p><h3 className="with-info">Security note <InfoTip label="Encryption limitations" text="Encryption cannot protect against a compromised frontend, malicious extension, unlocked device, or code that captures data before encryption. Use a unique passphrase, retain exports, and avoid long-lived production secrets while this 0.x feature has no independent security audit." /></h3><p>Use a unique sync passphrase and keep independent exports for important work.</p><h3>Browser boundary</h3><p>Web browsers enforce CORS and cannot make arbitrary native gRPC or raw TCP requests. Some APIs require compatible CORS settings or the planned local companion.</p><div className="modal-actions"><button className="primary" onClick={close}>Done</button></div></div>}
    </section>
  </div>
}

function App() {
  useModalAccessibility()
  const pendingUpdate = useSyncExternalStore(subscribeUpdates, updateAvailable)
  const [updateError, setUpdateError] = useState('')
  const installUpdate = async () => {
    try {
      await flushDraftPersistence()
      if (window.confirm('Update and reload? Stored drafts remain, but current responses and running requests will reset.')) await applyAppUpdate()
    } catch (error) { setUpdateError(error instanceof Error ? error.message : 'Could not update.') }
  }
  const retryState = useRef({ owner: '', failures: 0, nextAt: 0 })
  const store = useAppStore()
  const { draft } = store
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      const state = useAppStore.getState()
      if (state.persistenceError || state.pendingDraftWrites) { event.preventDefault(); event.returnValue = '' }
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [])
  const { response, error, busy = false } = store.requestRuns[draft.id] ?? {}
  const [editorTab, setEditorTab] = useState<EditorTab>('params')
  const [responseTab, setResponseTab] = useState<ResponseTab>('body')
  const [modal, setModal] = useState<Modal>(null)
  const [sidebar, setSidebar] = useState(false)
  const [dark, setDark] = useState(() => localStorage.getItem('theme') !== 'light')
  const [copied, setCopied] = useState(false)
  const [responseCopied, setResponseCopied] = useState(false)
  const [pasteNotice, setPasteNotice] = useState('')
  const [startupError, setStartupError] = useState(false)
  const [authUser, setAuthUser] = useState<AuthUser | null>(null)
  const [syncState, setSyncState] = useState<'local' | 'syncing' | 'synced' | 'paused'>('local')
  const [splitPercent, setSplitPercent] = useState(42)
  const [stackedSplit, setStackedSplit] = useState(() => window.matchMedia('(max-width: 1100px)').matches)

  useEffect(() => { setResponseCopied(false) }, [draft.id, response])
  const openWorkspace = () => { setStartupError(false); void store.hydrate().catch(() => setStartupError(true)) }
  useEffect(() => { openWorkspace() }, [])
  useEffect(() => { document.documentElement.dataset.theme = dark ? 'dark' : 'light'; localStorage.setItem('theme', dark ? 'dark' : 'light') }, [dark])
  useEffect(() => {
    const media = window.matchMedia('(max-width: 1100px)')
    const update = () => setStackedSplit(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  useEffect(() => {
    if (!authClient) return
    authClient.auth.getSession().then(({ data }) => setAuthUser(data.session?.user ?? null))
    const { data } = authClient.auth.onAuthStateChange((_event, session) => setAuthUser(session?.user ?? null))
    return () => data.subscription.unsubscribe()
  }, [])
  useEffect(() => {
    if (!authUser || !store.hydrated) { setSyncState('local'); return }
    if (retryState.current.owner !== authUser.id) retryState.current = { owner: authUser.id, failures: 0, nextAt: 0 }
    let disposed = false
    let timer: number | undefined
    let running = false
    const schedule = (delay: number) => { window.clearTimeout(timer); if (!disposed) timer = window.setTimeout(synchronize, delay) }
    const synchronize = async () => {
      if (disposed || running) return
      if (Date.now() < retryState.current.nextAt) { schedule(retryState.current.nextAt - Date.now()); return }
      running = true
      try {
        const status = await getSyncStatus(authUser.id)
        if (!status.enabled) { if (!disposed) setSyncState(status.boundToDifferentAccount ? 'paused' : 'local'); return }
        if (!disposed) setSyncState('syncing')
        await syncNow(authUser.id)
        if (disposed) return
        await useAppStore.getState().hydrate()
        retryState.current.failures = 0; retryState.current.nextAt = 0
        if (!disposed) setSyncState('synced')
      } catch {
        const delay = syncRetryDelay(++retryState.current.failures)
        retryState.current.nextAt = Date.now() + delay
        if (!disposed) setSyncState('paused')
      } finally { running = false; schedule(Math.max(30_000, retryState.current.nextAt - Date.now())) }
    }
    const onOnline = () => { retryState.current.nextAt = 0; void synchronize() }
    const onVisible = () => { if (document.visibilityState === 'visible') void synchronize() }
    void synchronize()
    window.addEventListener('online', onOnline)
    window.addEventListener('focus', synchronize)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      disposed = true
      window.clearTimeout(timer)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('focus', synchronize)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [authUser?.id, store.hydrated, store.pendingSyncCount])

  const prettyBody = useMemo(() => {
    if (!response) return ''
    if (response.bodyEncoding === 'base64') return response.body
    if (response.contentType.includes('json')) {
      try { return JSON.stringify(JSON.parse(response.body), null, 2) } catch { return response.body }
    }
    if (/xml|svg/i.test(response.contentType)) return formatXml(response.body)
    return response.body
  }, [response])
  const responseIsImage = Boolean(response?.bodyEncoding === 'base64' && /^image\/(?!svg)/i.test(response.contentType))
  const activeEnvironment = store.environments.find((item) => item.id === store.activeEnvironmentId)
  const activeVariables = useMemo(() => variableMap(store.variables, store.activeEnvironmentId), [store.variables, store.activeEnvironmentId])
  const variableReferences = useMemo(() => referencedVariables(draft), [draft])
  const missingVariables = variableReferences.filter((key) => !key.startsWith('$') && !Object.hasOwn(activeVariables, key))
  const bodyAllowed = !['GET', 'HEAD'].includes(draft.method)
  const bodyContainsCredentials = useMemo(() => {
    if (draft.bodyType !== 'json') return false
    try {
      const value = JSON.parse(draft.body) as unknown
      return Boolean(value && typeof value === 'object' && ('username' in value || 'password' in value))
    } catch { return false }
  }, [draft.body, draft.bodyType])
  const generatedHeaders = useMemo<KeyValue[]>(() => {
    if (draft.auth?.type === 'bearer') return [{ id: 'auth-authorization', key: 'Authorization', value: `Bearer ${draft.auth.token}`, enabled: true, source: 'generated' }]
    if (draft.auth?.type === 'basic') return [{ id: 'auth-authorization', key: 'Authorization', value: `Basic ${draft.auth.username}:${draft.auth.password}`, enabled: true, source: 'generated' }]
    if (draft.auth?.type === 'api-key' && draft.auth.location === 'header' && draft.auth.key.trim()) return [{ id: 'auth-api-key', key: draft.auth.key, value: draft.auth.value, enabled: true, source: 'generated' }]
    return []
  }, [draft.auth])
  const generatedParams = useMemo<KeyValue[]>(() => draft.auth?.type === 'api-key' && draft.auth.location === 'query' && draft.auth.key.trim()
    ? [{ id: 'auth-api-key-query', key: draft.auth.key, value: draft.auth.value, enabled: true, source: 'generated' }]
    : [], [draft.auth])
  const authConflict = useMemo(() => {
    const auth = draft.auth
    if (!auth || auth.type === 'none') return ''
    if ((auth.type === 'bearer' || auth.type === 'basic') && draft.headers.some((item) => item.enabled && item.key.toLowerCase() === 'authorization')) return 'A manual Authorization header also exists. The Auth tab value will be sent.'
    if (auth.type === 'api-key') {
      if (!auth.key.trim()) return ''
      const pairs = auth.location === 'header' ? draft.headers : draft.params
      if (pairs.some((item) => item.enabled && item.key.toLowerCase() === auth.key.toLowerCase())) return `A manual ${auth.location} value named ${auth.key} also exists. The Auth tab value will be sent.`
    }
    return ''
  }, [draft.auth, draft.headers, draft.params])

  const send = async () => {
    const snapshot = structuredClone(draft)
    const environmentId = store.activeEnvironmentId
    const runId = store.beginRun(snapshot.id)
    if (!runId) return
    const signal = useAppStore.getState().requestRuns[snapshot.id].controller!.signal
    let sentRequest = snapshot
    let dispatched = false
    let result: Awaited<ReturnType<typeof executeRequest>> | undefined
    try {
      const prepared = await runPreRequestScript(snapshot.preRequestScript ?? '', snapshot, activeVariables, signal)
      checkCancelled(signal)
      sentRequest = resolveRequest(prepared.request, prepared.variables)
      await store.applyEnvironmentMutations(environmentId, prepared.environmentMutations)
      checkCancelled(signal)
      dispatched = true
      result = await executeRequest(sentRequest, signal)
      checkCancelled(signal)
      result.scriptLogs = prepared.logs
      try {
        const post = runPostResponseScript(snapshot.postResponseScript ?? '', result, prepared.variables, requestLogSecrets(sentRequest))
        result.scriptLogs.push(...post.logs)
        result.scriptChecks = post.checks
        if (post.errors.length) result.scriptError = post.errors.join(' · ')
        await store.applyEnvironmentMutations(environmentId, post.environmentMutations)
      } catch (scriptError) {
        result.scriptError = [result.scriptError, scriptError instanceof Error ? scriptError.message : 'Script capture could not be stored'].filter(Boolean).join(' · ')
      }
      checkCancelled(signal)
      store.finishRun(snapshot.id, runId, result)
    } catch (requestError) {
      store.finishRun(snapshot.id, runId, undefined, friendlyRequestError(requestError))
    }
    // Storage failures must not mislabel a successful network response as a network error.
    if (dispatched) try { await store.recordRun(sentRequest, result) } catch (historyError) { console.error('Could not save local request history', historyError) }
  }
  const pasteIntoUrl = (event: ClipboardEvent<HTMLInputElement>) => {
    const value = event.clipboardData.getData('text').trim()
    if (!/^curl(?:\s|$)/i.test(value)) return
    event.preventDefault()
    try {
      store.updateDraft(parseCurl(value))
      setPasteNotice('cURL detected and imported')
      window.setTimeout(() => setPasteNotice(''), 1800)
    } catch (pasteError) {
      setPasteNotice(pasteError instanceof Error ? pasteError.message : String(pasteError))
    }
  }
  const copyCurl = async () => { await navigator.clipboard.writeText(toCurl(draft)); setCopied(true); setTimeout(() => setCopied(false), 1200) }
  const updateUrl = (url: string) => store.updateDraft({ url, params: queryParamsFromUrl(url) })
  const updateParams = (params: KeyValue[]) => store.updateDraft({ params, url: urlWithQueryParams(draft.url, params) })
  const updateHeaders = (headers: KeyValue[]) => {
    const contentType = headers.find((header) => header.enabled && header.key.toLowerCase() === 'content-type')?.value
    const inferred = contentType ? bodyTypeFromContentType(contentType) : undefined
    store.updateDraft({ headers, ...(inferred ? { bodyType: inferred } : {}) })
  }
  const updateBodyType = (bodyType: typeof draft.bodyType) => store.updateDraft({ bodyType, headers: headersForBodyType(draft.headers, bodyType), bodyFields: draft.bodyFields ?? [emptyPair()] })
  const copyResponse = async () => {
    if (!response) return
    const value = responseTab === 'headers' ? response.headers.map((header) => `${header.key}: ${header.value}`).join('\n') : responseTab === 'raw' ? response.body : prettyBody
    await navigator.clipboard.writeText(value)
    setResponseCopied(true)
    window.setTimeout(() => setResponseCopied(false), 1200)
  }
  const clearResponse = () => store.clearResponse(draft.id)
  const responseCopyLabel = responseTab === 'headers' ? 'response headers' : responseTab === 'raw' ? 'raw response' : 'response body'
  const clampSplit = (value: number) => Math.min(72, Math.max(28, value))
  const resizeSplit = (event: PointerEvent<HTMLButtonElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
    const bounds = event.currentTarget.parentElement?.getBoundingClientRect()
    if (!bounds) return
    const position = stackedSplit ? event.clientY - bounds.top : event.clientX - bounds.left
    const size = stackedSplit ? bounds.height : bounds.width
    setSplitPercent(clampSplit(position / size * 100))
  }
  const resizeSplitWithKeyboard = (event: KeyboardEvent<HTMLButtonElement>) => {
    const decrease = stackedSplit ? event.key === 'ArrowUp' : event.key === 'ArrowLeft'
    const increase = stackedSplit ? event.key === 'ArrowDown' : event.key === 'ArrowRight'
    if (!decrease && !increase && event.key !== 'Home') return
    event.preventDefault()
    setSplitPercent((current) => event.key === 'Home' ? 42 : clampSplit(current + (increase ? 3 : -3)))
  }

  if (!store.hydrated) return <div className="workspace-loading" role={startupError ? 'alert' : 'status'}>{startupError ? <><p>Could not open local workspace. Check browser storage permissions and retry.</p><button onClick={openWorkspace}>Retry</button></> : 'Opening local workspace…'}</div>

  return <div className="app-shell" data-sync-state={syncState}>
    <Sidebar open={sidebar} close={() => setSidebar(false)} importBackup={() => setModal('backup')} account={Boolean(authUser)} syncState={syncState} />
    {sidebar && <button className="mobile-scrim" aria-label="Close menu" onClick={() => setSidebar(false)} />}
    <main>
      <header className="topbar"><button className="icon-button mobile-only" aria-label="Open menu" onClick={() => setSidebar(true)}><Menu /></button><div className="mode-label"><span className="status-dot" /> Private workspace</div><div className="top-actions"><button className="environment-switch" onClick={() => setModal('variables')} title="Manage isolated environments"><i style={{ background: activeEnvironment?.color }} /><span>{activeEnvironment?.name ?? 'Variables'}</span><Tags size={14} /></button><button aria-label="Import cURL" onClick={() => setModal('curl')}><ClipboardPaste size={16} /> <span>Import cURL</span></button><button onClick={copyCurl}><Copy size={16} /> <span>{copied ? 'Copied' : 'Copy cURL'}</span></button><button className="account-button" onClick={() => setModal('auth')} title={authUser ? 'Account' : 'Optional sign in'}>{authUser ? <UserRound size={16} /> : <LogIn size={16} />}<span>{authUser?.email?.split('@')[0] ?? 'Sign in'}</span></button><button className="icon-button" onClick={() => setModal('help')} title="Quick reference"><CircleHelp size={18} /></button><button className="icon-button" onClick={() => setDark(!dark)} title="Toggle theme">{dark ? <Sun size={18} /> : <Moon size={18} />}</button><button className="icon-button" onClick={() => setModal('settings')} title="Settings"><Settings size={18} /></button></div></header>
      <section className="workspace">
        {pendingUpdate && <div className="pwa-update-notice" role="status">An app update is ready. Your work will not be reloaded automatically. <button onClick={() => void installUpdate()}>Update app</button>{updateError && <span role="alert">{updateError}</span>}</div>}
        {store.persistenceError && <div className="error-note persistence-warning" role="alert">{store.persistenceError} <button onClick={() => void store.retryDraftPersistence()}>Retry draft storage</button></div>}
        <nav className="request-tabs" aria-label="Open request drafts">{store.draftTabs.map((item) => {
          const saved = store.requests.find((request) => request.id === item.id)
          const dirty = isDraftDirty(item, saved)
          return <div className={item.id === draft.id ? 'active' : ''} key={item.id} data-dirty={dirty}>
            <button className="request-tab-main" onClick={() => store.selectRequest(item)}><b className={`method ${item.method.toLowerCase()}`}>{item.method}</b><span>{item.name || 'Untitled request'}</span>{store.requestRuns[item.id]?.busy && <i className="spinner request-tab-running" aria-hidden="true" title="Request running" />}{dirty && <i className="request-tab-dirty" aria-hidden="true" title="Unsaved changes — stored only in this browser" />}</button>
            <button className="request-tab-close" aria-label={`Close ${item.name || 'Untitled request'}`} onClick={() => {
              if (!dirty || window.confirm(saved ? 'Discard unsaved changes and close this tab? The saved copy will remain.' : 'Discard this local draft and close this tab? It has not been saved.')) store.closeDraft(item.id)
            }}><X size={12} /></button>
          </div>
        })}<button className="new-request-tab" aria-label="New request tab" onClick={store.newDraft}><Plus size={14} /></button></nav>
        <div className="request-title"><input value={draft.name} aria-label="Request name" onChange={(event) => store.updateDraft({ name: event.target.value })} /><div>{store.requests.some((request) => request.id === draft.id) && <button aria-label="Revert request" title="Restore the last saved copy" disabled={!isDraftDirty(draft, store.requests.find((request) => request.id === draft.id))} onClick={() => { if (window.confirm('Discard unsaved changes and restore the last saved copy?')) store.revertDraft() }}><RotateCcw size={16} /> Revert</button>}<button onClick={store.newDraft}><Plus size={16} /> New</button><button onClick={() => setModal('save')}><Save size={16} /> Save</button></div></div>
        {isDraftDirty(draft, store.requests.find((request) => request.id === draft.id)) && <div className="draft-status" role="status">Unsaved changes · kept in this browser, not synced. Save when ready.</div>}
        <div className="request-bar"><div className="method-control"><select aria-label="HTTP method" className={`method-select ${draft.method.toLowerCase()}`} value={draft.method} onChange={(event) => store.updateDraft({ method: event.target.value as typeof draft.method })}>{['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].map((method) => <option key={method} value={method}>{method}</option>)}</select><ChevronDown size={15} /></div><div className="url-input-wrap"><input aria-label="Request URL" placeholder="Paste a URL or cURL command" value={draft.url} onPaste={pasteIntoUrl} onChange={(event) => updateUrl(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && draft.url && send()} /><UrlDetails value={draft.url} /></div><button className="send-button" disabled={!busy && !draft.url} onClick={() => busy ? store.cancelRun(draft.id) : void send()}>{busy ? <X size={17} /> : <Send size={17} />}{busy ? 'Cancel request' : 'Send'}</button></div>
        <div className="request-options"><label>Timeout <select aria-label="Request timeout" value={draft.timeoutMs ?? 30000} onChange={(event) => store.updateDraft({ timeoutMs: Number(event.target.value) })}>{![0,1000,5000,10000,30000,60000,120000,300000].includes(draft.timeoutMs ?? 30000) && <option value={draft.timeoutMs}>{(draft.timeoutMs ?? 30000) / 1000} seconds</option>}{[0,1000,5000,10000,30000,60000,120000,300000].map((value) => <option key={value} value={value}>{value ? `${value / 1000} seconds` : 'No timeout'}</option>)}</select></label><span>Network and body download only; script delays are separate.</span></div>
        {pasteNotice && <div className="paste-notice"><ClipboardPaste size={13} />{pasteNotice}</div>}
        {(variableReferences.length > 0 || missingVariables.length > 0) && <div className={`variable-usage ${missingVariables.length ? 'has-missing' : ''}`}><Braces size={14} /><span>{variableReferences.length} variable{variableReferences.length === 1 ? '' : 's'} from <b>{activeEnvironment?.name}</b></span>{missingVariables.length > 0 && <button onClick={() => setModal('variables')}>Add missing: {missingVariables.join(', ')}</button>}</div>}
        <div className="split-view" style={{ '--request-pane': `${splitPercent}%` } as CSSProperties}>
          <section className="request-editor panel">
            <nav className="tabbar">{(['params', 'headers', 'auth', 'body', 'scripts'] as EditorTab[]).map((tab) => <button key={tab} className={editorTab === tab ? 'active' : ''} onClick={(event) => { setEditorTab(tab); event.currentTarget.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' }) }}>{tab}<small>{tab === 'params' ? draft.params.filter((p) => p.key).length + generatedParams.length : tab === 'headers' ? draft.headers.filter((p) => p.key).length + generatedHeaders.length : tab === 'auth' ? (draft.auth && draft.auth.type !== 'none' ? '•' : '') : tab === 'body' ? (draft.bodyType !== 'none' ? '•' : '') : ((draft.preRequestScript || draft.postResponseScript) ? '•' : '')}</small></button>)}</nav>
            <div className="editor-content">
              {editorTab === 'params' && <PairEditor value={draft.params} onChange={updateParams} generated={generatedParams} />}
              {editorTab === 'headers' && <PairEditor value={draft.headers} onChange={updateHeaders} generated={generatedHeaders} />}
              {editorTab === 'auth' && <><AuthorizationEditor value={draft.auth} onChange={(auth) => store.updateDraft({ auth })} />{authConflict && <div className="auth-conflict">{authConflict}</div>}</>}
              {editorTab === 'body' && <div className="body-editor">{!bodyAllowed && <div className="body-method-warning">{draft.method} requests do not send a body. Your drafted body is preserved for another method.</div>}{bodyContainsCredentials && <div className="body-credential-note">The username/password here are API payload fields. They remain in the JSON body; the Auth tab is only for HTTP authorization such as Basic, Bearer, or API keys.</div>}<div className="segmented">{(['none', 'json', 'text', 'form', 'multipart'] as const).map((type) => <button key={type} disabled={!bodyAllowed} className={draft.bodyType === type ? 'active' : ''} onClick={() => updateBodyType(type)}>{type === 'text' ? 'Raw text' : type === 'form' ? 'Form URL Encoded' : type === 'multipart' ? 'Multipart' : type.toUpperCase()}</button>)}</div>{draft.bodyType === 'none' ? <div className="empty-editor">This request has no body.</div> : draft.bodyType === 'form' || draft.bodyType === 'multipart' ? <><PairEditor disabled={!bodyAllowed} value={draft.bodyFields ?? [emptyPair()]} onChange={(bodyFields) => store.updateDraft({ bodyFields })} />{draft.bodyType === 'multipart' && <p className="multipart-note">Text fields are supported now. Imported <code>@file</code> paths stay disabled because a browser requires explicit file selection. Portable file selection is the next part of this body mode.</p>}</> : <textarea disabled={!bodyAllowed} spellCheck={false} value={draft.body} onChange={(event) => store.updateDraft({ body: event.target.value })} placeholder={draft.bodyType === 'json' ? '{\n  "hello": "world"\n}' : 'Request body'} />}</div>}
              {editorTab === 'scripts' && <div className="script-editor"><div className="script-intro"><Braces size={16} /><span>Type a command or use Insert command. Ctrl+Space opens suggestions. <button onClick={() => setModal('help')}>Quick reference</button></span></div><ScriptSplit>
                <ScriptEditor key={draft.id + '-before'} phase="before" value={draft.preRequestScript ?? ''} onChange={(preRequestScript) => store.updateDraft({ preRequestScript })} variableNames={Object.keys(activeVariables)} placeholder={'variable traceId = {{$randomUUID}}\nheader X-Trace-Id = {{traceId}}\nquery page = 1\n# JSON body: body data.name = "example"\n# Local write: environment-set retryCount = 0\n# Optional delay: sleep 3000\nlog "Preparing request"'} />
                <ScriptEditor key={draft.id + '-after'} phase="after" value={draft.postResponseScript ?? ''} onChange={(postResponseScript) => store.updateDraft({ postResponseScript })} variableNames={Object.keys(activeVariables)} placeholder={'assert status == 200\nassert durationMs < 2000\nassert header Content-Type contains "application/json"\nassert json.success == true\nassert body contains "created"\ncapture token = json.data.token\n# Local removal: environment-unset staleToken\nlog "Response checked"'} />
              </ScriptSplit></div>}
            </div>
          </section>
          <button
            className="split-resizer"
            role="separator"
            aria-label="Resize request and response panels"
            aria-orientation={stackedSplit ? 'horizontal' : 'vertical'}
            aria-valuemin={28}
            aria-valuemax={72}
            aria-valuenow={Math.round(splitPercent)}
            title="Drag to resize; double-click or press Home to reset"
            onDoubleClick={() => setSplitPercent(42)}
            onKeyDown={resizeSplitWithKeyboard}
            onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); event.preventDefault() }}
            onPointerMove={resizeSplit}
            onPointerUp={(event) => event.currentTarget.releasePointerCapture(event.pointerId)}
          ><span /></button>
          <section className="response-panel panel">
            <div className="response-head"><nav className="tabbar"><button className={responseTab === 'body' ? 'active' : ''} onClick={() => setResponseTab('body')}>Response</button><button className={responseTab === 'raw' ? 'active' : ''} onClick={() => setResponseTab('raw')}>Raw</button><button className={responseTab === 'headers' ? 'active' : ''} onClick={() => setResponseTab('headers')}>Headers {response && <small>{response.headers.length}</small>}</button></nav>{response && <div className="response-meta"><b className={response.status < 400 ? 'ok' : 'bad'} title={httpStatusTooltip(response.status, response.statusText)} aria-label={httpStatusTooltip(response.status, response.statusText)}>{response.status} {response.statusText}</b><span>{response.durationMs} ms</span><span>{response.sizeBytes < 1024 ? `${response.sizeBytes} B` : `${(response.sizeBytes / 1024).toFixed(1)} KB`}</span><div className="response-actions"><button onClick={copyResponse} title={responseCopied ? 'Copied' : `Copy ${responseCopyLabel}`} aria-label={responseCopied ? 'Response copied' : `Copy ${responseCopyLabel}`}><Copy size={13} /></button><button onClick={clearResponse} title="Clear response" aria-label="Clear response"><X size={14} /></button></div></div>}</div>
            <div className="response-content">
              {response && <details className="response-diagnostics"><summary>Request details{response.redirected ? ' · Redirected' : ''}</summary><dl><dt>Final URL</dt><dd>{response.finalUrl || 'Not available for this stored response'}</dd><dt>Redirect</dt><dd>{response.redirected ? 'Followed by the browser; intermediate hops are not exposed.' : 'No redirect reported by the browser.'}</dd><dt>Content type</dt><dd>{response.contentType || 'Not provided'}</dd></dl><p>Only browser-readable headers are shown. URLs can contain credentials; review before sharing.</p></details>}
              {response && <ScriptResults key={draft.id} response={response} />}
              {error ? <div className="error-state"><div>!</div><h3>{/cancelled|timed out/i.test(error) ? 'Request stopped' : 'Request failed'}</h3><p>{error}</p>{/cancelled|timed out/i.test(error) && <p>Stopping the client does not undo work the server may already have received. Earlier script variable writes are not rolled back.</p>}</div> : !response ? <div className="response-empty"><Code2 size={30} /><h3>Ready when you are</h3><p>Enter a URL and send a request. Response data stays on this device.</p></div> : responseTab === 'headers' ? <div className="header-list">{response.headers.map((header) => <div key={header.id}><b>{header.key}</b><span>{header.value}</span></div>)}</div> : response.sizeBytes === 0 ? <div className="response-empty"><Code2 size={26} /><h3>{response.requestMethod === 'HEAD' ? 'HEAD responses have no body' : response.status === 204 || response.status === 304 ? 'No response body expected' : 'Server returned an empty body'}</h3><p>HTTP {response.status} · 0 bytes received. Inspect Headers or Request details for more information.</p></div> : responseTab === 'raw' ? <pre>{response.body}</pre> : responseIsImage ? <div className="image-preview"><img src={`data:${response.contentType};base64,${response.body}`} alt="API response" /><span>{response.contentType}</span></div> : response.bodyEncoding === 'base64' ? <div className="binary-preview"><Code2 size={28} /><strong>Binary response</strong><span>{response.contentType || 'Unknown content type'} · {response.sizeBytes} bytes</span><p>Use Raw or Copy to access the base64 representation.</p></div> : <HighlightedResponse value={prettyBody} contentType={response.contentType} />}
            </div>
          </section>
        </div>
      </section>
    </main>
    {modal === 'variables' && <VariablesModal close={() => setModal(null)} />}
    {modal === 'help' && <HelpModal close={() => setModal(null)} />}
    {modal === 'auth' && <AuthModal user={authUser} close={() => setModal(null)} onSynced={() => useAppStore.getState().hydrate()} />}
    {modal === 'backup' && <CollectionImportModal close={() => setModal(null)} />}
    {modal && !['variables', 'help', 'auth', 'backup'].includes(modal) && <ModalPanel modal={modal as 'curl' | 'save' | 'settings'} close={() => setModal(null)} />}
  </div>
}

export default App
