import { expect, test } from '@playwright/test'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { login, openProject } from './helpers'

// Not part of `test:e2e`. Records the owner editing a project (edit, autosave, version history,
// schedule dialog) into docs/media/editing-demo.webm. Run it with `pnpm --filter cms record:demo`.
const OUTPUT = resolve(import.meta.dirname, '../../../../docs/media/editing-demo.webm')
const SIZE = { width: 1280, height: 800 }
const pause = (page: { waitForTimeout: (ms: number) => Promise<void> }, ms = 1500) => page.waitForTimeout(ms)

test('record the owner editing walkthrough', async ({ browser, baseURL }) => {
  const videoDir = mkdtempSync(join(tmpdir(), 'portfolio-recording-'))
  const context = await browser.newContext({
    baseURL,
    viewport: SIZE,
    recordVideo: { dir: videoDir, size: SIZE },
  })
  const page = await context.newPage()
  const video = page.video()!

  try {
    // Sign in off camera as far as possible: the recording starts at the dashboard.
    await login(page, 'owner')
    await pause(page, 1000)

    // 1. Edit a project. Typing is slowed down so it reads on screen.
    await openProject(page, 'Sintel')
    await pause(page)
    const title = page.locator('#field-title')
    await title.click()
    await title.press('End')
    await title.pressSequentially(' (edited)', { delay: 120 })

    // 2. Autosave: the draft is saved without clicking anything.
    await expect(page.getByText(/Autosav|Saved|Last modified/i).first()).toBeVisible()
    await pause(page, 4000)

    // 3. Version history.
    await page.getByRole('link', { name: /^(Versions|Versioni)/ }).first().click()
    await expect(page).toHaveURL(/\/versions/)
    await pause(page, 3500)
    await page.goBack()
    await expect(page.locator('#field-title')).toBeVisible()
    await pause(page, 1000)

    // 4. Schedule dialog, opened and left without confirming.
    await page.locator('.doc-controls__controls .popup-button, .form-submit .popup-button').first().click().catch(() => {})
    const schedule = page.getByRole('button', { name: /Schedule publish|Pianifica pubblicazione/i })
    await schedule.first().click()
    await pause(page, 4000)
    await page.keyboard.press('Escape')
    await pause(page, 1000)
  } finally {
    await context.close()
  }

  mkdirSync(resolve(OUTPUT, '..'), { recursive: true })
  await video.saveAs(OUTPUT)
  rmSync(videoDir, { recursive: true, force: true })
})
