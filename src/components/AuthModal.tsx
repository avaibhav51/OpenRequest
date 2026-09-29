import { useEffect, useState } from 'react'
import { Github, KeyRound, LogOut, Mail, MessageSquareText, RefreshCw, ShieldCheck, X } from 'lucide-react'
import { authClient, authConfigured, type AuthUser } from '../lib/auth'
import { emailOtpOptions, safeAuthError, type EmailAccountIntent } from '../lib/accountAuth'
import { enableEncryptedSync, getSyncStatus, syncNow } from '../lib/syncService'
import { InfoTip } from './InfoTip'

const authRedirectUrl = new URL(import.meta.env.BASE_URL, window.location.origin).href

export function AuthModal({ user, close, onSynced }: { user: AuthUser | null; close: () => void; onSynced?: () => Promise<void> | void }) {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [passphrase, setPassphrase] = useState('')
  const [syncEnabled, setSyncEnabled] = useState(false)
  const [pending, setPending] = useState(0)

  const refreshSyncStatus = async () => {
    const status = await getSyncStatus(user?.id)
    setSyncEnabled(status.enabled)
    setPending(status.pending)
  }
  useEffect(() => { void refreshSyncStatus() }, [user?.id])

  const run = async (name: string, action: () => Promise<{ error: { message: string } | null }>, success: string) => {
    setBusy(name); setError(''); setMessage('')
    try {
      const result = await action()
      if (result.error) { setError(safeAuthError(result.error.message)); return false }
      setMessage(success)
      return true
    } catch (requestError) { setError(safeAuthError(requestError instanceof Error ? requestError.message : String(requestError))); return false }
    finally { setBusy('') }
  }
  const oauth = async (provider: 'google' | 'github') => {
    if (!authClient) return
    setBusy(provider); setError('')
    const { error } = await authClient.auth.signInWithOAuth({ provider, options: { redirectTo: authRedirectUrl } })
    if (error) { setError(safeAuthError(error.message)); setBusy('') }
  }
  const emailLink = (intent: EmailAccountIntent) => authClient && run(
    intent,
    () => authClient!.auth.signInWithOtp({ email, options: emailOtpOptions(intent, authRedirectUrl) }),
    'If this address is eligible, check your email for the secure link.',
  )
  const synchronize = async (unlock: boolean) => {
    if (!user) return
    setBusy('sync'); setError(''); setMessage('')
    try {
      const result = unlock ? await enableEncryptedSync(user, passphrase) : await syncNow(user.id)
      setPassphrase(''); setSyncEnabled(true); setPending(result.pending)
      setMessage(`Synchronized: ${result.pushed} uploaded, ${result.pulled} applied.`)
      await onSynced?.()
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : String(syncError))
    } finally { setBusy('') }
  }
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && close()}>
    <section className="modal auth-modal" role="dialog" aria-modal="true" aria-label="Account and encrypted sync">
      <header><div><KeyRound /><div><h2>{user ? 'Account and encrypted sync' : 'Optional account access'}</h2><p>{user ? 'Synchronize saved requests across trusted browsers.' : 'Local use still requires no account.'}</p></div></div><button className="icon-button" aria-label="Close account" onClick={close}><X /></button></header>
      <div className="modal-body auth-content">
        {user ? <>
          <div className="signed-in-card"><ShieldCheck /><div><strong>Signed in</strong><span>{user.email ?? user.phone ?? user.id}</span></div></div>
          {syncEnabled ? <div className="sync-card"><strong className="with-info">End-to-end encrypted sync active <InfoTip label="Encrypted sync details" text="Saved requests are encrypted before upload. Supabase stores ciphertext and cannot decrypt it with publishable, database, or service-role credentials alone. Unsaved edits, responses, history, variables, empty local collections, and known active authorization values remain on this browser." /></strong><p>Saved requests synchronize automatically across browsers you unlock.</p><span>{pending} pending local change{pending === 1 ? '' : 's'}</span><button className="auth-secondary" onClick={() => synchronize(false)} disabled={Boolean(busy)}><RefreshCw size={14} /> Sync now</button></div> : <div className="sync-card"><strong>Enable or unlock encrypted sync</strong><p>Choose a private sync passphrase on the first browser. Enter the same passphrase once after signing in on each new browser; it is never sent to Supabase.</p><label>Sync passphrase<input type="password" autoComplete="new-password" value={passphrase} onChange={(event) => setPassphrase(event.target.value)} placeholder="At least 12 characters" /></label><button className="auth-primary" onClick={() => synchronize(true)} disabled={Boolean(busy) || passphrase.length < 12}>Enable / unlock sync</button><small>If all trusted browsers and this passphrase are lost, the encrypted cloud workspace cannot be recovered.</small></div>}
          {message && <p className="auth-message ok">{message}</p>}{error && <p className="auth-message bad">{error}</p>}
          <div className="modal-actions"><button onClick={() => run('logout', () => authClient!.auth.signOut(), 'Signed out.')} disabled={Boolean(busy)}><LogOut size={14} /> Sign out</button><button className="primary" onClick={close}>Done</button></div>
        </> : !authConfigured ? <>
          <div className="config-needed"><ShieldCheck /><div><strong>Login is not configured in this local build</strong><p>Add the two public Supabase settings described below, then restart the development server. The app stays fully usable locally meanwhile.</p></div></div>
          <div className="config-code"><code>VITE_SUPABASE_URL=https://…</code><code>VITE_SUPABASE_ANON_KEY=…</code></div>
          <p className="auth-note">Use Supabase's free hosted tier or a self-hosted Supabase instance. Configure Google and GitHub in that project's Auth providers. Never put a service-role key in the frontend.</p>
          <div className="provider-grid"><button disabled><span className="google-mark">G</span> Google</button><button disabled><Github size={16} /> GitHub</button><button disabled><Mail size={16} /> Email</button></div>
          <div className="modal-actions"><span className="docs-pointer">See <code>docs/AUTH_SETUP.md</code></span><button className="primary" onClick={close}>Continue locally</button></div>
        </> : <>
          <div className="provider-grid"><button onClick={() => oauth('google')} disabled={Boolean(busy)}><span className="google-mark">G</span> Continue with Google</button><button onClick={() => oauth('github')} disabled={Boolean(busy)}><Github size={16} /> Continue with GitHub</button></div>
          <div className="auth-divider"><span>or use an email link</span></div>
          <label>Email<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /></label>
          <button className="auth-secondary" onClick={() => emailLink('sign-in')} disabled={Boolean(busy) || !email}><MessageSquareText size={15} /> Email sign-in link</button>
          <button className="auth-secondary" onClick={() => emailLink('create-account')} disabled={Boolean(busy) || !email}><Mail size={15} /> Create account with email</button>
          {message && <p className="auth-message ok">{message}</p>}{error && <p className="auth-message bad">{error}</p>}
          <p className="auth-note">Signing in does not upload anything until you explicitly enable encrypted sync and choose a sync passphrase.</p>
        </>}
      </div>
    </section>
  </div>
}
