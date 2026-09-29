import { execFileSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'

const readSupabaseStatus = () => {
  if (process.env.SUPABASE_STATUS_JSON) return JSON.parse(process.env.SUPABASE_STATUS_JSON)
  try {
    return JSON.parse(execFileSync('supabase', ['status', '-o', 'json'], { encoding: 'utf8' }))
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
    return JSON.parse(execFileSync('npx', ['--yes', 'supabase@latest', 'status', '-o', 'json'], { encoding: 'utf8' }))
  }
}

const status = readSupabaseStatus()
const url = status.API_URL
const publicKey = status.PUBLISHABLE_KEY ?? status.ANON_KEY
if (!url || !publicKey) throw new Error('Start the local Supabase stack before running the public API test.')

const suffix = crypto.randomUUID()
const credentials = (name) => ({ email: `${name}-${suffix}@example.test`, password: `Local-only-${crypto.randomUUID()}-Aa1!` })
const alice = createClient(url, publicKey, { auth: { persistSession: false, autoRefreshToken: false } })
const bob = createClient(url, publicKey, { auth: { persistSession: false, autoRefreshToken: false } })

const signUp = async (client, name) => {
  const { data, error } = await client.auth.signUp(credentials(name))
  if (error) throw error
  if (!data.user || !data.session) throw new Error(`Local ${name} signup did not return an authenticated session.`)
  return data.user
}

const aliceUser = await signUp(alice, 'alice')
await signUp(bob, 'bob')
const workspaceId = crypto.randomUUID()

const { error: workspaceError } = await alice.from('sync_workspaces').insert({ id: workspaceId, owner_id: aliceUser.id })
if (workspaceError) throw workspaceError

const { data: bobVisible, error: bobReadError } = await bob.from('sync_workspaces').select('id').eq('id', workspaceId)
if (bobReadError) throw bobReadError
if (bobVisible.length !== 0) throw new Error('Bob could read Alice workspace through the public API.')

const revision = {
  id: crypto.randomUUID(),
  workspace_id: workspaceId,
  object_type: 'collection',
  object_id: crypto.randomUUID(),
  operation: 'upsert',
  client_sequence: 1,
  idempotency_key: crypto.randomUUID(),
  ciphertext: `\\x${'aa'.repeat(17)}`,
  nonce: `\\x${'01'.repeat(12)}`,
}

const { error: aliceInsertError } = await alice.from('sync_revisions').insert(revision)
if (aliceInsertError) throw aliceInsertError

const { error: bobInsertError } = await bob.from('sync_revisions').insert({ ...revision, id: crypto.randomUUID(), idempotency_key: crypto.randomUUID() })
if (!bobInsertError) throw new Error('Bob appended a revision to Alice workspace through the public API.')

const { data: aliceVisible, error: aliceReadError } = await alice.from('sync_revisions').select('id').eq('workspace_id', workspaceId)
if (aliceReadError) throw aliceReadError
if (aliceVisible.length !== 1) throw new Error('Alice could not read her own revision through the public API.')

console.log('Public API isolation passed: Alice owns and reads her row; Bob can neither see nor append to it.')
