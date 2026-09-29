import { expect, test } from '@playwright/test'

const e2ePort = Number(process.env.OPENREQUEST_E2E_PORT ?? 4173)
const apiUrl = `http://127.0.0.1:${e2ePort}/OpenRequest/__fixtures/profile?mode=full`

async function openSidebarIfNeeded(page: import('@playwright/test').Page) {
  const openMenu = page.getByRole('button', { name: 'Open menu' })
  if (await openMenu.isVisible()) await openMenu.click()
}

async function readSyncOutbox(page: import('@playwright/test').Page) {
  return page.evaluate(() => new Promise<Array<{ entityType: string; entityId: string; operation: string; updatedAt: number }>>((resolve, reject) => {
    const opening = indexedDB.open('open-request-workbench')
    opening.onerror = () => reject(opening.error)
    opening.onsuccess = () => {
      const database = opening.result
      const request = database.transaction('syncOutbox', 'readonly').objectStore('syncOutbox').getAll()
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        resolve(request.result.map(({ entityType, entityId, operation, updatedAt }) => ({ entityType, entityId, operation, updatedAt })))
        database.close()
      }
    }
  }))
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

test('keeps a newly created empty collection local and out of the sync queue', async ({ page }) => {
  await openSidebarIfNeeded(page)
  page.once('dialog', async (dialog) => dialog.accept('Private empty collection'))
  await page.getByRole('button', { name: 'Add collection' }).click()
  await expect(page.getByText('Private empty collection', { exact: true })).toBeVisible()
  const closeMenu = page.locator('.sidebar .brand').getByRole('button', { name: 'Close menu' })
  if (await closeMenu.isVisible()) await closeMenu.click()
  await page.getByTitle('Settings').click()
  await expect(page.getByRole('dialog', { name: 'Workspace settings' })).toContainText('0 local changes waiting to sync')
})

test('shows detailed security help without clipping and keeps short copy inline', async ({ page }) => {
  await page.getByTitle('Settings').click()
  const details = page.getByRole('button', { name: 'How encrypted sync protects data' })
  await details.hover()
  const tooltip = page.getByRole('tooltip')
  await expect(tooltip).toBeVisible()
  const box = await tooltip.boundingBox()
  const viewport = page.viewportSize()
  expect(box).not.toBeNull()
  expect(viewport).not.toBeNull()
  expect(box!.x).toBeGreaterThanOrEqual(0)
  expect(box!.y).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width)
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height)
  await expect(page.getByRole('heading', { name: 'Browser boundary' }).getByRole('button')).toHaveCount(0)
})

test('imports formatted JSON into a persistent request tab without treating payload credentials as HTTP auth', async ({ page }) => {
  const command = `curl --request POST \\
--url https://example.com/login \\
--header 'Content-Type: application/json' \\
--header 'accept: application/json' \\
--data '{ "username": "demo", "password": "secret" }'`
  await page.getByRole('button', { name: 'Import cURL' }).click()
  await page.getByRole('dialog', { name: 'Import cURL' }).getByLabel('cURL command').fill(command)
  await page.getByRole('button', { name: 'Import request' }).click()

  await expect(page.getByLabel('Request URL')).toHaveValue('https://example.com/login')
  await page.locator('.request-editor .tabbar button').filter({ hasText: /^body/i }).click()
  await expect(page.locator('.body-editor textarea')).toHaveValue('{\n  "username": "demo",\n  "password": "secret"\n}')
  await expect(page.locator('.body-credential-note')).toContainText('API payload fields')
  await page.locator('.request-editor .tabbar button').filter({ hasText: /^auth/i }).click()
  await expect(page.getByLabel('Type')).toHaveValue('none')

  await page.getByRole('button', { name: 'New request tab' }).click()
  await expect(page.locator('.request-tabs > div')).toHaveCount(2)
  await page.reload()
  await expect(page.locator('.request-tabs > div')).toHaveCount(2)
  await page.getByRole('button', { name: 'POST login' }).click()
  await expect(page.getByLabel('Request URL')).toHaveValue('https://example.com/login')
})

test('queues only explicit saves and coalesces edits per saved request', async ({ page }) => {
  await page.getByLabel('Request name').fill('Local draft')
  await page.getByLabel('Request URL').fill(apiUrl)
  await expect.poll(() => readSyncOutbox(page)).toEqual([])

  await page.getByRole('button', { name: 'Send' }).click()
  await expect(page.locator('.response-meta b')).toHaveText('200 OK')
  await expect.poll(() => readSyncOutbox(page)).toEqual([])

  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await page.getByRole('dialog', { name: 'Save request' }).getByRole('button', { name: 'Save locally' }).click()
  const firstSave = await readSyncOutbox(page)
  expect(firstSave).toHaveLength(1)
  expect(firstSave[0]).toMatchObject({ entityType: 'request', operation: 'upsert' })

  await page.getByLabel('Request URL').fill(`${apiUrl}&unsaved=yes`)
  expect(await readSyncOutbox(page)).toEqual(firstSave)

  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await page.getByRole('dialog', { name: 'Save request' }).getByRole('button', { name: 'Save locally' }).click()
  const secondSave = await readSyncOutbox(page)
  expect(secondSave).toHaveLength(1)
  expect(secondSave[0].entityId).toBe(firstSave[0].entityId)
  expect(secondSave[0].updatedAt).toBeGreaterThanOrEqual(firstSave[0].updatedAt)

  await page.getByRole('button', { name: 'New', exact: true }).click()
  await page.getByLabel('Request name').fill('Second saved request')
  await page.getByLabel('Request URL').fill(apiUrl)
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await page.getByRole('dialog', { name: 'Save request' }).getByRole('button', { name: 'Save locally' }).click()
  const independentSaves = await readSyncOutbox(page)
  expect(independentSaves.filter((entry) => entry.entityType === 'request')).toHaveLength(2)
  expect(new Set(independentSaves.map((entry) => entry.entityId)).size).toBe(2)
})

