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

async function readLocalRows<T>(page: import('@playwright/test').Page, table: string): Promise<T[]> {
  return page.evaluate((table) => new Promise<T[]>((resolve, reject) => {
    const opening = indexedDB.open('open-request-workbench')
    opening.onerror = () => reject(opening.error)
    opening.onsuccess = () => {
      const database = opening.result
      const reading = database.transaction(table, 'readonly').objectStore(table).getAll()
      reading.onerror = () => { database.close(); reject(reading.error) }
      reading.onsuccess = () => { database.close(); resolve(reading.result) }
    }
  }), table)
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

test('preserves unsaved edits when reopening a saved request and persists saved tab details', async ({ page }) => {
  await page.getByLabel('Request URL').fill(apiUrl)
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Save request' })
  await dialog.getByLabel('Request name').fill('Preserved request')
  await dialog.getByLabel('Collection').selectOption({ label: 'test-apis-public' })
  await dialog.getByRole('button', { name: 'Save locally' }).click()
  await expect(page.locator('.request-tabs')).toContainText('Preserved request')
  await page.reload()
  await expect(page.getByLabel('Request name')).toHaveValue('Preserved request')
  const savedQueue = await readSyncOutbox(page)

  const editedUrl = `${apiUrl}&draft=keep`
  await page.getByLabel('Request URL').fill(editedUrl)
  await page.getByRole('button', { name: 'New request tab' }).click()
  await openSidebarIfNeeded(page)
  await page.locator('.sidebar').getByRole('button', { name: 'GET Preserved request' }).click()
  await expect(page.getByLabel('Request URL')).toHaveValue(editedUrl)
  await expect(page.locator('.request-tabs > div')).toHaveCount(2)
  expect(await readSyncOutbox(page)).toEqual(savedQueue)
  await page.reload()
  await expect(page.getByLabel('Request URL')).toHaveValue(editedUrl)

  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await page.getByRole('dialog', { name: 'Save request' }).getByRole('button', { name: 'Save locally' }).click()
  await page.reload()
  await expect(page.getByLabel('Request URL')).toHaveValue(editedUrl)
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

test('marks unsaved work and confirms close or revert without changing the saved copy', async ({ page }) => {
  const activeTab = page.locator('.request-tabs > div.active')
  await expect(activeTab).toHaveAttribute('data-dirty', 'false')
  // Untouched empty tabs close immediately without a discard prompt.
  page.once('dialog', () => { throw new Error('Blank tab must not prompt') })
  await page.getByRole('button', { name: 'Close Untitled request', exact: true }).click()
  page.removeAllListeners('dialog')
  await page.getByLabel('Request name').fill('Draft safeguards')
  await page.getByLabel('Request URL').fill(apiUrl)
  await expect(activeTab).toHaveAttribute('data-dirty', 'true')
  await expect(page.locator('.draft-status')).toContainText('not synced')
  page.once('dialog', (dialog) => dialog.dismiss())
  await page.getByRole('button', { name: 'Close Draft safeguards', exact: true }).click()
  await expect(page.getByLabel('Request URL')).toHaveValue(apiUrl)
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await page.getByRole('dialog', { name: 'Save request' }).getByRole('button', { name: 'Save locally' }).click()
  await expect(activeTab).toHaveAttribute('data-dirty', 'false')
  await expect(page.getByRole('button', { name: 'Revert request' })).toBeDisabled()
  const savedQueue = await readSyncOutbox(page)
  await page.getByLabel('Request URL').fill(`${apiUrl}&draft=1`)
  page.once('dialog', (dialog) => dialog.dismiss())
  await page.getByRole('button', { name: 'Revert request' }).click()
  await expect(page.getByLabel('Request URL')).toHaveValue(`${apiUrl}&draft=1`)
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Revert request' }).click()
  await expect(page.getByLabel('Request URL')).toHaveValue(apiUrl)
  await expect(activeTab).toHaveAttribute('data-dirty', 'false')
  await page.reload()
  await expect(page.getByLabel('Request URL')).toHaveValue(apiUrl)
  await page.getByLabel('Request URL').fill(`${apiUrl}&draft=2`)
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Close Draft safeguards', exact: true }).click()
  await expect(page.locator('.request-tab-main').filter({ hasText: 'Draft safeguards' })).toHaveCount(0)
  expect(await readSyncOutbox(page)).toEqual(savedQueue)
  await openSidebarIfNeeded(page)
  await page.locator('.sidebar').getByText('Draft safeguards', { exact: true }).click()
  await expect(page.getByLabel('Request URL')).toHaveValue(apiUrl)
  await page.getByRole('button', { name: 'New', exact: true }).click()
  await page.getByLabel('Request name').fill('Discarded local only')
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Close Discarded local only', exact: true }).click()
  await expect(page.locator('.request-tab-main').filter({ hasText: 'Discarded local only' })).toHaveCount(0)
  await page.reload()
  await expect(page.locator('.request-tab-main').filter({ hasText: 'Discarded local only' })).toHaveCount(0)
})

test.describe('request response ownership', () => {
// Route-gated requests must not bypass Playwright via the PWA service worker.
test.use({ serviceWorkers: 'block' })

test('applies script field edits only to outgoing requests and scopes persistent writes to the sending environment', async ({ page }) => {
  let release!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  let calls = 0
  await page.route('**/__fixtures/script-mutations?**', async (route) => {
    calls++
    const url = new URL(route.request().url())
    expect(url.searchParams.has('obsolete')).toBe(false)
    expect(url.searchParams.get('keep')).toBe('yes')
    expect(url.searchParams.get('page')).toBe('2')
    expect(route.request().postDataJSON()).toEqual({ data: { name: 'before' } })
    await gate
    await route.fulfill({ contentType: 'application/json', body: '{"token":"remote"}' })
  })
  const originalUrl = `http://127.0.0.1:${e2ePort}/OpenRequest/__fixtures/script-mutations?obsolete=1&obsolete=2&keep=yes#fragment`
  await page.getByLabel('Request URL').fill(originalUrl)
  await page.getByLabel('HTTP method').selectOption('POST')
  await page.locator('.request-editor').getByRole('button', { name: /^body/i }).click()
  await page.getByRole('button', { name: 'JSON', exact: true }).click()
  const originalBody = '{"deprecated":true,"data":{"name":"original"}}'
  await page.locator('.body-editor textarea').fill(originalBody)
  await page.locator('.request-editor').getByRole('button', { name: /^scripts/i }).click()
  const pre = 'environment-set token = before\nquery page = 2\nquery-remove obsolete\nbody data.name = "{{token}}"\nbody-remove deprecated'
  await page.getByLabel('Before request').fill(pre)
  await page.getByLabel('After response').fill('environment-set transient = value\ncapture token = json.token\nenvironment-unset transient')
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await expect.poll(() => calls).toBe(1)
  await page.getByTitle('Manage isolated environments').click()
  await page.getByLabel('New environment name').fill('Other')
  await page.getByRole('button', { name: 'Add tag' }).click()
  await page.getByRole('button', { name: 'Done', exact: true }).click()
  release()
  await expect(page.locator('.response-meta b')).toHaveText('200 OK')
  let variables = await readLocalRows<{ key: string; value: string; environmentId: string; secret: boolean; enabled: boolean }>(page, 'variables')
  const environments = await readLocalRows<{ id: string; name: string }>(page, 'environments')
  const local = environments.find((environment) => environment.name === 'Local')!.id
  const other = environments.find((environment) => environment.name === 'Other')!.id
  expect(variables).toEqual([expect.objectContaining({ key: 'token', value: 'remote', environmentId: local, secret: true, enabled: true })])
  await expect(page.getByLabel('Request URL')).toHaveValue(originalUrl)
  await page.locator('.request-editor').getByRole('button', { name: /^body/i }).click()
  await expect(page.locator('.body-editor textarea')).toHaveValue(originalBody)
  await page.locator('.request-editor').getByRole('button', { name: /^scripts/i }).click()
  await page.getByLabel('After response').fill('environment-set token = other')
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await expect.poll(async () => (await readLocalRows<{ value: string; environmentId: string }>(page, 'variables')).find((row) => row.environmentId === other)?.value).toBe('other')
  await page.getByLabel('After response').fill('environment-unset token')
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await expect.poll(async () => (await readLocalRows(page, 'variables')).length).toBe(1)
  variables = await readLocalRows(page, 'variables')
  expect(variables[0]).toMatchObject({ value: 'remote', environmentId: local })
  await page.getByLabel('Before request').fill('environment-set shouldNotPersist = value\nbody __proto__.polluted = true')
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(page.getByText('Request could not be sent')).toBeVisible()
  expect(await readLocalRows(page, 'variables')).toEqual(variables)
  expect(calls).toBe(3)
  expect(await readSyncOutbox(page)).toEqual([])
  await page.reload()
  expect(await readLocalRows(page, 'variables')).toEqual(variables)
})

test('resizes script sections with local persistence and keeps small panes usable', async ({ page, isMobile }) => {
  if (!isMobile) await page.setViewportSize({ width: 1280, height: 1000 })
  await page.locator('.request-editor').getByRole('button', { name: /^scripts/i }).click()
  const divider = page.getByRole('separator', { name: 'Resize before and after scripts' })
  const before = page.getByLabel('Before request', { exact: true })
  const after = page.getByLabel('After response', { exact: true })
  await before.fill('log "Before unchanged"')
  await after.fill('assert status == 200')
  if (isMobile) {
    await expect(divider).toBeHidden()
    await after.scrollIntoViewIfNeeded()
    await expect(after).toBeVisible()
    await page.locator('.script-field').last().getByRole('button', { name: 'Insert command' }).click()
    await expect(page.locator('.script-suggestions')).toBeVisible()
    return
  }
  await divider.focus()
  await divider.press('ArrowDown')
  await expect(divider).toHaveAttribute('aria-valuenow', '55')
  const beforeHeight = (await page.locator('.script-field').first().boundingBox())!.height
  const afterHeight = (await page.locator('.script-field').last().boundingBox())!.height
  expect(beforeHeight).toBeGreaterThan(afterHeight)
  await page.reload()
  await page.locator('.request-editor').getByRole('button', { name: /^scripts/i }).click()
  await expect(divider).toHaveAttribute('aria-valuenow', '55')
  await expect(before).toHaveValue('log "Before unchanged"')
  await expect(after).toHaveValue('assert status == 200')
  await divider.dblclick()
  await expect(divider).toHaveAttribute('aria-valuenow', '50')
  const bounds = (await divider.boundingBox())!
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
  await page.mouse.down()
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y - 500, { steps: 5 })
  await page.mouse.up()
  expect(Number(await divider.getAttribute('aria-valuenow'))).toBeLessThan(50)
  for (const field of await page.locator('.script-field').all()) expect((await field.boundingBox())!.height).toBeGreaterThanOrEqual(139)
  await page.locator('.script-field').first().getByRole('button', { name: 'Insert command' }).click()
  await page.locator('.script-suggestions').getByRole('button', { name: /^sleep / }).click()
  await expect(before).toHaveValue('log "Before unchanged"\nsleep 3000')
  await divider.press('Home')
  await expect(divider).toHaveAttribute('aria-valuenow', '50')
  await page.setViewportSize({ width: 800, height: 480 })
  await after.scrollIntoViewIfNeeded()
  await expect(after).toBeVisible()
  for (const field of await page.locator('.script-field').all()) expect((await field.boundingBox())!.height).toBeGreaterThanOrEqual(139)
})

test('discovers script commands without executing or exposing variable values', async ({ page }) => {
  let sends = 0
  await page.route('**/__fixtures/suggestions', async (route) => { sends += 1; await route.fulfill({ body: '{}' }) })
  await page.getByLabel('Request URL').fill(`http://127.0.0.1:${e2ePort}/OpenRequest/__fixtures/suggestions`)
  await page.locator('.request-editor').getByRole('button', { name: /^scripts/i }).click()
  const before = page.getByLabel('Before request', { exact: true })
  const after = page.getByLabel('After response', { exact: true })
  await before.fill('sle')
  await before.press('Enter')
  await expect(before).toHaveValue('sleep 3000')
  await before.fill('log "Keep this"')
  await page.locator('.script-field').first().getByRole('button', { name: 'Insert command' }).click()
  await page.locator('.script-suggestions').getByRole('button', { name: /^query Outgoing/ }).click()
  await expect(before).toHaveValue('log "Keep this"\nquery page = 1')
  await before.fill('variable id = {{$ran')
  await expect(page.locator('.script-suggestions')).toContainText('$randomUUID')
  await expect(page.locator('.script-suggestions')).toContainText('Variable name only')
  await before.press('Enter')
  await expect(before).toHaveValue('variable id = {{$randomUUID}}')
  await after.fill('assert')
  await after.press('Escape')
  await expect(page.locator('.script-suggestions')).toHaveCount(0)
  await after.press('Control+Space')
  await expect(page.locator('.script-suggestions')).not.toContainText('sleep')
  await expect(page.locator('.script-suggestions')).toContainText('Changes local environment')
  await after.press('ArrowDown')
  await after.press('Enter')
  await expect(after).toHaveValue('assert durationMs < 2000')
  await expect(page.locator('.script-report')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeEnabled()
  expect(sends).toBe(0)
})

test('reports every script check and masks logs while retaining later captures', async ({ page }) => {
  await page.route('**/__fixtures/script-checks', async (route) => route.fulfill({ contentType: 'application/json', body: '{"success":true,"message":"created","data":{"token":"private-token"}}' }))
  await page.getByLabel('Request URL').fill(`http://127.0.0.1:${e2ePort}/OpenRequest/__fixtures/script-checks`)
  await page.locator('.request-editor').getByRole('button', { name: /^scripts/i }).click()
  await expect(page.getByLabel('Before request')).toHaveAttribute('placeholder', /log "Preparing request"/)
  await expect(page.getByLabel('After response')).toHaveAttribute('placeholder', /assert durationMs/)
  await page.getByLabel('Before request').fill('log "Preparing request"')
  await page.getByLabel('After response').fill('assert status == 400\nassert status == 200\nassert durationMs < 5000\nassert header Content-Type contains "application/json"\nassert json.success == true\nassert body contains "created"\ncapture token = json.data.token\nlog "Captured {{token}} private-token"\nassert json.missing exists')
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(page.locator('.script-banner')).toContainText('5/7 checks passed')
  await expect(page.locator('.script-check')).toHaveCount(7)
  await expect(page.locator('.script-check.bad')).toHaveCount(2)
  await expect(page.locator('.script-check.ok')).toHaveCount(5)
  await expect(page.locator('.script-report-content')).toBeVisible()
  await expect(page.locator('.script-log').last()).toHaveText('Log: Captured [redacted] [redacted]')
  await expect(page.locator('.script-report')).not.toContainText('private-token')
  const variables = await readLocalRows<{ key: string; value: string }>(page, 'variables')
  expect(variables.find((variable) => variable.key === 'token')?.value).toBe('private-token')
  await page.getByLabel('After response').fill('assert status == 200')
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(page.locator('.script-banner')).toContainText('1/1 checks passed')
  await expect(page.locator('.script-check.bad')).toHaveCount(0)
  await page.locator('.script-banner').click()
  await expect(page.locator('.script-check')).toBeVisible()
  await page.locator('.script-intro').getByRole('button', { name: 'Quick reference' }).click()
  await expect(page.getByRole('dialog', { name: 'Quick reference' })).toContainText('assert durationMs < 2000')
})

test('sleeps before sending without blocking tab changes or changing response ownership', async ({ page }) => {
  let dispatchedAt = 0
  await page.route('**/__fixtures/sleep-run', async (route) => {
    dispatchedAt = Date.now()
    await route.fulfill({ contentType: 'application/json', body: '{"delayed":true}' })
  })
  await page.getByLabel('Request name').fill('Delayed request')
  await page.getByLabel('Request URL').fill(`http://127.0.0.1:${e2ePort}/OpenRequest/__fixtures/sleep-run`)
  await page.locator('.request-editor').getByRole('button', { name: /^scripts/i }).click()
  await page.getByLabel('Before request').fill('sleep 3000')
  const startedAt = Date.now()
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Sending', exact: true })).toBeDisabled()
  expect(dispatchedAt).toBe(0)
  await page.getByRole('button', { name: 'New', exact: true }).click()
  await expect(page.getByLabel('Request URL')).toHaveValue('')
  await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeVisible()
  await expect.poll(async () => (await readLocalRows(page, 'history')).length).toBe(1)
  expect(dispatchedAt - startedAt).toBeGreaterThanOrEqual(2900)
  await expect(page.getByText('Ready when you are')).toBeVisible()
  await page.locator('.request-tab-main').filter({ hasText: 'Delayed request' }).click()
  await expect(page.locator('.response-content')).toContainText('"delayed": true')
  await expect(page.locator('.script-report')).toContainText('Slept 3000 ms before sending')
})

test('keeps concurrent responses on their originating tabs and records the send-time snapshot', async ({ page }) => {
  let releaseA!: () => void
  let releaseB!: () => void
  const gateA = new Promise<void>((resolve) => { releaseA = resolve })
  const gateB = new Promise<void>((resolve) => { releaseB = resolve })
  await page.route('**/__fixtures/tab-owner?**', async (route) => {
    const owner = new URL(route.request().url()).searchParams.get('owner')!
    await (owner === 'original' ? gateA : gateB)
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ owner }) })
  })
  const base = `http://127.0.0.1:${e2ePort}/OpenRequest/__fixtures/tab-owner`
  await page.getByLabel('Request name').fill('Run A')
  await page.getByLabel('Request URL').fill(`${base}?owner={{sample}}`)
  await page.locator('.request-editor').getByRole('button', { name: /^scripts/i }).click()
  await page.getByLabel('Before request').fill('variable sample = original\nheader X-Run = {{sample}}')
  await page.getByLabel('After response').fill('capture runToken = json.owner')
  const sentA = page.waitForRequest((request) => request.url() === `${base}?owner=original`)
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  expect((await sentA).headers()['x-run']).toBe('original')
  await expect(page.locator('.request-tab-main').filter({ hasText: 'Run A' }).getByTitle('Request running')).toBeVisible()
  await page.getByLabel('Request URL').press('Enter')
  // Neither later edits nor the new active environment may change this run.
  await page.getByLabel('Request URL').fill(`${base}?owner=edited`)
  await page.getByLabel('After response').fill('assert status == 404')
  await page.getByTitle('Manage isolated environments').click()
  await page.getByLabel('New environment name').fill('Other')
  await page.getByRole('button', { name: 'Add tag' }).click()
  await page.getByRole('button', { name: 'Done', exact: true }).click()
  await page.getByRole('button', { name: 'New', exact: true }).click()
  await page.getByLabel('Request name').fill('Run B')
  await page.getByLabel('Request URL').fill(`${base}?owner=B`)
  await page.getByLabel('HTTP method').selectOption('POST')
  await page.locator('.request-editor').getByRole('button', { name: /^body/i }).click()
  await page.getByRole('button', { name: 'JSON', exact: true }).click()
  await page.locator('.body-editor textarea').fill('{"phase":"sent"}')
  await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeEnabled()
  const sentB = page.waitForRequest((request) => request.url() === `${base}?owner=B`)
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  expect((await sentB).postData()).toBe('{"phase":"sent"}')
  await page.locator('.body-editor textarea').fill('{"phase":"edited"}')
  releaseB()
  await expect(page.locator('.response-content')).toContainText('"owner": "B"')
  await page.locator('.request-tab-main').filter({ hasText: 'Run A' }).click()
  await expect(page.getByRole('button', { name: 'Sending', exact: true })).toBeDisabled()
  await expect(page.locator('.response-meta')).toHaveCount(0)
  await page.locator('.request-tab-main').filter({ hasText: 'Run B' }).click()
  releaseA()
  await expect.poll(async () => (await readLocalRows(page, 'history')).length).toBe(2)
  await expect(page.locator('.response-content')).toContainText('"owner": "B"')
  await page.locator('.request-tab-main').filter({ hasText: 'Run A' }).click()
  await expect(page.locator('.response-content')).toContainText('"owner": "original"')
  await expect(page.locator('.script-report')).toContainText('Captured runToken')
  await expect(page.locator('.request-tab-main').filter({ hasText: 'Run A' }).getByTitle('Request running')).toHaveCount(0)
  await expect(page.getByLabel('Request URL')).toHaveValue(`${base}?owner=edited`)
  const history = await readLocalRows<{ request: { name: string; url: string; headers: Array<{ key: string; value: string }>; body: string; method: string } }>(page, 'history')
  expect(history.find((entry) => entry.request.name === 'Run A')!.request).toMatchObject({ url: `${base}?owner=original`, headers: expect.arrayContaining([expect.objectContaining({ key: 'X-Run', value: 'original' })]) })
  expect(history.find((entry) => entry.request.name === 'Run B')!.request).toMatchObject({ method: 'POST', body: '{"phase":"sent"}' })
  const variables = await readLocalRows<{ key: string; value: string; environmentId: string }>(page, 'variables')
  const environments = await readLocalRows<{ id: string; name: string }>(page, 'environments')
  expect(variables.find((variable) => variable.key === 'runToken')).toMatchObject({ value: 'original', environmentId: environments.find((environment) => environment.name === 'Local')!.id })
  await page.getByRole('button', { name: 'Clear response' }).click()
  await expect(page.getByText('Ready when you are')).toBeVisible()
  await page.locator('.request-tab-main').filter({ hasText: 'Run B' }).click()
  await expect(page.locator('.response-content')).toContainText('"owner": "B"')
  expect(await readSyncOutbox(page)).toEqual([])
})

test('keeps errors local to their originating tab and rejects stale closed-tab completions', async ({ page }) => {
  let release!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  const url = `http://127.0.0.1:${e2ePort}/OpenRequest/__fixtures/closed-run`
  await page.route('**/__fixtures/closed-run', async (route) => {
    await gate
    await route.fulfill({ contentType: 'application/json', body: '{"closed":"old result"}' })
  })
  await page.getByLabel('Request name').fill('Closing run')
  await page.getByLabel('Request URL').fill(url)
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await page.getByRole('dialog', { name: 'Save request' }).getByRole('button', { name: 'Save locally' }).click()
  const sent = page.waitForRequest(url)
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await sent
  await page.getByRole('button', { name: 'Close Closing run', exact: true }).click()
  await expect(page.locator('.request-tab-main').filter({ hasText: 'Closing run' })).toHaveCount(0)
  await openSidebarIfNeeded(page)
  await page.locator('.sidebar').getByText('Closing run', { exact: true }).click()
  release()
  await expect.poll(async () => (await readLocalRows(page, 'history')).length).toBe(1)
  await expect(page.getByText('Ready when you are')).toBeVisible()
  await page.getByLabel('Request URL').fill('not-a-valid-url')
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(page.getByText('Request could not be sent')).toBeVisible()
  await page.getByRole('button', { name: 'New', exact: true }).click()
  await expect(page.getByText('Ready when you are')).toBeVisible()
  await page.getByLabel('Request URL').fill(apiUrl)
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(page.locator('.response-meta b')).toHaveText('200 OK')
  await page.locator('.request-tab-main').filter({ hasText: 'Closing run' }).click()
  await expect(page.getByText('Request could not be sent')).toBeVisible()
  await expect(page.locator('.response-meta')).toHaveCount(0)
})

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
