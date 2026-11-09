import { expect, test } from '@playwright/test'

import { login, openProject, webUrl } from './helpers'

const NOTICE = 'Modalità demo: le modifiche non vengono salvate'

test.describe('demo account', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, 'demo')
  })

  // Covers AE1.
  test('Save shows the demo notice, autosave stays silent and nothing is saved', async ({ page }) => {
    await openProject(page, 'Supernova')
    await page.locator('#field-title').fill('Supernova edited by demo')

    // Projects use drafts with autosave, so the save action is "Publish changes".
    await page.getByRole('button', { name: /^(Publish changes|Pubblica le modifiche)$/ }).click()
    await expect(page.locator('[data-sonner-toast]').filter({ hasText: /Demo mode|Modalità demo/ })).toBeVisible()

    // Past the autosave interval (800 ms default): no error toast, blocked autosaves are hidden.
    await page.waitForTimeout(4000)
    const visibleErrors = page.locator('[data-sonner-toast][data-type="error"]:visible')
    await expect(visibleErrors).toHaveCount(0)

    await page.reload()
    await expect(page.locator('#field-title')).toHaveValue('Supernova')
    await page.goto(webUrl() + '/projects/supernova')
    await expect(page.locator('main h3', { hasText: 'Supernova' })).toBeVisible()
  })

  test('hides users and form submissions, shows the banner and a disabled schedule control', async ({ page }) => {
    await expect(page.getByRole('status').filter({ hasText: /Demo mode|Modalità demo/ })).toBeVisible()

    await page.goto('/admin')
    await expect(page.getByRole('link', { name: 'Projects' }).first()).toBeAttached()
    await expect(page.getByRole('link', { name: /^(users|utenti)$/i })).toHaveCount(0)
    await expect(page.getByRole('link', { name: /form submissions/i })).toHaveCount(0)

    await openProject(page, 'Supernova')
    const schedule = page.getByRole('button', { name: /Schedule publish|Pianifica pubblicazione/ })
    await expect(schedule).toBeVisible()
    await expect(schedule).toBeDisabled()
  })
})

test.describe('owner', () => {
  test('publishing a title change shows on the public page after reload', async ({ page }) => {
    await login(page, 'owner')
    await openProject(page, 'Sintel')
    await page.locator('#field-title').fill('Sintel retitled')
    await page.getByRole('button', { name: 'Publish changes' }).click()
    await expect(page.locator('[data-sonner-toast]').filter({ hasText: /updated successfully/i })).toBeVisible()

    await page.goto(webUrl() + '/projects/sintel')
    await expect(page.locator('main h3', { hasText: 'Sintel retitled' })).toBeVisible()
  })
})