test('synchronizes URL params, sends a deterministic request, and clears the response', async ({ page }) => {
  await page.getByLabel('Request URL').fill(apiUrl)
  await expect(page.getByLabel('Key').first()).toHaveValue('mode')
  await expect(page.getByLabel('Value').first()).toHaveValue('full')

  await page.getByRole('button', { name: 'Send' }).click()
  await expect(page.locator('.response-meta b')).toHaveText('200 OK')
  await expect(page.locator('.response-content')).toContainText('Regression fixture')
  await expect(page.locator('pre[data-language="json"] .syntax-key').first()).toBeVisible()
  await expect(page.locator('pre[data-language="json"] .syntax-string').first()).toBeVisible()
  await page.getByRole('button', { name: /Headers/ }).click()
  await expect(page.locator('.header-list')).toContainText('x-openrequest-fixture')

  await page.getByRole('button', { name: 'Clear response' }).click()
  await expect(page.getByText('Ready when you are')).toBeVisible()
})

test('syntax highlights formatted XML while Raw stays literal', async ({ page }) => {
  await page.getByLabel('Request URL').fill(`http://127.0.0.1:${e2ePort}/OpenRequest/__fixtures/profile.xml`)
  await page.getByRole('button', { name: 'Send' }).click()
  await expect(page.locator('pre[data-language="xml"] .syntax-tag').first()).toHaveText('profile')
  await expect(page.locator('pre[data-language="xml"] .syntax-attribute')).toHaveText('id')

  await page.getByRole('button', { name: 'Raw' }).click()
  await expect(page.locator('.response-content pre')).toHaveText('<profile id="42"><name>Regression fixture</name></profile>')
  await expect(page.locator('.response-content .syntax-tag')).toHaveCount(0)
})

test('persists a saved request in IndexedDB across reload', async ({ page }) => {
  await page.getByLabel('Request name').fill('Regression profile')
  await page.getByLabel('Request URL').fill(apiUrl)
  await page.getByRole('button', { name: 'Save', exact: true }).click()

  const dialog = page.getByRole('dialog', { name: 'Save request' })
  await expect(dialog.getByLabel(/Folder path/i)).toHaveCount(0)
  await dialog.getByLabel('Collection').selectOption({ label: 'test-apis-public' })
  await dialog.getByRole('button', { name: 'Save locally' }).click()
  await openSidebarIfNeeded(page)
  await expect(page.locator('.sidebar').getByText('Regression profile', { exact: true })).toBeVisible()

  await page.reload()
  await openSidebarIfNeeded(page)
  await expect(page.locator('.sidebar').getByText('Regression profile', { exact: true })).toBeVisible()
  await page.locator('.sidebar').getByText('Regression profile', { exact: true }).click()
  await expect(page.getByLabel('Request URL')).toHaveValue(apiUrl)

  await page.getByTitle('Settings').click()
  await expect(page.getByRole('dialog', { name: 'Workspace settings' })).toContainText('2 local changes waiting to sync')
  await expect(page.getByRole('dialog', { name: 'Workspace settings' })).toContainText('Only explicitly saved requests')
})

test('persists the selected theme', async ({ page }) => {
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.getByTitle('Toggle theme').click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
})

test('light theme keeps readable contrast and coordinated subtle surfaces', async ({ page }) => {
  await page.getByTitle('Toggle theme').click()
  const light = await page.evaluate(() => {
    const contrast = (foreground: string, background: string) => {
      const channels = (color: string) => color.match(/[\d.]+/g)!.slice(0, 3).map(Number).map((value) => {
        const normalized = value / 255
        return normalized <= .04045 ? normalized / 12.92 : ((normalized + .055) / 1.055) ** 2.4
      })
      const luminance = (color: string) => {
        const [red, green, blue] = channels(color)
        return .2126 * red + .7152 * green + .0722 * blue
      }
      const first = luminance(foreground)
      const second = luminance(background)
      return (Math.max(first, second) + .05) / (Math.min(first, second) + .05)
    }
    const body = getComputedStyle(document.body)
    const muted = getComputedStyle(document.querySelector('.mode-label')!)
    const panel = getComputedStyle(document.querySelector('.panel')!)
    const requestContent = getComputedStyle(document.querySelector('.editor-content')!)
    const responseContent = getComputedStyle(document.querySelector('.response-content')!)
    const field = getComputedStyle(document.querySelector('.pair-row input:not([type=checkbox])')!)
    return {
      textContrast: contrast(body.color, body.backgroundColor),
      mutedContrast: contrast(muted.color, getComputedStyle(document.querySelector('.topbar')!).backgroundColor),
      panelBackground: panel.backgroundColor,
      pageBackground: body.backgroundColor,
      panelShadow: panel.boxShadow,
      requestContentBackground: requestContent.backgroundColor,
      responseContentBackground: responseContent.backgroundColor,
      fieldShadow: field.boxShadow,
    }
  })
  expect(light.textContrast).toBeGreaterThanOrEqual(7)
  expect(light.mutedContrast).toBeGreaterThanOrEqual(4.5)
  expect(light.panelBackground).not.toBe(light.pageBackground)
  expect(light.panelShadow).not.toBe('none')
  expect(light.requestContentBackground).toBe(light.responseContentBackground)
  expect(light.requestContentBackground).not.toBe(light.panelBackground)
  expect(light.fieldShadow).not.toBe('none')

  await page.getByTitle('Toggle theme').click()
  await expect(page.locator('.panel').first()).toHaveCSS('box-shadow', 'none')
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
