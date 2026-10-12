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
        <section><h3>Fast paths</h3><div className="help-cards"><article><b>Paste cURL</b><p>Import a terminal command, review it, and send.</p></article><article><b>Use variables</b><p>Create an environment tag and type <code>{'{{baseUrl}}'}</code> anywhere in the request.</p></article><article><b>Save locally</b><p>Choose a collection or leave the request unfiled. No account is involved.</p></article><article><b>Export safely</b><p>Export a collection from its sidebar action. Secret environment values are separate.</p></article></div></section>
        <section><h3>HTTP methods</h3><div className="method-guide">{methods.map(([method, description]) => <div key={method}><b className={`method ${method.toLowerCase()}`}>{method}</b><span>{description}</span></div>)}</div></section>
        <section><h3>Request controls</h3><p>Send becomes Cancel request while running. Cancelling or closing that tab stops its pending delay/network request, not other tabs. This cannot undo server work or variable changes already saved.</p><p>Timeout defaults to 30 seconds and covers the network plus body download, not script delays. Choose No timeout to disable it. The setting is saved per request and changes during a run apply next time.</p><p>Expand Request details for the final URL, browser-reported redirect and content type. Empty responses are explicitly labeled; HEAD/204/304 normally have no body. CORS can hide headers or the entire response, and browser errors cannot reliably distinguish CORS from VPN/network/TLS issues.</p></section>
        <section><h3>Manage saved requests</h3><p>Search in Collections by name, URL, method or collection. Use the ⋯ button to rename, move to a collection/Unfiled, duplicate the saved copy, or confirm deletion. These explicit saved-request actions participate in configured sync; searching and unsaved tab edits do not.</p><p>Rename/move preserve edited content. Duplicate uses the saved version and opens a new tab. Delete preserves open content as a new local draft and stops its running request; history remains. Remote deletion also preserves open edits locally. Save a recovered draft to create a separate request. Deleting does not purge backups/history/old encrypted revisions; concurrent offline changes still follow server-ordered latest-wins.</p></section>
        <section><h3>Folders and subfolders</h3><p>Workspace + creates a collection; a collection/folder + creates its child folder. In Save or Move, destination dropdowns also offer New collection and New folder/subfolder. Creation returns with the destination selected and your form intact; Save confirms placement. Created destinations persist even if you cancel the original form. Paths support 12 levels.</p><p>Drag a saved request onto a collection, folder or Unfiled on desktop. Hover expands destinations; sidebar edges scroll. Touch/keyboard use request ⋯ Move options. Folder ⋯ renames or moves its subtree within the collection. Confirmed folder deletion keeps contained requests at the collection root, without saving unfinished content edits.</p><p>Search includes paths. Folder export includes descendants, not siblings. Empty folders survive backups. Never-synced empty collections stay private; eligible metadata uses configured encrypted sync.</p></section>
        <section><h3>Storage and updates</h3><p>Storage failures keep edits visible and offer Retry draft storage. Keep the page open until resolved; copy important unfinished work separately. Responses stop at 10 MiB. Recording a request keeps only the newest 50 history entries in this browser. Older entries cannot be restored.</p><p>Update app asks before reload and waits for draft storage. Stored drafts survive; responses and running requests reset. Cached PWA reopening works offline, but network calls and sync still need connectivity.</p><p>Configured encrypted sync keeps local credential values private while preserving safe variable references. Manage request can open an uploaded version as a local copy. Account cleanup requires confirmation and retains at least 20 revisions per object and latest deletion markers.</p></section>
        <section><h3>Backup and restore</h3><p>In Collections, Export backup includes all saved collections and unfiled requests. Import backup previews an OpenRequest JSON file before restoring it locally. Keep both creates new IDs; Skip existing IDs restores missing items only. Neither option overwrites existing data or open drafts.</p><p>Backups can contain plaintext credentials and scripts. Import does not execute scripts or queue sync uploads; first-time sync enablement still includes all saved requests. Variables, drafts, history, responses and sync keys are not backed up. Version 1 and older optional-field defaults are supported; future versions and invalid files are rejected. File limit: 5 MiB.</p></section>
        <section><h3>Basic scripts</h3><p>Scripts use a small, safe command set—not arbitrary JavaScript. This keeps browser storage and the page inaccessible.</p><pre>{`# Before sending
variable traceId = {{$randomUUID}}
header X-Trace-Id = {{traceId}}
sleep 3000
log "Preparing request"
# Optional persistent environment changes
environment-set retryCount = 0
environment-unset staleToken
query page = 1
query-remove obsolete
# JSON POST/PUT/PATCH only: body data.name = "example"
# JSON POST/PUT/PATCH only: body-remove deprecated

# After receiving
assert status == 200
assert durationMs < 2000
assert header Content-Type contains "application/json"
assert json.success == true
assert body contains "created"
assert json.data.id exists
capture userId = json.data.id
log "Response checked"`}</pre><p><code>sleep 3000</code> waits three seconds before sending, without freezing the UI. Use whole milliseconds; combined sleeps are limited to 30 seconds per run. Sleep is only supported before a request. The response duration measures the network request, not this delay. Cancel request or closing the tab interrupts a pending delay or request.</p><p>After-response comparisons support <code>== != &lt; &lt;= &gt; &gt;=</code> and <code>contains</code>. Equality is typed: the number <code>3</code> differs from the string <code>"3"</code>. Ordering requires numbers. JSON paths use dots, including array indexes like <code>json.items.0.id</code>. Header names are case-insensitive; missing values fail checks. Open Script details to see each result; later checks and captures still run after a failure.</p><p><code>log "message"</code> works before and after a request. Variable references are redacted rather than expanded; known variable and authorization values are masked too. This is best-effort protection—do not put secrets directly in log messages. Comparison reports omit expected/actual values.</p><p>Captured values are saved as secrets in the environment selected when you pressed Send. Built-ins: <code>{'{{$timestamp}}'}</code>, <code>{'{{$isoTimestamp}}'}</code>, and <code>{'{{$randomUUID}}'}</code>.</p></section>
        <section><h3>Script field and variable updates</h3><p><code>environment-set name = value</code> and <code>environment-unset name</code> work in both phases. They change only the environment selected at Send time, persist locally as secret/enabled values, and never sync. Temporary <code>variable</code> values still disappear after the run. Pre-script changes are stored only after the script and request substitution succeed, before network dispatch; they remain stored if the network call fails. Valid post-script writes/captures still apply when assertions fail.</p><p><code>query name = value</code> replaces all same-name parameters; <code>query-remove name</code> removes enabled and disabled copies. <code>body data.name = "value"</code> and <code>body-remove data.name</code> work with named JSON-object paths and scalar values only, in a method that sends a body. Arrays, raw/form/multipart bodies, and prototype-related paths are not supported. Field edits affect the outgoing copy and history, not the editor or saved request.</p></section>
        <section><h3>Discover script commands</h3><p>Type a command prefix, or choose Insert command in either editor. Ctrl+Space opens suggestions; arrow keys and Enter select, Escape dismisses. Typing <code>{'{{'}</code> offers active-environment and built-in variable names, never their values. Suggestions only insert text: adapt the examples before sending. Persistent commands are labeled as local environment changes.</p></section>
        <section><h3>Browser boundary</h3><p>If a request works in cURL but not here, the server probably does not allow browser CORS. Native gRPC and client certificates will use the optional local bridge.</p></section>
        <div className="modal-actions"><button className="primary" onClick={close}>Got it</button></div>
      </div>
    </section>
  </div>
}
