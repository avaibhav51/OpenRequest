import { expect, test } from '@playwright/test'

const apiUrl = 'http://127.0.0.1:4173/OpenRequest/__fixtures/profile?mode=full'

async function openSidebarIfNeeded(page: import('@playwright/test').Page) {
  const openMenu = page.getByRole('button', { name: 'Open menu' })
  if (await openMenu.isVisible()) await openMenu.click()
}

test.beforeEach(async ({ page }) => {
  await page.goto('./')
})

test('loads the base-path assets and seeded collection', async ({ page }) => {
  await expect(page).toHaveTitle(/Open Request Workbench/)
  await openSidebarIfNeeded(page)
  const mark = page.locator('.brand img')
  await expect(mark).toBeVisible()
  expect(await mark.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0)
  await expect(page.getByText('test-apis-public')).toBeVisible()
  await expect(page.getByText('naas', { exact: true })).toBeVisible()
})

test('synchronizes URL params, sends a deterministic request, and clears the response', async ({ page }) => {
  await page.getByLabel('Request URL').fill(apiUrl)
  await expect(page.getByLabel('Key').first()).toHaveValue('mode')
  await expect(page.getByLabel('Value').first()).toHaveValue('full')

  await page.getByRole('button', { name: 'Send' }).click()
  await expect(page.locator('.response-meta b')).toHaveText('200 OK')
  await expect(page.locator('.response-content')).toContainText('Regression fixture')
  await page.getByRole('button', { name: /Headers/ }).click()
  await expect(page.locator('.header-list')).toContainText('x-openrequest-fixture')

  await page.getByRole('button', { name: 'Clear response' }).click()
  await expect(page.getByText('Ready when you are')).toBeVisible()
})

test('persists a saved request in IndexedDB across reload', async ({ page }) => {
  await page.getByLabel('Request name').fill('Regression profile')
  await page.getByLabel('Request URL').fill(apiUrl)
  await page.getByRole('button', { name: 'Save', exact: true }).click()

  const dialog = page.getByRole('dialog', { name: 'Save request' })
  await dialog.getByLabel('Collection').selectOption({ label: 'test-apis-public' })
  await dialog.getByRole('button', { name: 'Save locally' }).click()
  await openSidebarIfNeeded(page)
  await expect(page.getByText('Regression profile', { exact: true })).toBeVisible()

  await page.reload()
  await openSidebarIfNeeded(page)
  await expect(page.getByText('Regression profile', { exact: true })).toBeVisible()
  await page.getByText('Regression profile', { exact: true }).click()
  await expect(page.getByLabel('Request URL')).toHaveValue(apiUrl)
})

test('persists the selected theme', async ({ page }) => {
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.getByTitle('Toggle theme').click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
})

test('reveals theme-aware URL details on demand without duplicating the editor', async ({ page }) => {
  const url = 'https://api.example.com:8443/users/{userId}/orders/current?limit=10&include=items'
  const urlInput = page.getByLabel('Request URL')
  const details = page.getByRole('tooltip')
  await urlInput.fill(url)
  await expect(urlInput).toHaveValue(url)
  await expect(details).toBeVisible()

  await expect(page.getByTitle('Protocol')).toHaveText('https://')
  await expect(page.getByTitle('Domain / host and port')).toHaveText('api.example.com:8443')
  await expect(page.getByTitle('Path parameter')).toHaveText('{userId}')
  await expect(page.getByTitle('Endpoint')).toHaveText('current')
  await expect(page.getByTitle('Query parameter key')).toHaveText(['limit', 'include'])
  await expect(page.getByTitle('Query parameter value')).toHaveText(['10', 'items'])

  const protocol = page.getByTitle('Protocol')
  const darkColor = await protocol.evaluate((element) => getComputedStyle(element).color)
  await page.getByTitle('Toggle theme').click()
  const lightColor = await protocol.evaluate((element) => getComputedStyle(element).color)
  expect(lightColor).not.toBe(darkColor)
  await expect(urlInput).toHaveValue(url)

  await page.getByLabel('Request name').focus()
  await page.mouse.move(0, 0)
  await expect(details).toBeHidden()

  await page.getByRole('button', { name: 'Show URL details' }).click()
  await expect(details).toBeVisible()
})
