import { expect, test } from '@playwright/test'

test('reopens cached workspace offline with its persistent draft', async ({ page, context, browserName }) => {
  test.skip(browserName === 'webkit', 'Playwright WebKit does not expose service workers consistently')
  await page.goto('./')
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined))
  await page.reload()
  await page.getByLabel('Request URL').fill('https://example.com/offline-draft')
  // Wait for the real persistence boundary rather than an arbitrary sleep.
  await expect.poll(() => page.evaluate(() => new Promise<string>((resolve) => {
    const open = indexedDB.open('open-request-workbench')
    open.onsuccess = () => {
      const db = open.result, read = db.transaction('editorDrafts').objectStore('editorDrafts').get(localStorage.getItem('active-editor-draft')!)
      read.onsuccess = () => { db.close(); resolve(read.result?.url ?? '') }
    }
  }))).toBe('https://example.com/offline-draft')
  await context.setOffline(true)
  try { await page.reload(); await expect(page.getByLabel('Request URL')).toHaveValue('https://example.com/offline-draft') }
  finally { await context.setOffline(false) }
})

test('offers a worker update without reloading or losing edits until accepted', async ({ page, request, browserName }) => {
  test.skip(browserName === 'webkit', 'Playwright WebKit does not expose service workers consistently')
  await page.goto('./')
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined))
  await page.reload()
  await page.getByLabel('Request URL').fill('https://example.com/update-draft')
  await request.post('./__fixtures/pwa-version')
  await page.evaluate(async () => { const registration = await navigator.serviceWorker.ready; await registration.update() })
  await expect(page.getByRole('button', { name: 'Update app' })).toBeVisible({ timeout: 15000 })
  await expect(page.getByLabel('Request URL')).toHaveValue('https://example.com/update-draft')
  page.once('dialog', (dialog) => dialog.dismiss())
  await page.getByRole('button', { name: 'Update app' }).click()
  await expect(page.getByLabel('Request URL')).toHaveValue('https://example.com/update-draft')
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Update app' }).click()
  await expect(page.getByRole('button', { name: 'Update app' })).not.toBeVisible({ timeout: 15000 })
  await expect(page.getByLabel('Request URL')).toHaveValue('https://example.com/update-draft')
})

test('publishes a valid base-path manifest and registers a service worker', async ({ page, request, browserName }) => {
  await page.goto('./')

  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href')
  expect(manifestHref).toContain('/OpenRequest/manifest.webmanifest')
  const manifestResponse = await request.get(new URL(manifestHref!, page.url()).href)
  expect(manifestResponse.ok()).toBeTruthy()
  const manifest = await manifestResponse.json()
  expect(manifest.name).toBe('Open Request Workbench')
  expect(manifest.display).toBe('standalone')

  test.skip(browserName === 'webkit', 'Playwright WebKit does not expose service workers consistently')
  const registration = await page.evaluate(async () => {
    const ready = await navigator.serviceWorker.ready
    return { scope: ready.scope, scriptURL: ready.active?.scriptURL }
  })
  expect(registration.scope).toContain('/OpenRequest/')
  expect(registration.scriptURL).toContain('/OpenRequest/sw.js')
})
