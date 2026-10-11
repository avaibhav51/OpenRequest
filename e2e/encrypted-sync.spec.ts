import { createClient } from '@supabase/supabase-js'
import { expect, test, type Browser, type Page } from '@playwright/test'

const enabled = process.env.OPENREQUEST_SYNC_E2E === '1'
const supabaseUrl = process.env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:54321'
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY ?? ''
const passphrase = 'integration sync passphrase 2026'

async function contextWithSession(browser: Browser, storageKey: string, session: unknown) {
  const context = await browser.newContext()
  await context.addInitScript(({ key, value }) => localStorage.setItem(key, value), { key: storageKey, value: JSON.stringify(session) })
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
  await page.getByText(name, { exact: true }).click()
}

async function readSaved(page: Page, name: string) {
  return page.evaluate((requestName) => new Promise<{ id: string; url: string; collectionId?: string } | null>((resolve, reject) => {
    const opening = indexedDB.open('open-request-workbench')
    opening.onerror = () => reject(opening.error)
    opening.onsuccess = () => {
      const database = opening.result
      const request = database.transaction('requests', 'readonly').objectStore('requests').getAll()
      request.onerror = () => { database.close(); reject(request.error) }
      request.onsuccess = () => {
        const saved = request.result.find((item) => item.name === requestName)
        database.close()
        resolve(saved ? { id: saved.id, url: saved.url, collectionId: saved.collectionId } : null)
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

    first.once('dialog', (dialog) => dialog.accept('Synced deletion collection'))
    await first.getByRole('button', { name: 'Add collection' }).click()
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
