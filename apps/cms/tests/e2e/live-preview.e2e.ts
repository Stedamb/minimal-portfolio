import { expect, test } from '@playwright/test'

import { login, openProject, webUrl } from './helpers'

// Covers F3 / AE2.
test('demo sees unsaved edits in the live preview; the public page keeps the old title', async ({ page, context }) => {
  await login(page, 'demo')
  await openProject(page, 'Big Buck Bunny')

  await page.locator('#live-preview-toggler').click()
  const frame = page.frameLocator('iframe#live-preview-iframe')
  await expect(frame.locator('main h3', { hasText: 'Big Buck Bunny' })).toBeVisible({ timeout: 30_000 })

  await page.locator('#field-title').fill('Typed in the demo')
  await expect(frame.locator('main h3', { hasText: 'Typed in the demo' })).toBeVisible({ timeout: 2_000 })

  const publicPage = await context.newPage()
  await publicPage.goto(webUrl() + '/projects/big-buck-bunny')
  await expect(publicPage.locator('main h3', { hasText: 'Big Buck Bunny' })).toBeVisible()
  await expect(publicPage.getByText('Typed in the demo')).toHaveCount(0)
})
