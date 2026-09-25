import { useState } from 'react'
import { Github, KeyRound, LogOut, Mail, MessageSquareText, ShieldCheck, X } from 'lucide-react'
import { authClient, authConfigured, type AuthUser } from '../lib/auth'

type EmailMode = 'sign-in' | 'sign-up'

const authRedirectUrl = new URL(import.meta.env.BASE_URL, window.location.origin).href

export function AuthModal({ user, close }: { user: AuthUser | null; close: () => void }) {
  const [emailMode, setEmailMode] = useState<EmailMode>('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const run = async (name: string, action: () => Promise<{ error: { message: string } | null }>, success: string) => {
    setBusy(name); setError(''); setMessage('')
    try {
      const result = await action()
      if (result.error) { setError(result.error.message); return false }
      setMessage(success)
      return true
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : String(requestError)); return false }
    finally { setBusy('') }
  }
  const oauth = async (provider: 'google' | 'github') => {
    if (!authClient) return
    setBusy(provider); setError('')
    const { error } = await authClient.auth.signInWithOAuth({ provider, options: { redirectTo: authRedirectUrl } })
    if (error) { setError(error.message); setBusy('') }
  }
  const submitPassword = () => {
    const client = authClient
    if (!client || !email || !password) return
    const action = emailMode === 'sign-in'
      ? () => client.auth.signInWithPassword({ email, password })
      : () => client.auth.signUp({ email, password, options: { emailRedirectTo: authRedirectUrl } })
    run('password', action, emailMode === 'sign-in' ? 'Signed in.' : 'Account created. Check your email if confirmation is enabled.')
  }

  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && close()}>
    <section className="modal auth-modal" role="dialog" aria-modal="true" aria-label="Experimental account access">
      <header><div><KeyRound /><div><h2>{user ? 'Experimental account' : 'Experimental account access'}</h2><p>Authentication only—cross-device sync is not available yet.</p></div></div><button className="icon-button" onClick={close}><X /></button></header>
      <div className="modal-body auth-content">
        {user ? <>
          <div className="signed-in-card"><ShieldCheck /><div><strong>Signed in</strong><span>{user.email ?? user.phone ?? user.id}</span></div></div>
          <p className="auth-note">Authentication is active. Encrypted cross-device collection sync is a later milestone; signing in currently establishes the account session only.</p>
          <div className="modal-actions"><button onClick={() => run('logout', () => authClient!.auth.signOut(), 'Signed out.')} disabled={Boolean(busy)}><LogOut size={14} /> Sign out</button><button className="primary" onClick={close}>Done</button></div>
        </> : !authConfigured ? <>
          <div className="config-needed"><ShieldCheck /><div><strong>Login is not configured in this local build</strong><p>Add the two public Supabase settings described below, then restart the development server. The app stays fully usable locally meanwhile.</p></div></div>
          <div className="config-code"><code>VITE_SUPABASE_URL=https://…</code><code>VITE_SUPABASE_ANON_KEY=…</code></div>
          <p className="auth-note">Use Supabase's free hosted tier or a self-hosted Supabase instance. Configure Google and GitHub in that project's Auth providers. Never put a service-role key in the frontend.</p>
          <div className="provider-grid"><button disabled><span className="google-mark">G</span> Google</button><button disabled><Github size={16} /> GitHub</button><button disabled><Mail size={16} /> Email</button></div>
          <div className="modal-actions"><span className="docs-pointer">See <code>docs/AUTH_SETUP.md</code></span><button className="primary" onClick={close}>Continue locally</button></div>
        </> : <>
          <div className="provider-grid"><button onClick={() => oauth('google')} disabled={Boolean(busy)}><span className="google-mark">G</span> Continue with Google</button><button onClick={() => oauth('github')} disabled={Boolean(busy)}><Github size={16} /> Continue with GitHub</button></div>
          <div className="auth-divider"><span>or use email</span></div>
          <div className="email-mode"><button className={emailMode === 'sign-in' ? 'active' : ''} onClick={() => setEmailMode('sign-in')}>Sign in</button><button className={emailMode === 'sign-up' ? 'active' : ''} onClick={() => setEmailMode('sign-up')}>Create account</button></div>
          <label>Email<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /></label>
          <label>Password<input type="password" autoComplete={emailMode === 'sign-in' ? 'current-password' : 'new-password'} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" /></label>
          <button className="auth-primary" onClick={submitPassword} disabled={Boolean(busy) || !email || !password}><Mail size={15} /> {emailMode === 'sign-in' ? 'Sign in with email' : 'Create email account'}</button>
          <button className="auth-secondary" onClick={() => authClient && run('magic', () => authClient!.auth.signInWithOtp({ email, options: { emailRedirectTo: authRedirectUrl } }), 'Check your email for the sign-in link.')} disabled={Boolean(busy) || !email}><MessageSquareText size={15} /> Send email sign-in link</button>
          {message && <p className="auth-message ok">{message}</p>}{error && <p className="auth-message bad">{error}</p>}
          <p className="auth-note">Your local collections stay local. Account sync is not enabled yet.</p>
        </>}
      </div>
    </section>
  </div>
}
