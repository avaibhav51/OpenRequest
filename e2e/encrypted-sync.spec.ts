import { createClient } from '@supabase/supabase-js'
import { expect, test, type Browser, type Page } from '@playwright/test'

const enabled = process.env.OPENREQUEST_SYNC_E2E === '1'
const supabaseUrl = process.env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:54321'
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY ?? ''
const passphrase = 'integration sync passphrase 2026'

async function contextWithSession(browser: Browser, storageKey: string, session: unknown) {
  const context = await browser.newContext()
  // Custom contexts otherwise allow a blocked locator action to consume the
  // entire test timeout, obscuring the failing operation in CI.
  context.setDefaultTimeout(15_000)
  context.setDefaultNavigationTimeout(30_000)
  await context.addInitScript(({ key, value }) => {
    if (!localStorage.getItem(`${key}-test-seeded`)) { localStorage.setItem(key, value); localStorage.setItem(`${key}-test-seeded`, 'yes') }
  }, { key: storageKey, value: JSON.stringify(session) })
  return context
}

async function openAccount(page: Page) {
  await page.getByTitle('Account').click()
  await expect(page.getByRole('dialog', { name: 'Account and encrypted sync' })).toBeVisible()
}

async function syncFromAccount(page: Page) {
  await openAccount(page)
  await page.getByRole('button', { name: 'Sync now' }).click()
  await expect(page.getByText(/Synchronized:/)).toBeVisible()
  await page.getByRole('button', { name: 'Done' }).click()
}

async function saveUnfiled(page: Page, name: string, url: string) {
  await page.getByLabel('Request name').fill(name)
  await page.getByLabel('Request URL').fill(url)
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await page.getByRole('dialog', { name: 'Save request' }).getByRole('button', { name: 'Save locally' }).click()
}

async function selectSaved(page: Page, name: string) {
  const openMenu = page.getByRole('button', { name: 'Open menu' })
  if (await openMenu.isVisible()) await openMenu.click()
  await page.locator('.sidebar').getByRole('button', { name: `GET ${name}`, exact: true }).click()
}

async function readSaved(page: Page, name: string) {
  return page.evaluate((requestName) => new Promise<{ id: string; url: string; collectionId?: string; folderPath?: string[]; auth?: { type: string; token?: string } } | null>((resolve, reject) => {
    const opening = indexedDB.open('open-request-workbench')
    opening.onerror = () => reject(opening.error)
    opening.onsuccess = () => {
      const database = opening.result
      const request = database.transaction('requests', 'readonly').objectStore('requests').getAll()
      request.onerror = () => { database.close(); reject(request.error) }
      request.onsuccess = () => {
        const saved = request.result.find((item) => item.name === requestName)
        database.close()
        resolve(saved ? { id: saved.id, url: saved.url, collectionId: saved.collectionId, folderPath: saved.folderPath, auth: saved.auth } : null)
      }
    }
  }), name)
}

async function revertToSaved(page: Page) {
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Revert request' }).click()
}

async function unlock(page: Page) {
  await openAccount(page)
  await page.getByLabel('Sync passphrase').fill(passphrase)
  await page.getByRole('button', { name: 'Enable / unlock sync' }).click()
  await expect(page.getByText(/Synchronized:/)).toBeVisible({ timeout: 20_000 })
  await page.getByRole('button', { name: 'Done' }).click()
}

