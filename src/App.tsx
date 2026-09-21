import { useEffect, useMemo, useState, type ClipboardEvent } from 'react'
import {
  Archive, Braces, ChevronDown, ChevronRight, CircleHelp, ClipboardPaste, Clock3, Code2, Copy, Download,
  Folder, History, LogIn, Menu, Moon, Plus, Save, Send, Settings, Sun, Tags, Trash2, UserRound, X
} from 'lucide-react'
import { AuthModal } from './components/AuthModal'
import { HelpModal } from './components/HelpModal'
import { VariablesModal } from './components/VariablesModal'
import { parseCurl, toCurl } from './lib/curl'
import { authClient, type AuthUser } from './lib/auth'
import { executeRequest, friendlyRequestError } from './lib/request'
import { runPostResponseScript, runPreRequestScript } from './lib/scripts'
import { referencedVariables, resolveRequest, variableMap } from './lib/variables'
import { emptyPair, newRequest, type Collection, type KeyValue } from './types'
import { useAppStore } from './store'

type EditorTab = 'params' | 'headers' | 'body' | 'scripts'
type ResponseTab = 'body' | 'headers'
type Modal = 'curl' | 'save' | 'settings' | 'variables' | 'help' | 'auth' | null

const download = (filename: string, value: unknown) => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

