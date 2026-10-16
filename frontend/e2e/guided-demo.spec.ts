import { expect, test } from '@playwright/test'

test('guided sample: review, build, operate a rental cycle, download', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Film how you work.')
  await page.getByRole('link', { name: 'See a ready example' }).first().click()

  // Simple review: the example is labelled, the AI-guessed rule is left out.
  await expect(page.getByRole('heading', { name: 'Here’s what we understood.' })).toBeVisible()
  await expect(page.getByText('Example', { exact: true })).toBeVisible()
  const lateFee = page.getByRole('switch', { name: /Late returns may incur a fee/ })
  await lateFee.click()
  await expect(lateFee).toHaveAttribute('aria-checked', 'false')
  await page.getByRole('button', { name: 'Build my app' }).click()

  // Ready: link, download, re-record and small changes are offered.
  await expect(page.getByRole('heading', { name: 'Your app is ready.' })).toBeVisible({ timeout: 20_000 })
  await expect(page.getByRole('button', { name: 'Record again' })).toBeVisible()
  await expect(page.getByLabel('Ask for a small change')).toBeVisible()
  const download = page.getByRole('link', { name: 'Download' })
  const zip = await page.request.get((await download.getAttribute('href'))!)
  expect(zip.headers()['content-type']).toBe('application/zip')
  await page.getByRole('link', { name: 'Open my app' }).click()

  // Operate.
  await page.getByRole('button', { name: 'Add sample records' }).click()
  await expect(page.getByText('Sample records added')).toBeVisible()
  await page.getByRole('button', { name: 'New rental' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel(/^Item/).selectOption({ label: 'Canon EOS R6 body · ITE-0001' })
  await dialog.getByLabel(/^Customer/).selectOption({ index: 1 })
  const due = new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10)
  await dialog.getByLabel(/Expected return/).fill(due)
  await dialog.getByLabel(/Deposit/).fill('250')
  await dialog.getByRole('button', { name: 'Create rental' }).click()
  await expect(page.getByText(/availability available → rented/).first()).toBeVisible()

  // The item is now rented; renting it again is rejected by the server.
  await page.getByRole('link', { name: 'Inventory' }).first().click()
  await expect(page.getByRole('row', { name: /Canon EOS R6 body/ }).getByText('Rented')).toBeVisible()
  await page.getByRole('link', { name: 'Rentals' }).first().click()
  await page.getByRole('button', { name: 'New', exact: true }).click()
  await page.getByRole('dialog').getByLabel(/^Item/).selectOption({ label: 'Canon EOS R6 body · ITE-0001 — rented' })
  await page.getByRole('dialog').getByLabel(/^Customer/).selectOption({ index: 2 })
  await page.getByRole('dialog').getByLabel(/Expected return/).fill(due)
  await page.getByRole('dialog').getByLabel(/Deposit/).fill('80')
  await page.getByRole('dialog').getByRole('button', { name: 'Create rental' }).click()
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Rule enforced')
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click()

  // Complete the return: the item is released.
  await page.getByRole('row', { name: /Canon EOS R6 body/ }).getByRole('button', { name: 'Complete return' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Complete return' }).click()
  await expect(page.getByRole('status').getByText(/Complete return · REN-0001/)).toBeVisible()

  // Persistence across reload.
  await page.reload()
  await expect(page.getByRole('row', { name: /REN-0001/ }).getByText('Returned')).toBeVisible()
  await page.getByRole('link', { name: 'Inventory' }).first().click()
  await expect(page.getByRole('row', { name: /Canon EOS R6 body/ }).getByText('Available')).toBeVisible()
})

test('advanced editor is still reachable', async ({ page }) => {
  await page.goto('/demo')
  await page.getByRole('link', { name: 'Open the advanced editor' }).click()
  await expect(page.getByText('Illustrated storyboard · sample')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Simple view' })).toBeVisible()
})

test('upgrade to Plus: reports, connections and a private team app', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('/demo')
  await page.getByRole('button', { name: 'Build my app' }).click()
  await expect(page.getByRole('heading', { name: 'Your app is ready.' })).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText('Like it? Make it your team’s system.')).toBeVisible()
  await page.getByRole('link', { name: 'Open my app' }).click()
  await page.getByRole('button', { name: 'Add sample records' }).click()
  await page.getByRole('link', { name: /Reports/ }).first().click()
  await expect(page.getByText('See how your business is doing')).toBeVisible()
  const reportsUrl = page.url()

  // Demo checkout: no card data, nothing charged.
  await page.getByRole('link', { name: /Upgrade to Plus/ }).first().click()
  await expect(page.getByText('Demo checkout.', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: 'Activate Plus' }).click()
  await expect(page.getByText('Enter your company name.')).toBeVisible()
  await page.getByLabel('Company name').fill('Rent & Go Kft.')
  await page.getByLabel('Billing email').fill('owner@example.com')
  await page.getByRole('button', { name: 'Activate Plus' }).click()
  await expect(page.getByRole('heading', { name: 'Plus is active.' })).toBeVisible()

  // Reports now work.
  await page.goto(reportsUrl)
  await expect(page.getByText('Mistakes prevented')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Inventory' })).toBeVisible()

  // Connections: calendar feed offered.
  await page.getByRole('link', { name: /Connections/ }).first().click()
  await expect(page.getByText('Calendar (Google, Outlook, Apple)')).toBeVisible()

  // Team: make the app private and add a viewer.
  await page.getByRole('link', { name: /Team/ }).first().click()
  await page.getByRole('button', { name: 'Make private and add people' }).click()
  await expect(page.getByText('Owner · Everything')).toBeVisible()
  await page.getByLabel('Name').fill('Béla')
  await page.getByLabel('Role').selectOption('viewer')
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(page.getByText('Viewer · Look only')).toBeVisible()
  const link = await page.evaluate(() => navigator.clipboard.readText())
  expect(link).toContain('?key=')

  // A fresh browser without the key sees the sign-in screen; the viewer link opens read-only.
  const other = await context.browser()!.newContext()
  const guest = await other.newPage()
  await guest.goto(page.url().replace(/\/team$/, ''))
  await expect(guest.getByText('This app is private.')).toBeVisible()
  await guest.goto(link)
  await expect(guest.getByText('Béla · Viewer')).toBeVisible()
  await expect(guest.getByRole('button', { name: 'New rental' })).toHaveCount(0)
  await other.close()
})
