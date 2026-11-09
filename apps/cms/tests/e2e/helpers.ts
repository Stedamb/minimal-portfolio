import { expect, type Page } from '@playwright/test'

export const cmsUrl = () => process.env.CMS_URL!
export const webUrl = () => process.env.WEB_URL!

export async function login(page: Page, who: 'owner' | 'demo') {
  const email = process.env[`${who.toUpperCase()}_EMAIL`]!
  const password = process.env[`${who.toUpperCase()}_PASSWORD`]!
  await page.goto('/admin/login')
  await page.locator('#field-email').fill(email)
  await page.locator('#field-password').fill(password)
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page).toHaveURL(/\/admin\/?$/)
}

/** Opens the admin edit view of the seeded project with this title. Returns its id. */
export async function openProject(page: Page, title: string) {
  await page.goto('/admin/collections/projects')
  await page.getByRole('link', { name: title, exact: true }).first().click()
  await expect(page.locator('#field-title')).toHaveValue(title)
  return page.url().split('/').pop()!
}
