import { expect, test } from '@playwright/test'

import { webUrl } from './helpers'

// The stack was started by the root command (global setup) on an empty database
// directory and the env example, so a rendered homepage proves migrate + seed + both apps worked.
test('the seeded homepage renders after the one-command setup', async ({ page }) => {
  const response = await page.goto(webUrl() + '/')
  expect(response?.status()).toBe(200)
  await expect(page.getByRole('heading', { name: 'Supernova', level: 4 })).toBeAttached()
})

test('the admin login page is served', async ({ page }) => {
  await page.goto('/admin/login')
  await expect(page.locator('#field-email')).toBeVisible()
})