function PairEditor({ value, onChange }: { value: KeyValue[]; onChange: (value: KeyValue[]) => void }) {
  const update = (id: string, patch: Partial<KeyValue>) => {
    const next = value.map((pair) => pair.id === id ? { ...pair, ...patch } : pair)
    const last = next.at(-1)
    if (last?.key || last?.value) next.push(emptyPair())
    onChange(next)
  }
  return <div className="pair-list">
    <div className="pair-head"><span>Use</span><span>Key</span><span>Value</span><span /></div>
    {value.map((pair, index) => <div className="pair-row" key={pair.id}>
      <input aria-label="Enable field" type="checkbox" checked={pair.enabled} onChange={(event) => update(pair.id, { enabled: event.target.checked })} />
      <input aria-label="Key" placeholder="Key" value={pair.key} onChange={(event) => update(pair.id, { key: event.target.value })} />
      <input aria-label="Value" placeholder="Value" value={pair.value} onChange={(event) => update(pair.id, { value: event.target.value })} />
      <button className="icon-button subtle" aria-label="Remove field" disabled={value.length === 1} onClick={() => onChange(value.filter((item) => item.id !== pair.id))}><X size={15} /></button>
      {index === value.length - 1 && <span className="sr-only">Blank row</span>}
    </div>)}
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
    <div className="brand"><img src="/mark.svg" alt="" /><span>OpenRequest</span><button className="icon-button mobile-only" onClick={close}><X size={18} /></button></div>
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
        {history.map((entry) => <button className="history-item" key={entry.id} onClick={() => { selectRequest(entry.request); close() }}><b className={`method ${entry.request.method.toLowerCase()}`}>{entry.request.method}</b><span><strong>{entry.request.name}</strong><small>{new Date(entry.createdAt).toLocaleString()}</small></span>{entry.response && <em className={entry.response.status < 400 ? 'ok' : 'bad'}>{entry.response.status}</em>}</button>)}
      </>}
    </div>
    <div className="local-badge"><span className="status-dot" /> Local-only mode <small>No account</small></div>
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
    <section className="modal" role="dialog" aria-modal="true">
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
  const [pasteNotice, setPasteNotice] = useState('')
  const [authUser, setAuthUser] = useState<AuthUser | null>(null)

  useEffect(() => { store.hydrate() }, [])
  useEffect(() => { document.documentElement.dataset.theme = dark ? 'dark' : 'light'; localStorage.setItem('theme', dark ? 'dark' : 'light') }, [dark])
  useEffect(() => {
    if (!authClient) return
    authClient.auth.getSession().then(({ data }) => setAuthUser(data.session?.user ?? null))
    const { data } = authClient.auth.onAuthStateChange((_event, session) => setAuthUser(session?.user ?? null))
    return () => data.subscription.unsubscribe()
  }, [])

  const prettyBody = useMemo(() => {
    if (!response) return ''
    if (!response.contentType.includes('json')) return response.body
    try { return JSON.stringify(JSON.parse(response.body), null, 2) } catch { return response.body }
  }, [response])
  const activeEnvironment = store.environments.find((item) => item.id === store.activeEnvironmentId)
  const activeVariables = useMemo(() => variableMap(store.variables, store.activeEnvironmentId), [store.variables, store.activeEnvironmentId])
  const variableReferences = useMemo(() => referencedVariables(draft), [draft])
  const missingVariables = variableReferences.filter((key) => !key.startsWith('$') && !Object.hasOwn(activeVariables, key))

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

  return <div className="app-shell">
    <Sidebar open={sidebar} close={() => setSidebar(false)} />
    {sidebar && <button className="mobile-scrim" aria-label="Close menu" onClick={() => setSidebar(false)} />}
    <main>
      <header className="topbar"><button className="icon-button mobile-only" onClick={() => setSidebar(true)}><Menu /></button><div className="mode-label"><span className="status-dot" /> Private workspace</div><div className="top-actions"><button className="environment-switch" onClick={() => setModal('variables')} title="Manage isolated environments"><i style={{ background: activeEnvironment?.color }} /><span>{activeEnvironment?.name ?? 'Variables'}</span><Tags size={14} /></button><button onClick={() => setModal('curl')}><ClipboardPaste size={16} /> <span>Import cURL</span></button><button onClick={copyCurl}><Copy size={16} /> <span>{copied ? 'Copied' : 'Copy cURL'}</span></button><button className="account-button" onClick={() => setModal('auth')} title={authUser ? 'Account' : 'Optional sign in'}>{authUser ? <UserRound size={16} /> : <LogIn size={16} />}<span>{authUser?.email?.split('@')[0] ?? 'Sign in'}</span></button><button className="icon-button" onClick={() => setModal('help')} title="Quick reference"><CircleHelp size={18} /></button><button className="icon-button" onClick={() => setDark(!dark)} title="Toggle theme">{dark ? <Sun size={18} /> : <Moon size={18} />}</button><button className="icon-button" onClick={() => setModal('settings')} title="Settings"><Settings size={18} /></button></div></header>
      <section className="workspace">
        <div className="request-title"><input value={draft.name} aria-label="Request name" onChange={(event) => store.updateDraft({ name: event.target.value })} /><div><button onClick={() => store.selectRequest(newRequest())}><Plus size={16} /> New</button><button onClick={() => setModal('save')}><Save size={16} /> Save</button></div></div>
        <div className="request-bar"><div className="method-control"><select aria-label="HTTP method" className={`method-select ${draft.method.toLowerCase()}`} value={draft.method} onChange={(event) => store.updateDraft({ method: event.target.value as typeof draft.method })}>{['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].map((method) => <option key={method}>{method}</option>)}</select><ChevronDown size={15} /></div><input aria-label="Request URL" placeholder="Paste a URL or cURL command" value={draft.url} onPaste={pasteIntoUrl} onChange={(event) => store.updateDraft({ url: event.target.value })} onKeyDown={(event) => event.key === 'Enter' && draft.url && send()} /><button className="send-button" disabled={busy || !draft.url} onClick={send}>{busy ? <span className="spinner" /> : <Send size={17} />}{busy ? 'Sending' : 'Send'}</button></div>
        {pasteNotice && <div className="paste-notice"><ClipboardPaste size={13} />{pasteNotice}</div>}
        {(variableReferences.length > 0 || missingVariables.length > 0) && <div className={`variable-usage ${missingVariables.length ? 'has-missing' : ''}`}><Braces size={14} /><span>{variableReferences.length} variable{variableReferences.length === 1 ? '' : 's'} from <b>{activeEnvironment?.name}</b></span>{missingVariables.length > 0 && <button onClick={() => setModal('variables')}>Add missing: {missingVariables.join(', ')}</button>}</div>}
        <div className="split-view">
          <section className="request-editor panel">
            <nav className="tabbar">{(['params', 'headers', 'body', 'scripts'] as EditorTab[]).map((tab) => <button key={tab} className={editorTab === tab ? 'active' : ''} onClick={() => setEditorTab(tab)}>{tab}<small>{tab === 'params' ? draft.params.filter((p) => p.key).length : tab === 'headers' ? draft.headers.filter((p) => p.key).length : tab === 'body' ? (draft.bodyType !== 'none' ? '•' : '') : ((draft.preRequestScript || draft.postResponseScript) ? '•' : '')}</small></button>)}</nav>
            <div className="editor-content">
              {editorTab === 'params' && <PairEditor value={draft.params} onChange={(params) => store.updateDraft({ params })} />}
              {editorTab === 'headers' && <PairEditor value={draft.headers} onChange={(headers) => store.updateDraft({ headers })} />}
              {editorTab === 'body' && <div className="body-editor"><div className="segmented">{(['none', 'json', 'text'] as const).map((type) => <button key={type} className={draft.bodyType === type ? 'active' : ''} onClick={() => store.updateDraft({ bodyType: type })}>{type === 'text' ? 'Raw text' : type.toUpperCase()}</button>)}</div>{draft.bodyType === 'none' ? <div className="empty-editor">This request has no body.</div> : <textarea spellCheck={false} value={draft.body} onChange={(event) => store.updateDraft({ body: event.target.value })} placeholder={draft.bodyType === 'json' ? '{\n  "hello": "world"\n}' : 'Request body'} />}</div>}
              {editorTab === 'scripts' && <div className="script-editor"><div className="script-intro"><Braces size={16} /><span>Safe basic commands only. Open <button onClick={() => setModal('help')}>Quick reference</button> for examples.</span></div><label><span>Before request</span><textarea spellCheck={false} value={draft.preRequestScript ?? ''} onChange={(event) => store.updateDraft({ preRequestScript: event.target.value })} placeholder={'variable traceId = {{$randomUUID}}\nheader X-Trace-Id = {{traceId}}'} /></label><label><span>After response</span><textarea spellCheck={false} value={draft.postResponseScript ?? ''} onChange={(event) => store.updateDraft({ postResponseScript: event.target.value })} placeholder={'assert status == 200\ncapture token = json.data.token'} /></label></div>}
            </div>
          </section>
          <section className="response-panel panel"><div className="response-head"><nav className="tabbar"><button className={responseTab === 'body' ? 'active' : ''} onClick={() => setResponseTab('body')}>Response</button><button className={responseTab === 'headers' ? 'active' : ''} onClick={() => setResponseTab('headers')}>Headers {response && <small>{response.headers.length}</small>}</button></nav>{response && <div className="response-meta"><b className={response.status < 400 ? 'ok' : 'bad'}>{response.status} {response.statusText}</b><span>{response.durationMs} ms</span><span>{response.sizeBytes < 1024 ? `${response.sizeBytes} B` : `${(response.sizeBytes / 1024).toFixed(1)} KB`}</span></div>}</div>{response?.scriptError && <div className="script-banner bad"><b>Script failed</b><span>{response.scriptError}</span></div>}{response?.scriptLogs && response.scriptLogs.length > 0 && !response.scriptError && <div className="script-banner ok"><b>Scripts passed</b><span>{response.scriptLogs.join(' · ')}</span></div>}<div className="response-content">{error ? <div className="error-state"><div>!</div><h3>Request could not be sent</h3><p>{error}</p></div> : !response ? <div className="response-empty"><Code2 size={30} /><h3>Ready when you are</h3><p>Enter a URL and send a request. Response data stays on this device.</p></div> : responseTab === 'body' ? <pre>{prettyBody}</pre> : <div className="header-list">{response.headers.map((header) => <div key={header.id}><b>{header.key}</b><span>{header.value}</span></div>)}</div>}</div></section>
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
