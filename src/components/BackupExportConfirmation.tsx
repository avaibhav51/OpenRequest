import { Download, X } from 'lucide-react'

export function BackupExportConfirmation({ close, confirm }: { close: () => void; confirm: () => void }) {
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && close()}>
    <section className="modal" role="dialog" aria-modal="true" aria-label="Confirm backup export">
      <header><div><Download /><div><h2>Export backup?</h2></div></div><button className="icon-button" aria-label="Close export confirmation" onClick={close}><X /></button></header>
      <div className="modal-body">
        <p>Includes saved collections and requests only—not variables, unsaved drafts, history or sync keys. Request credentials may be included in plain text. Keep this file private.</p>
        <div className="modal-actions"><button autoFocus onClick={close}>Cancel</button><button className="primary" onClick={confirm}>Export backup</button></div>
      </div>
    </section>
  </div>
}
