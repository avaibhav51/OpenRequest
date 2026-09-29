import { createClient } from '@supabase/supabase-js'
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test'

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

test.describe('encrypted cross-device synchronization', () => {
  test.skip(!enabled, 'Run against the disposable local Supabase stack with OPENREQUEST_SYNC_E2E=1.')
  test.skip(({ browserName }) => browserName !== 'chromium', 'The integration uses two Chromium browser profiles.')

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
})
