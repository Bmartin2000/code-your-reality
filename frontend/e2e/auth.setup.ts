import { expect, test as setup } from '@playwright/test'

import { ADMIN, STATE } from './admin'

// The test backend starts with an empty database: the first registered user becomes the admin.
setup('register the first user (admin)', async ({ page }) => {
  await page.goto('/studio')
  await expect(page).toHaveURL(/\/login/)
  await expect(page.getByRole('heading', { name: 'Create the admin account' })).toBeVisible()
  await page.getByLabel('Name').fill(ADMIN.name)
  await page.getByLabel('Email').fill(ADMIN.email)
  await page.getByLabel('Password').fill(ADMIN.password)
  await page.getByRole('button', { name: 'Create admin account' }).click()
  await expect(page).toHaveURL(/\/studio$/)
  await page.context().storageState({ path: STATE })
})