test.describe('encrypted cross-device synchronization', () => {
  test.skip(!enabled, 'Run against the disposable local Supabase stack with OPENREQUEST_SYNC_E2E=1.')
  test.skip(({ browserName }) => browserName !== 'chromium', 'The integration uses two Chromium browser profiles.')
  test.beforeAll(() => {
    if (!enabled) return
    const address = new URL(supabaseUrl)
    if (!['localhost', '127.0.0.1', '[::1]'].includes(address.hostname)) throw new Error('This suite may only provision users in a disposable loopback Supabase stack.')
    if (!supabaseKey) throw new Error('Supply the local public Supabase key, never a hosted/admin key.')
  })

  test('syncs folder placement and references, restores versions, reconnects and refuses another account', async ({ browser }) => {
    test.setTimeout(120000)
    const auth = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false, autoRefreshToken: false } })
    const other = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false, autoRefreshToken: false } })
    const firstLogin = await auth.auth.signUp({ email: `audit-${crypto.randomUUID()}@example.test`, password: `Local-${crypto.randomUUID()}-Aa1!` })
    const secondLogin = await other.auth.signUp({ email: `audit-other-${crypto.randomUUID()}@example.test`, password: `Local-${crypto.randomUUID()}-Aa1!` })
    expect(firstLogin.error).toBeNull(); expect(secondLogin.error).toBeNull()
    expect(firstLogin.data.session).toBeTruthy(); expect(secondLogin.data.session).toBeTruthy()
    const key = (auth.auth as unknown as { storageKey: string }).storageKey
    const a = await contextWithSession(browser, key, firstLogin.data.session), b = await contextWithSession(browser, key, firstLogin.data.session)
    try {
      const first = await a.newPage(), second = await b.newPage()
      await first.goto('./'); await unlock(first)
      await first.getByRole('button', { name: 'Add collection' }).click()
      const create = first.getByRole('dialog', { name: 'Create collection', exact: true })
      await create.getByLabel('Collection name').fill('Sync folders')
      await create.getByRole('button', { name: 'Create collection', exact: true }).click()
      await first.getByRole('button', { name: 'Add folder in Sync folders', exact: true }).click()
      const folder = first.getByRole('dialog', { name: 'Create folder', exact: true })
      await folder.getByLabel('Folder name').fill('Auth')
      await folder.getByRole('button', { name: 'Create folder', exact: true }).click()
      await first.getByLabel('Request name').fill('Portable auth request')
      await first.getByLabel('Request URL').fill('https://example.test/original')
      await first.getByRole('button', { name: 'Auth', exact: true }).click()
      await first.getByLabel('Type', { exact: true }).selectOption('bearer')
      await first.getByLabel('Token', { exact: true }).fill('{{accessToken}}')
      await first.getByRole('button', { name: 'Save', exact: true }).click()
      const save = first.getByRole('dialog', { name: 'Save request' })
      await save.getByLabel('Collection', { exact: true }).selectOption({ label: 'Sync folders' })
      await save.getByLabel('Save to folder').selectOption({ label: 'Auth' })
      await save.getByRole('button', { name: 'Save locally' }).click()
      await expect(save).not.toBeVisible(); await syncFromAccount(first)
      await second.goto('./'); await unlock(second)
      expect(await readSaved(second, 'Portable auth request')).toMatchObject({ folderPath: ['Auth'], auth: { type: 'bearer', token: '{{accessToken}}' } })
      await first.getByRole('button', { name: 'Manage folder Sync folders / Auth', exact: true }).click()
      const manage = first.getByRole('dialog', { name: 'Manage folder' })
      await manage.getByLabel('Folder name').fill('Users')
      await manage.getByRole('button', { name: 'Save folder changes' }).click()
      await expect(manage).not.toBeVisible(); await syncFromAccount(first); await syncFromAccount(second)
      expect((await readSaved(second, 'Portable auth request'))?.folderPath).toEqual(['Users'])
      await second.getByRole('button', { name: 'Manage Portable auth request', exact: true }).click()
      const versions = second.getByRole('dialog', { name: 'Manage saved request' })
      await versions.getByRole('button', { name: 'View encrypted versions' }).click()
      await versions.getByRole('button', { name: /^Open version from/ }).first().click()
      await expect(second.getByLabel('Request name')).toHaveValue('Portable auth request (copy)')
      await expect(second.getByLabel('Request URL')).toHaveValue('https://example.test/original')
      await a.setOffline(true)
      await first.getByLabel('Request URL').fill('https://example.test/offline-save')
      await first.getByRole('button', { name: 'Save', exact: true }).click()
      await save.getByRole('button', { name: 'Save locally' }).click()
      await expect(save).not.toBeVisible()
      await a.setOffline(false)
      await first.evaluate(() => window.dispatchEvent(new Event('online')))
      await syncFromAccount(first); await syncFromAccount(second)
      expect((await readSaved(second, 'Portable auth request'))?.url).toBe('https://example.test/offline-save')
      await openAccount(first)
      first.once('dialog', (dialog) => dialog.accept())
      await first.getByRole('button', { name: 'Clean up old sync revisions' }).click()
      await expect(first.getByText(/Removed \d+ older encrypted revisions/)).toBeVisible()
      await first.getByRole('button', { name: 'Sign out', exact: true }).click()
      await expect(first.getByTitle('Optional sign in')).toBeVisible()
      await first.getByLabel('Close account').click()
      await first.evaluate(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)), { key, session: secondLogin.data.session })
      await first.reload()
      await expect(first.locator('.local-badge')).toContainText('Sync needs attention')
      await openAccount(first)
      await first.getByLabel('Sync passphrase').fill(passphrase)
      await first.getByRole('button', { name: 'Enable / unlock sync' }).click()
      await expect(first.getByText('This local workspace is bound to a different account. Synchronization remains paused.')).toBeVisible()
      const check = await other.from('sync_workspaces').select('id')
      expect(check.error).toBeNull(); expect(check.data).toEqual([])
    } finally {
      // Timed-out tests may already have disposed their contexts. Teardown must
      // not replace the original assertion/action failure with a protocol error.
      await Promise.allSettled([a.close(), b.close()])
    }
  })

  test('syncs saved requests, keeps unsaved edits local, and applies the latest server revision', async ({ browser }) => {
    test.setTimeout(60_000)
    const auth = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false, autoRefreshToken: false } })
    const credentials = { email: `sync-${crypto.randomUUID()}@example.test`, password: `Local-${crypto.randomUUID()}-Aa1!` }
    const { data, error } = await auth.auth.signUp(credentials)
    expect(error).toBeNull()
    expect(data.session).toBeTruthy()
    const storageKey = (auth.auth as unknown as { storageKey: string }).storageKey

    const firstContext = await contextWithSession(browser, storageKey, data.session)
    const secondContext = await contextWithSession(browser, storageKey, data.session)
    const first = await firstContext.newPage()
    const second = await secondContext.newPage()
    await first.goto('./')
    await expect(first.getByTitle('Account')).toBeVisible()

    await openAccount(first)
    await first.getByLabel('Sync passphrase').fill(passphrase)
    await first.getByRole('button', { name: 'Enable / unlock sync' }).click()
    await expect(first.getByText(/Synchronized:/)).toBeVisible({ timeout: 20_000 })
    await first.getByRole('button', { name: 'Done' }).click()

    await saveUnfiled(first, 'Cross-device request', 'https://example.test/from-first')
    await syncFromAccount(first)

    await second.goto('./')
    await openAccount(second)
    await second.getByLabel('Sync passphrase').fill(passphrase)
    await second.getByRole('button', { name: 'Enable / unlock sync' }).click()
    await expect(second.getByText(/Synchronized:/)).toBeVisible({ timeout: 20_000 })
    await second.getByRole('button', { name: 'Done' }).click()
    await selectSaved(second, 'Cross-device request')
    await expect(second.getByLabel('Request URL')).toHaveValue('https://example.test/from-first')

    await second.getByLabel('Request URL').fill('https://example.test/unsaved-on-second')
    await syncFromAccount(second)
    await syncFromAccount(first)
    await selectSaved(first, 'Cross-device request')
    await expect(first.getByLabel('Request URL')).toHaveValue('https://example.test/from-first')

    await second.getByRole('button', { name: 'Save', exact: true }).click()
    await second.getByRole('dialog', { name: 'Save request' }).getByRole('button', { name: 'Save locally' }).click()
    await syncFromAccount(second)
    await syncFromAccount(first)
    await selectSaved(first, 'Cross-device request')
    await expect.poll(async () => (await readSaved(first, 'Cross-device request'))?.url).toBe('https://example.test/unsaved-on-second')
    // Pull updates the saved record, never the already-open editor copy.
    await expect(first.getByLabel('Request URL')).toHaveValue('https://example.test/from-first')
    await revertToSaved(first)
    await expect(first.getByLabel('Request URL')).toHaveValue('https://example.test/unsaved-on-second')

    await first.getByRole('button', { name: 'Add collection' }).click()
    const create = first.getByRole('dialog', { name: 'Create collection', exact: true })
    await create.getByLabel('Collection name').fill('Synced deletion collection')
    await create.getByRole('button', { name: 'Create collection', exact: true }).click()
    await expect(create).not.toBeVisible()
    await first.getByRole('button', { name: 'New' }).click()
    await first.getByLabel('Request name').fill('Request in deleted collection')
    await first.getByLabel('Request URL').fill('https://example.test/deletion')
    await first.getByRole('button', { name: 'Save', exact: true }).click()
    const saveDialog = first.getByRole('dialog', { name: 'Save request' })
    await saveDialog.getByLabel('Collection').selectOption({ label: 'Synced deletion collection' })
    await saveDialog.getByRole('button', { name: 'Save locally' }).click()
    await syncFromAccount(first)
    const syncedCollection = first.locator('.tree').filter({ hasText: 'Synced deletion collection' })
    await syncedCollection.hover()
    first.once('dialog', (dialog) => dialog.accept())
    await syncedCollection.getByTitle('Delete collection').click()
    await syncFromAccount(first)
    const { data: latestCollectionRevision, error: revisionError } = await auth.from('sync_revisions')
      .select('operation').eq('object_type', 'collection').order('server_sequence', { ascending: false }).limit(1).single()
    expect(revisionError).toBeNull()
    expect(latestCollectionRevision?.operation).toBe('delete')

    // Request tombstones remove the saved record on both browsers, while preserving
    // the second browser's open edits under a new, never-auto-uploaded draft ID.
    const originalRequestId = (await readSaved(second, 'Cross-device request'))!.id
    await selectSaved(second, 'Cross-device request')
    await second.getByLabel('Request URL').fill('https://example.test/deleted-but-local-edits')
    const menu = first.getByRole('button', { name: 'Open menu' })
    if (await menu.isVisible()) await menu.click()
    await first.getByRole('button', { name: 'Manage Cross-device request', exact: true }).click()
    await first.getByRole('dialog', { name: 'Manage saved request' }).getByRole('button', { name: 'Delete saved request', exact: true }).click()
    await first.getByRole('dialog', { name: 'Delete saved request' }).getByRole('button', { name: 'Confirm delete', exact: true }).click()
    await expect(first.getByRole('dialog', { name: 'Delete saved request' })).not.toBeVisible()
    await syncFromAccount(first)
    await syncFromAccount(second)
    await expect.poll(() => readSaved(second, 'Cross-device request')).toBeNull()
    await expect(second.getByLabel('Request URL')).toHaveValue('https://example.test/deleted-but-local-edits')
    await expect.poll(() => second.evaluate(() => localStorage.getItem('active-editor-draft'))).not.toBe(originalRequestId)
    const { data: tombstone, error: tombstoneError } = await auth.from('sync_revisions').select('operation')
      .eq('object_type', 'request').eq('object_id', originalRequestId).order('server_sequence', { ascending: false }).limit(1).single()
    expect(tombstoneError).toBeNull()
    expect(tombstone?.operation).toBe('delete')
    await syncFromAccount(second)
    expect(await readSaved(second, 'Cross-device request')).toBeNull()
    await second.getByRole('button', { name: 'Save', exact: true }).click()
    const save = second.getByRole('dialog', { name: 'Save request' })
    await save.getByRole('button', { name: 'Save locally' }).click()
    await expect(save).not.toBeVisible()
    await syncFromAccount(second)
    await syncFromAccount(first)
    await expect.poll(async () => (await readSaved(first, 'Cross-device request'))?.id).not.toBe(originalRequestId)
    expect((await readSaved(first, 'Cross-device request'))?.url).toBe('https://example.test/deleted-but-local-edits')

    await firstContext.close()
    await secondContext.close()
  })

  test('automatically synchronizes alternating devices without Sync now and preserves open edits', async ({ browser }) => {
    test.setTimeout(180_000)
    const auth = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data, error } = await auth.auth.signUp({
      email: `auto-sync-${crypto.randomUUID()}@example.test`, password: `Local-${crypto.randomUUID()}-Aa1!`,
    })
    expect(error).toBeNull()
    expect(data.session).toBeTruthy()
    const storageKey = (auth.auth as unknown as { storageKey: string }).storageKey
    const firstContext = await contextWithSession(browser, storageKey, data.session)
    const secondContext = await contextWithSession(browser, storageKey, data.session)
    try {
      const first = await firstContext.newPage()
      const second = await secondContext.newPage()
      await first.goto('./')
      await unlock(first)
      await second.goto('./')
      await unlock(second)
      const name = 'Automatically synchronized request'
      await saveUnfiled(first, name, 'https://example.test/auto-first')
      // No manual synchronization or injected focus event: allow the real interval
      // to pull the saved request into the second browser.
      await expect.poll(async () => (await readSaved(second, name))?.url, { timeout: 50_000 }).toBe('https://example.test/auto-first')
      await selectSaved(second, name)
      const id = (await readSaved(second, name))!.id
      await second.getByLabel('Request URL').fill('https://example.test/second-unsaved')
      await saveUnfiled(first, name, 'https://example.test/auto-first-new')
      await second.bringToFront()
      // Exercise the same event handler used when the user returns to a device;
      // dispatch explicitly because headless browsers differ in native focus behavior.
      await second.evaluate(() => window.dispatchEvent(new Event('focus')))
      await expect.poll(async () => (await readSaved(second, name))?.url, { timeout: 50_000 }).toBe('https://example.test/auto-first-new')
      await selectSaved(second, name)
      await expect(second.getByLabel('Request URL')).toHaveValue('https://example.test/second-unsaved')
      expect((await readSaved(second, name))?.id).toBe(id)
      await revertToSaved(second)
      await expect(second.getByLabel('Request URL')).toHaveValue('https://example.test/auto-first-new')

      await first.getByLabel('Request URL').fill('https://example.test/first-unsaved')
      await saveUnfiled(second, name, 'https://example.test/auto-second')
      await first.bringToFront()
      await first.evaluate(() => window.dispatchEvent(new Event('online')))
      await expect.poll(async () => (await readSaved(first, name))?.url, { timeout: 50_000 }).toBe('https://example.test/auto-second')
      await expect(first.getByLabel('Request URL')).toHaveValue('https://example.test/first-unsaved')
      await revertToSaved(first)
      await expect(first.getByLabel('Request URL')).toHaveValue('https://example.test/auto-second')
      expect((await readSaved(first, name))?.id).toBe(id)
    } finally {
      await firstContext.close()
      await secondContext.close()
    }
  })
})
