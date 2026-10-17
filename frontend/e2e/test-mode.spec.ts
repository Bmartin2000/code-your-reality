import { expect, test } from '@playwright/test'

// Runs after the other suites (its own project): it changes what the shared E2E admin experiences.
test('the founding admin switches Subscription Test Mode between Free and Plus', async ({ page, browser }) => {
  await page.goto('/studio/settings')
  const card = page.getByRole('region', { name: 'Subscription Test Mode' })
  const testingAs = card.getByRole('radiogroup', { name: 'Testing as' })

  await testingAs.getByRole('radio', { name: 'Free' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Subscription Test Mode' })).toContainText('as Free demo')
  await expect(card).toContainText('of 3 video analyses used this month')
  await expect(page.getByRole('link', { name: 'Upgrade to Plus' })).toBeVisible()

  // Upgrade prompts are shown, but checkout can't change the real plan while testing.
  await page.getByRole('link', { name: 'Upgrade to Plus' }).click()
  await expect(page.getByText('checkout is off')).toBeVisible()
  await expect(page.getByRole('button', { name: /Activate/ })).toBeDisabled()

  await page.goto('/studio/settings')
  await testingAs.getByRole('radio', { name: 'Plus' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Subscription Test Mode' })).toContainText('as Plus')
  await expect(card).toContainText('of 30 video analyses used this month')
  await expect(testingAs.getByRole('radio', { name: 'Plus' })).toHaveAttribute('aria-checked', 'true')

  // Another admin has no Test Mode and keeps the real plan.
  const other = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const admin2 = await other.newPage()
  const email = `admin2-${Date.now()}@e2e.test`
  await page.request.post('/api/users', { data: { name: 'Second admin', email, password: 'admin2-password', role: 'admin' } })
  await admin2.request.post('/api/auth/login', { data: { email, password: 'admin2-password' } })
  await admin2.goto('/studio/settings')
  await expect(admin2.getByText('Signed in as')).toBeVisible()
  await expect(admin2.getByRole('region', { name: 'Subscription Test Mode' })).toHaveCount(0)
  await expect(admin2.getByRole('status').filter({ hasText: 'Subscription Test Mode' })).toHaveCount(0)
  await other.close()

  await card.getByRole('button', { name: 'Turn off' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Subscription Test Mode' })).toHaveCount(0)
})
