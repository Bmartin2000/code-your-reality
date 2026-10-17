import { expect, test } from '@playwright/test'
import { ADMIN } from './admin'

test.describe('signed out', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('the Studio asks for sign-in, wrong passwords are refused, then it opens', async ({ page }) => {
    await page.goto('/studio/apps')
    await expect(page).toHaveURL(/\/login\?next=%2Fstudio%2Fapps/)
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
    await expect(page.getByText('Ask your admin to add you')).toBeVisible()

    await page.getByLabel('Email').fill(ADMIN.email)
    await page.getByLabel('Password').fill('not-the-password')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByRole('alert')).toContainText('Wrong email or password')

    await page.getByLabel('Password').fill(ADMIN.password)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page).toHaveURL(/\/studio\/apps$/)
  })
})

test('admin adds a user who can then sign in', async ({ page, browser }) => {
  await page.goto('/studio/settings')
  await expect(page.getByText('Signed in as')).toBeVisible()
  await page.getByRole('link', { name: 'Users' }).click()
  await expect(page.getByRole('heading', { name: 'Users', level: 1 })).toBeVisible()
  const email = `sam-${Date.now()}@e2e.test`
  const form = page.locator('form')
  await form.getByLabel('Name').fill('Sam')
  await form.getByLabel('Email').fill(email)
  await form.getByLabel('Password').fill('sam-password')
  await form.getByRole('button', { name: 'Add user' }).click()
  await expect(page.getByText(email)).toBeVisible()

  const other = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const sam = await other.newPage()
  await sam.goto('/login')
  await sam.getByLabel('Email').fill(email)
  await sam.getByLabel('Password').fill('sam-password')
  await sam.getByRole('button', { name: 'Sign in' }).click()
  await expect(sam).toHaveURL(/\/studio$/)
  await sam.goto('/studio/users') // not an admin: sent back to the Studio home
  await expect(sam).toHaveURL(/\/studio$/)
  await other.close()
})
