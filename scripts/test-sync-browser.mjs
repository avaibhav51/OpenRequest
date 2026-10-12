import { execFileSync, spawnSync } from 'node:child_process'

// Never log status JSON: it contains the local service-role key.
const readStatus = () => {
  try { return execFileSync('supabase', ['status', '-o', 'json'], { encoding: 'utf8' }) }
  catch (error) {
    if (error.code !== 'ENOENT') throw error
    return execFileSync('npx', ['--yes', 'supabase@latest', 'status', '-o', 'json'], { encoding: 'utf8' })
  }
}
const status = JSON.parse(readStatus())
if (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(status.API_URL).hostname)) throw new Error('Use a disposable loopback Supabase stack only.')
const key = status.PUBLISHABLE_KEY ?? status.ANON_KEY
if (!key) throw new Error('Local public key is missing.')
const run = spawnSync('npm', ['run', 'test:e2e', '--', '--project=chromium', '--grep', 'encrypted cross-device', '--workers=1', '--retries=1', '--global-timeout=900000'], {
  stdio: 'inherit', env: { ...process.env, OPENREQUEST_SYNC_E2E: '1', OPENREQUEST_E2E_PORT: '4175', VITE_SUPABASE_URL: status.API_URL, VITE_SUPABASE_ANON_KEY: key },
})
if (run.error) throw run.error
process.exitCode = run.status ?? 1
