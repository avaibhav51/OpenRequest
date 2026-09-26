import { expect, test } from '@playwright/test'

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
