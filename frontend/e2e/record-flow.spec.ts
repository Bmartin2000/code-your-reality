import { expect, test } from '@playwright/test'
import path from 'node:path'

const VIDEO = path.resolve('e2e', 'fixtures', 'workshop-loan.mp4')

// Regression: when the analysis is refused right after the upload (e.g. the plan's monthly limit),
// the saved recording must open on its project page with the reason, and survive a reload.
test('a refused analysis after upload lands on the saved project, not back on an empty form', async ({ page }) => {
  await page.route('**/api/system/capabilities*', async (route) => {
    const res = await route.fetch()
    const body = await res.json()
    body.model = { ...body.model, reachable: true, installed: true, vision: true, error: null }
    await route.fulfill({ response: res, json: body })
  })
  await page.route('**/api/projects/*/analyze', (route) =>
    route.fulfill({
      status: 402,
      json: { error: { message: 'The Free demo plan includes 3 video analyses a month. Upgrade for more.', upgrade: true, feature: 'analyses' } },
    }),
  )

  await page.goto('/studio/new')
  await page.locator('input[type=file]:not([capture])').setInputFiles(VIDEO)
  await page.getByRole('button', { name: 'Create my app' }).click()

  await expect(page).toHaveURL(/\/studio\/projects\/[a-z0-9]+$/, { timeout: 20_000 })
  await expect(page.getByRole('heading', { name: 'Your video is saved.' })).toBeVisible()
  await expect(page.getByRole('alert')).toContainText('3 video analyses a month')
  await expect(page.getByRole('link', { name: 'See Plus' })).toBeVisible()

  await page.reload()
  await expect(page.getByRole('heading', { name: 'Your video is saved.' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Analyze now' })).toBeVisible()
})
