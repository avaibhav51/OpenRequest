import { useEffect, useMemo, useState, type ClipboardEvent, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react'
import {
  Archive, Braces, ChevronDown, ChevronRight, CircleHelp, ClipboardPaste, Clock3, Code2, Copy, Download,
  Folder, History, KeyRound, LogIn, Menu, Moon, Plus, Save, Send, Settings, Sun, Tags, Trash2, UserRound, X
} from 'lucide-react'
import { AuthModal } from './components/AuthModal'
import { HelpModal } from './components/HelpModal'
import { VariablesModal } from './components/VariablesModal'
import { bodyTypeFromContentType, headersForBodyType } from './lib/body'
import { parseCurl, toCurl } from './lib/curl'
import { authClient, type AuthUser } from './lib/auth'
import { httpStatusTooltip } from './lib/httpStatus'
import { queryParamsFromUrl, urlWithQueryParams } from './lib/queryParams'
import { executeRequest, friendlyRequestError } from './lib/request'
import { runPostResponseScript, runPreRequestScript } from './lib/scripts'
import { referencedVariables, resolveRequest, variableMap } from './lib/variables'
import { emptyPair, newRequest, type Collection, type KeyValue, type RequestAuth } from './types'
import { useAppStore } from './store'

type EditorTab = 'params' | 'headers' | 'auth' | 'body' | 'scripts'
type ResponseTab = 'body' | 'raw' | 'headers'
type Modal = 'curl' | 'save' | 'settings' | 'variables' | 'help' | 'auth' | null

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

function Sidebar({ open, close }: { open: boolean; close: () => void }) {
  const { collections, requests, history, addCollection, removeCollection, selectRequest, clearHistory } = useAppStore()
  const [section, setSection] = useState<'collections' | 'history'>('collections')
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const add = async () => {
    const name = window.prompt('Collection name')
    if (name) await addCollection(name)
  }
  const exportCollection = (collection: Collection) => {
    download(`${collection.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.openrequest.json`, {
      format: 'openrequest.collection', version: 1, collection,
      requests: requests.filter((request) => request.collectionId === collection.id)
    })
  }

  return <aside className={`sidebar ${open ? 'open' : ''}`}>
    <div className="brand"><img src={appMarkUrl} alt="" /><span>OpenRequest</span><button className="icon-button mobile-only" onClick={close}><X size={18} /></button></div>
    <div className="side-tabs">
      <button className={section === 'collections' ? 'active' : ''} onClick={() => setSection('collections')}><Archive size={16} /> Collections</button>
      <button className={section === 'history' ? 'active' : ''} onClick={() => setSection('history')}><History size={16} /> History</button>
    </div>
    <div className="side-content">
      {section === 'collections' ? <>
        <div className="section-title"><span>Local workspace</span><button className="icon-button" aria-label="Add collection" onClick={add}><Plus size={17} /></button></div>
        {collections.length === 0 && <div className="empty-small"><Folder size={22} /><p>Your collections stay in this browser.</p><button onClick={add}>Create collection</button></div>}
        {collections.map((collection) => {
          const children = requests.filter((request) => request.collectionId === collection.id)
          const isOpen = expanded[collection.id] ?? true
          return <div className="tree" key={collection.id}>
            <div className="tree-label">
              <button className="tree-main" onClick={() => setExpanded({ ...expanded, [collection.id]: !isOpen })}>
                {isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}<Folder size={16} /><span>{collection.name}</span><small>{children.length}</small>
              </button>
              <div className="tree-actions"><button title="Export collection" onClick={() => exportCollection(collection)}><Download size={14} /></button><button title="Delete collection" onClick={() => window.confirm(`Delete ${collection.name}? Requests will remain unfiled.`) && removeCollection(collection.id)}><Trash2 size={14} /></button></div>
            </div>
            {isOpen && children.map((request) => <button className="request-item" key={request.id} onClick={() => { selectRequest(request); close() }}><b className={`method ${request.method.toLowerCase()}`}>{request.method}</b><span>{request.name}</span></button>)}
          </div>
        })}
        {requests.filter((request) => !request.collectionId).length > 0 && <div className="tree unfiled"><div className="section-title">Unfiled</div>{requests.filter((request) => !request.collectionId).map((request) => <button className="request-item" key={request.id} onClick={() => { selectRequest(request); close() }}><b className={`method ${request.method.toLowerCase()}`}>{request.method}</b><span>{request.name}</span></button>)}</div>}
      </> : <>
        <div className="section-title"><span>Recent requests</span>{history.length > 0 && <button className="text-button" onClick={() => window.confirm('Clear local history?') && clearHistory()}>Clear</button>}</div>
        {history.length === 0 && <div className="empty-small"><Clock3 size={22} /><p>Requests you send will appear here.</p></div>}
        {history.map((entry) => <button className="history-item" key={entry.id} onClick={() => { selectRequest(entry.request); close() }}><b className={`method ${entry.request.method.toLowerCase()}`}>{entry.request.method}</b><span><strong>{entry.request.name}</strong><small>{new Date(entry.createdAt).toLocaleString()}</small></span>{entry.response && <em className={entry.response.status < 400 ? 'ok' : 'bad'} title={httpStatusTooltip(entry.response.status)} aria-label={httpStatusTooltip(entry.response.status)}>{entry.response.status}</em>}</button>)}
      </>}
    </div>
    <div className="local-badge"><span className="status-dot" /> Local-only mode <small>No account</small></div>
    <a className="developer-link" href="https://avaibhav51.github.io" target="_blank" rel="noreferrer">Built by Vaibhav Agarwal <span>↗</span></a>
  </aside>
}

function ModalPanel({ modal, close }: { modal: 'curl' | 'save' | 'settings'; close: () => void }) {
  const { collections, draft, updateDraft, saveDraft } = useAppStore()
  const [curl, setCurl] = useState('')
  const [message, setMessage] = useState('')
  const [name, setName] = useState(draft.name)
  const [collectionId, setCollectionId] = useState(draft.collectionId ?? '')
  const [folderPath, setFolderPath] = useState(draft.folderPath?.join('/') ?? '')

  const importCurl = () => {
    try { updateDraft(parseCurl(curl)); close() } catch (error) { setMessage(error instanceof Error ? error.message : String(error)) }
  }
  const save = async () => {
    updateDraft({ name, collectionId: collectionId || undefined, folderPath: folderPath.split('/').map((part) => part.trim()).filter(Boolean) })
    await new Promise((resolve) => setTimeout(resolve, 0))
    await saveDraft(); close()
  }
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && close()}>
    <section className="modal" role="dialog" aria-modal="true" aria-label={modal === 'curl' ? 'Import cURL' : modal === 'save' ? 'Save request' : 'Workspace settings'}>
      <header><div>{modal === 'curl' ? <ClipboardPaste /> : modal === 'save' ? <Save /> : <Settings />}<div><h2>{modal === 'curl' ? 'Import cURL' : modal === 'save' ? 'Save request' : 'Workspace settings'}</h2><p>{modal === 'settings' ? 'This workspace is private by default.' : ''}</p></div></div><button className="icon-button" onClick={close}><X /></button></header>
      {modal === 'curl' && <div className="modal-body"><label>cURL command<textarea autoFocus rows={9} value={curl} onChange={(event) => setCurl(event.target.value)} placeholder="curl 'https://api.example.com/users' \
  -H 'Authorization: Bearer …'" /></label>{message && <p className="error-note">{message}</p>}<div className="modal-actions"><button onClick={close}>Cancel</button><button className="primary" onClick={importCurl}>Import request</button></div></div>}
      {modal === 'save' && <div className="modal-body"><label>Request name<input autoFocus value={name} onChange={(event) => setName(event.target.value)} /></label><label>Collection<select value={collectionId} onChange={(event) => setCollectionId(event.target.value)}><option value="">Unfiled</option>{collections.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Folder path <small>(optional, use / to nest)</small><input placeholder="Auth / Sessions" value={folderPath} onChange={(event) => setFolderPath(event.target.value)} /></label><div className="modal-actions"><button onClick={close}>Cancel</button><button className="primary" onClick={save}>Save locally</button></div></div>}
      {modal === 'settings' && <div className="modal-body settings-copy"><div className="privacy-card"><span className="status-dot" /><div><strong>Local-only mode is active</strong><p>Collections, request bodies, environment values, and history are stored in this browser's IndexedDB. Nothing is uploaded by this app.</p></div></div><h3>Optional sync</h3><p>Account sync is intentionally not part of this first slice. The architecture keeps it optional: local use will never require a login.</p><h3>Browser boundary</h3><p>Web browsers enforce CORS and cannot make arbitrary native gRPC or raw TCP requests. A small, opt-in local bridge is planned for those cases.</p><div className="modal-actions"><button className="primary" onClick={close}>Done</button></div></div>}
    </section>
  </div>
}

function App() {
  const store = useAppStore()
  const { draft, response, error, busy } = store
  const [editorTab, setEditorTab] = useState<EditorTab>('params')
  const [responseTab, setResponseTab] = useState<ResponseTab>('body')
  const [modal, setModal] = useState<Modal>(null)
  const [sidebar, setSidebar] = useState(false)
  const [dark, setDark] = useState(() => localStorage.getItem('theme') !== 'light')
  const [copied, setCopied] = useState(false)
  const [responseCopied, setResponseCopied] = useState(false)
  const [pasteNotice, setPasteNotice] = useState('')
  const [authUser, setAuthUser] = useState<AuthUser | null>(null)
  const [splitPercent, setSplitPercent] = useState(42)
  const [stackedSplit, setStackedSplit] = useState(() => window.matchMedia('(max-width: 1100px)').matches)

  useEffect(() => { store.hydrate() }, [])
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
    store.setBusy(true); store.setResponse(undefined, undefined)
    try {
      const prepared = runPreRequestScript(draft.preRequestScript ?? '', draft, activeVariables)
      const result = await executeRequest(resolveRequest(prepared.request, prepared.variables))
      result.scriptLogs = prepared.logs
      try {
        const post = runPostResponseScript(draft.postResponseScript ?? '', result)
        result.scriptLogs.push(...post.logs)
        for (const [key, value] of Object.entries(post.captures)) await store.captureVariable(key, value)
      } catch (scriptError) {
        result.scriptError = scriptError instanceof Error ? scriptError.message : String(scriptError)
      }
      store.setResponse(result); await store.recordRun(result)
    } catch (requestError) {
      store.setResponse(undefined, friendlyRequestError(requestError)); await store.recordRun()
    } finally { store.setBusy(false) }
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
  const clearResponse = () => store.setResponse(undefined, undefined)
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

  return <div className="app-shell">
    <Sidebar open={sidebar} close={() => setSidebar(false)} />
    {sidebar && <button className="mobile-scrim" aria-label="Close menu" onClick={() => setSidebar(false)} />}
    <main>
      <header className="topbar"><button className="icon-button mobile-only" aria-label="Open menu" onClick={() => setSidebar(true)}><Menu /></button><div className="mode-label"><span className="status-dot" /> Private workspace</div><div className="top-actions"><button className="environment-switch" onClick={() => setModal('variables')} title="Manage isolated environments"><i style={{ background: activeEnvironment?.color }} /><span>{activeEnvironment?.name ?? 'Variables'}</span><Tags size={14} /></button><button onClick={() => setModal('curl')}><ClipboardPaste size={16} /> <span>Import cURL</span></button><button onClick={copyCurl}><Copy size={16} /> <span>{copied ? 'Copied' : 'Copy cURL'}</span></button><button className="account-button" onClick={() => setModal('auth')} title={authUser ? 'Account' : 'Optional sign in'}>{authUser ? <UserRound size={16} /> : <LogIn size={16} />}<span>{authUser?.email?.split('@')[0] ?? 'Sign in'}</span></button><button className="icon-button" onClick={() => setModal('help')} title="Quick reference"><CircleHelp size={18} /></button><button className="icon-button" onClick={() => setDark(!dark)} title="Toggle theme">{dark ? <Sun size={18} /> : <Moon size={18} />}</button><button className="icon-button" onClick={() => setModal('settings')} title="Settings"><Settings size={18} /></button></div></header>
      <section className="workspace">
        <div className="request-title"><input value={draft.name} aria-label="Request name" onChange={(event) => store.updateDraft({ name: event.target.value })} /><div><button onClick={() => store.selectRequest(newRequest())}><Plus size={16} /> New</button><button onClick={() => setModal('save')}><Save size={16} /> Save</button></div></div>
        <div className="request-bar"><div className="method-control"><select aria-label="HTTP method" className={`method-select ${draft.method.toLowerCase()}`} value={draft.method} onChange={(event) => store.updateDraft({ method: event.target.value as typeof draft.method })}>{['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].map((method) => <option key={method} value={method}>{method}</option>)}</select><ChevronDown size={15} /></div><div className="url-input-wrap"><input aria-label="Request URL" placeholder="Paste a URL or cURL command" value={draft.url} onPaste={pasteIntoUrl} onChange={(event) => updateUrl(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && draft.url && send()} /><UrlDetails value={draft.url} /></div><button className="send-button" disabled={busy || !draft.url} onClick={send}>{busy ? <span className="spinner" /> : <Send size={17} />}{busy ? 'Sending' : 'Send'}</button></div>
        {pasteNotice && <div className="paste-notice"><ClipboardPaste size={13} />{pasteNotice}</div>}
        {(variableReferences.length > 0 || missingVariables.length > 0) && <div className={`variable-usage ${missingVariables.length ? 'has-missing' : ''}`}><Braces size={14} /><span>{variableReferences.length} variable{variableReferences.length === 1 ? '' : 's'} from <b>{activeEnvironment?.name}</b></span>{missingVariables.length > 0 && <button onClick={() => setModal('variables')}>Add missing: {missingVariables.join(', ')}</button>}</div>}
        <div className="split-view" style={{ '--request-pane': `${splitPercent}%` } as CSSProperties}>
          <section className="request-editor panel">
            <nav className="tabbar">{(['params', 'headers', 'auth', 'body', 'scripts'] as EditorTab[]).map((tab) => <button key={tab} className={editorTab === tab ? 'active' : ''} onClick={(event) => { setEditorTab(tab); event.currentTarget.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' }) }}>{tab}<small>{tab === 'params' ? draft.params.filter((p) => p.key).length + generatedParams.length : tab === 'headers' ? draft.headers.filter((p) => p.key).length + generatedHeaders.length : tab === 'auth' ? (draft.auth && draft.auth.type !== 'none' ? '•' : '') : tab === 'body' ? (draft.bodyType !== 'none' ? '•' : '') : ((draft.preRequestScript || draft.postResponseScript) ? '•' : '')}</small></button>)}</nav>
            <div className="editor-content">
              {editorTab === 'params' && <PairEditor value={draft.params} onChange={updateParams} generated={generatedParams} />}
              {editorTab === 'headers' && <PairEditor value={draft.headers} onChange={updateHeaders} generated={generatedHeaders} />}
              {editorTab === 'auth' && <><AuthorizationEditor value={draft.auth} onChange={(auth) => store.updateDraft({ auth })} />{authConflict && <div className="auth-conflict">{authConflict}</div>}</>}
              {editorTab === 'body' && <div className="body-editor">{!bodyAllowed && <div className="body-method-warning">{draft.method} requests do not send a body. Your drafted body is preserved for another method.</div>}<div className="segmented">{(['none', 'json', 'text', 'form', 'multipart'] as const).map((type) => <button key={type} disabled={!bodyAllowed} className={draft.bodyType === type ? 'active' : ''} onClick={() => updateBodyType(type)}>{type === 'text' ? 'Raw text' : type === 'form' ? 'Form URL Encoded' : type === 'multipart' ? 'Multipart' : type.toUpperCase()}</button>)}</div>{draft.bodyType === 'none' ? <div className="empty-editor">This request has no body.</div> : draft.bodyType === 'form' || draft.bodyType === 'multipart' ? <><PairEditor disabled={!bodyAllowed} value={draft.bodyFields ?? [emptyPair()]} onChange={(bodyFields) => store.updateDraft({ bodyFields })} />{draft.bodyType === 'multipart' && <p className="multipart-note">Text fields are supported now. Imported <code>@file</code> paths stay disabled because a browser requires explicit file selection. Portable file selection is the next part of this body mode.</p>}</> : <textarea disabled={!bodyAllowed} spellCheck={false} value={draft.body} onChange={(event) => store.updateDraft({ body: event.target.value })} placeholder={draft.bodyType === 'json' ? '{\n  "hello": "world"\n}' : 'Request body'} />}</div>}
              {editorTab === 'scripts' && <div className="script-editor"><div className="script-intro"><Braces size={16} /><span>Safe basic commands only. Open <button onClick={() => setModal('help')}>Quick reference</button> for examples.</span></div><label><span>Before request</span><textarea spellCheck={false} value={draft.preRequestScript ?? ''} onChange={(event) => store.updateDraft({ preRequestScript: event.target.value })} placeholder={'variable traceId = {{$randomUUID}}\nheader X-Trace-Id = {{traceId}}'} /></label><label><span>After response</span><textarea spellCheck={false} value={draft.postResponseScript ?? ''} onChange={(event) => store.updateDraft({ postResponseScript: event.target.value })} placeholder={'assert status == 200\ncapture token = json.data.token'} /></label></div>}
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
          <section className="response-panel panel"><div className="response-head"><nav className="tabbar"><button className={responseTab === 'body' ? 'active' : ''} onClick={() => setResponseTab('body')}>Response</button><button className={responseTab === 'raw' ? 'active' : ''} onClick={() => setResponseTab('raw')}>Raw</button><button className={responseTab === 'headers' ? 'active' : ''} onClick={() => setResponseTab('headers')}>Headers {response && <small>{response.headers.length}</small>}</button></nav>{response && <div className="response-meta"><b className={response.status < 400 ? 'ok' : 'bad'} title={httpStatusTooltip(response.status, response.statusText)} aria-label={httpStatusTooltip(response.status, response.statusText)}>{response.status} {response.statusText}</b><span>{response.durationMs} ms</span><span>{response.sizeBytes < 1024 ? `${response.sizeBytes} B` : `${(response.sizeBytes / 1024).toFixed(1)} KB`}</span><div className="response-actions"><button onClick={copyResponse} title={responseCopied ? 'Copied' : `Copy ${responseCopyLabel}`} aria-label={responseCopied ? 'Response copied' : `Copy ${responseCopyLabel}`}><Copy size={13} /></button><button onClick={clearResponse} title="Clear response" aria-label="Clear response"><X size={14} /></button></div></div>}</div>{response?.scriptError && <div className="script-banner bad"><b>Script failed</b><span>{response.scriptError}</span></div>}{response?.scriptLogs && response.scriptLogs.length > 0 && !response.scriptError && <div className="script-banner ok"><b>Scripts passed</b><span>{response.scriptLogs.join(' · ')}</span></div>}<div className="response-content">{error ? <div className="error-state"><div>!</div><h3>Request could not be sent</h3><p>{error}</p></div> : !response ? <div className="response-empty"><Code2 size={30} /><h3>Ready when you are</h3><p>Enter a URL and send a request. Response data stays on this device.</p></div> : responseTab === 'headers' ? <div className="header-list">{response.headers.map((header) => <div key={header.id}><b>{header.key}</b><span>{header.value}</span></div>)}</div> : responseTab === 'raw' ? <pre>{response.body}</pre> : responseIsImage ? <div className="image-preview"><img src={`data:${response.contentType};base64,${response.body}`} alt="API response" /><span>{response.contentType}</span></div> : response.bodyEncoding === 'base64' ? <div className="binary-preview"><Code2 size={28} /><strong>Binary response</strong><span>{response.contentType || 'Unknown content type'} · {response.sizeBytes} bytes</span><p>Use Raw or Copy to access the base64 representation.</p></div> : <pre>{prettyBody}</pre>}</div></section>
        </div>
      </section>
    </main>
    {modal === 'variables' && <VariablesModal close={() => setModal(null)} />}
    {modal === 'help' && <HelpModal close={() => setModal(null)} />}
    {modal === 'auth' && <AuthModal user={authUser} close={() => setModal(null)} />}
    {modal && !['variables', 'help', 'auth'].includes(modal) && <ModalPanel modal={modal as 'curl' | 'save' | 'settings'} close={() => setModal(null)} />}
  </div>
}

export default App
