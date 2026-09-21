import { useState } from 'react'
import { Eye, EyeOff, Plus, Tags, Trash2, X } from 'lucide-react'
import { useAppStore } from '../store'
import { uid, type WorkspaceVariable } from '../types'

export function VariablesModal({ close }: { close: () => void }) {
  const store = useAppStore()
  const [environmentName, setEnvironmentName] = useState('')
  const [revealed, setRevealed] = useState<Record<string, boolean>>({})
  const active = store.environments.find((item) => item.id === store.activeEnvironmentId)
  const variables = store.variables.filter((item) => item.environmentId === store.activeEnvironmentId).sort((a, b) => a.key.localeCompare(b.key))

  const createEnvironment = async () => {
    if (!environmentName.trim()) return
    await store.addEnvironment(environmentName)
    setEnvironmentName('')
  }
  const addVariable = () => {
    const variable: WorkspaceVariable = { id: uid(), environmentId: store.activeEnvironmentId, key: '', value: '', enabled: true, secret: false, updatedAt: Date.now() }
    store.saveVariable(variable)
  }
  const update = (variable: WorkspaceVariable, patch: Partial<WorkspaceVariable>) => store.saveVariable({ ...variable, ...patch, updatedAt: Date.now() })

  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && close()}>
    <section className="modal variable-modal" role="dialog" aria-modal="true" aria-label="Environment variables">
      <header><div><Tags /><div><h2>Variables</h2><p>Each tag is an isolated local environment.</p></div></div><button className="icon-button" onClick={close}><X /></button></header>
      <div className="modal-body">
        <div className="environment-tags" aria-label="Environments">
          {store.environments.map((environment) => <button key={environment.id} className={environment.id === store.activeEnvironmentId ? 'active' : ''} onClick={() => store.setActiveEnvironment(environment.id)}><i style={{ background: environment.color }} />{environment.name}</button>)}
        </div>
        <div className="new-environment"><input aria-label="New environment name" placeholder="New environment, e.g. Staging" value={environmentName} onChange={(event) => setEnvironmentName(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && createEnvironment()} /><button onClick={createEnvironment} disabled={!environmentName.trim()}><Plus size={15} /> Add tag</button></div>
        <div className="variable-heading"><div><strong>{active?.name ?? 'Environment'} variables</strong><span>Use as <code>{'{{variableName}}'}</code> in URLs, headers, params, and bodies.</span></div>{store.environments.length > 1 && <button className="danger-quiet" onClick={() => window.confirm(`Delete ${active?.name} and all of its variables?`) && store.removeEnvironment(store.activeEnvironmentId)}><Trash2 size={14} /> Delete tag</button>}</div>
        <div className="variable-grid variable-grid-head"><span>Use</span><span>Name</span><span>Value</span><span>Secret</span><span /></div>
        {variables.map((variable) => <div className="variable-grid" key={variable.id}>
          <input aria-label={`Enable ${variable.key || 'variable'}`} type="checkbox" checked={variable.enabled} onChange={(event) => update(variable, { enabled: event.target.checked })} />
          <input aria-label="Variable name" placeholder="baseUrl" value={variable.key} onChange={(event) => update(variable, { key: event.target.value })} />
          <div className="secret-input"><input aria-label={`Value for ${variable.key || 'variable'}`} type={variable.secret && !revealed[variable.id] ? 'password' : 'text'} placeholder="https://api.example.com" value={variable.value} onChange={(event) => update(variable, { value: event.target.value })} />{variable.secret && <button aria-label={revealed[variable.id] ? 'Hide value' : 'Reveal value'} onClick={() => setRevealed({ ...revealed, [variable.id]: !revealed[variable.id] })}>{revealed[variable.id] ? <EyeOff size={14} /> : <Eye size={14} />}</button>}</div>
          <input aria-label={`Mark ${variable.key || 'variable'} secret`} type="checkbox" checked={variable.secret} onChange={(event) => update(variable, { secret: event.target.checked })} />
          <button className="icon-button subtle" aria-label="Delete variable" onClick={() => store.removeVariable(variable.id)}><Trash2 size={14} /></button>
        </div>)}
        {variables.length === 0 && <div className="variable-empty">No variables in this environment yet.</div>}
        <div className="modal-actions variable-actions"><button onClick={addVariable}><Plus size={14} /> Add variable</button><button className="primary" onClick={close}>Done</button></div>
      </div>
    </section>
  </div>
}
