import { CircleHelp, X } from 'lucide-react'

const methods = [
  ['GET', 'Read a resource. Usually has no request body.'],
  ['POST', 'Create a resource or trigger an operation.'],
  ['PUT', 'Replace a resource with the supplied representation.'],
  ['PATCH', 'Apply a partial update to a resource.'],
  ['DELETE', 'Remove a resource.'],
  ['HEAD', 'Fetch headers without downloading the response body.'],
  ['OPTIONS', 'Discover communication options, often including CORS rules.']
]

export function HelpModal({ close }: { close: () => void }) {
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && close()}>
    <section className="modal help-modal" role="dialog" aria-modal="true" aria-label="Quick reference">
      <header><div><CircleHelp /><div><h2>Quick reference</h2><p>The useful parts, without a setup guide.</p></div></div><button className="icon-button" onClick={close}><X /></button></header>
      <div className="modal-body help-content">
        <section><h3>Fast paths</h3><div className="help-cards"><article><b>Paste cURL</b><p>Import a terminal command, review it, and send.</p></article><article><b>Use variables</b><p>Create an environment tag and type <code>{'{{baseUrl}}'}</code> anywhere in the request.</p></article><article><b>Save locally</b><p>Choose a collection and optional folder. No account is involved.</p></article><article><b>Export safely</b><p>Export a collection from its sidebar action. Secret environment values are separate.</p></article></div></section>
        <section><h3>HTTP methods</h3><div className="method-guide">{methods.map(([method, description]) => <div key={method}><b className={`method ${method.toLowerCase()}`}>{method}</b><span>{description}</span></div>)}</div></section>
        <section><h3>Basic scripts</h3><p>Scripts use a small, safe command set—not arbitrary JavaScript. This keeps browser storage and the page inaccessible.</p><pre>{`# Before sending
variable traceId = {{$randomUUID}}
header X-Trace-Id = {{traceId}}

# After receiving
assert status == 200
assert json.data.id exists
capture userId = json.data.id`}</pre><p>Captured values are saved as secrets in the active environment. Built-ins: <code>{'{{$timestamp}}'}</code>, <code>{'{{$isoTimestamp}}'}</code>, and <code>{'{{$randomUUID}}'}</code>.</p></section>
        <section><h3>Browser boundary</h3><p>If a request works in cURL but not here, the server probably does not allow browser CORS. Native gRPC and client certificates will use the optional local bridge.</p></section>
        <div className="modal-actions"><button className="primary" onClick={close}>Got it</button></div>
      </div>
    </section>
  </div>
}
