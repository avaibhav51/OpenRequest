import { expect, test } from '@playwright/test'

async function expectDocumentFitsViewport(page: import('@playwright/test').Page) {
  const dimensions = await page.evaluate(() => ({
    clientHeight: document.documentElement.clientHeight,
    clientWidth: document.documentElement.clientWidth,
    scrollHeight: document.documentElement.scrollHeight,
    scrollWidth: document.documentElement.scrollWidth,
    viewportHeight: window.innerHeight,
    viewportWidth: window.innerWidth
  }))
  expect(dimensions.scrollHeight).toBeLessThanOrEqual(dimensions.viewportHeight + 1)
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.viewportWidth + 1)
  expect(dimensions.clientHeight).toBe(dimensions.viewportHeight)
  expect(dimensions.clientWidth).toBe(dimensions.viewportWidth)
}

test('empty tablet portrait workspace fits and the vertical split is keyboard-resizable', async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1180 })
  await page.goto('./')
  await expectDocumentFitsViewport(page)

  const requestPanel = page.locator('.request-editor')
  const responsePanel = page.locator('.response-panel')
  const separator = page.getByRole('separator', { name: 'Resize request and response panels' })
  await expect(separator).toHaveAttribute('aria-orientation', 'horizontal')
  const before = await requestPanel.boundingBox()
  await separator.focus()
  await separator.press('ArrowDown')
  const after = await requestPanel.boundingBox()
  expect(after!.height).toBeGreaterThan(before!.height)
  expect((await responsePanel.boundingBox())!.y + (await responsePanel.boundingBox())!.height).toBeLessThanOrEqual(1180)
})

test('mobile portrait workspace and sidebar footer stay inside the visible viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('./')
  await expectDocumentFitsViewport(page)

  await page.getByRole('button', { name: 'Open menu' }).click()
  const sidebar = page.locator('.sidebar')
  const developerLink = page.getByRole('link', { name: /Vaibhav Agarwal/ })
  await expect(sidebar).toBeVisible()
  await expect(developerLink).toBeVisible()
  const bounds = await sidebar.boundingBox()
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(844)
  await expectDocumentFitsViewport(page)
})

test('small request panes reveal the Scripts tab and keep script sections separated', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.goto('./')
  const separator = page.getByRole('separator', { name: 'Resize request and response panels' })
  await separator.focus()
  for (let index = 0; index < 8; index += 1) await separator.press('ArrowLeft')

  const scriptsTab = page.getByRole('button', { name: /^scripts/i })
  await scriptsTab.click()
  await expect(scriptsTab).toBeInViewport()
  const panelBounds = await page.locator('.request-editor').boundingBox()
  const tabBounds = await scriptsTab.boundingBox()
  expect(tabBounds!.x + tabBounds!.width).toBeLessThanOrEqual(panelBounds!.x + panelBounds!.width)

  await page.setViewportSize({ width: 900, height: 500 })
  await expect(separator).toHaveAttribute('aria-orientation', 'horizontal')
  await separator.focus()
  for (let index = 0; index < 8; index += 1) await separator.press('ArrowUp')

  const beforeHeading = page.getByText('Before request', { exact: true })
  const afterHeading = page.getByText('After response', { exact: true })
  const beforeBounds = await beforeHeading.boundingBox()
  const afterBounds = await afterHeading.boundingBox()
  expect(afterBounds!.y).toBeGreaterThan(beforeBounds!.y + beforeBounds!.height)
  const editorOverflow = await page.locator('.editor-content').evaluate((element) => ({ client: element.clientHeight, scroll: element.scrollHeight }))
  expect(editorOverflow.scroll).toBeGreaterThan(editorOverflow.client)
})
