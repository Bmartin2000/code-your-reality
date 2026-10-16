import { expect, test } from '@playwright/test'

test('guided sample: review, build, operate a rental cycle, download', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Show your work.')
  await page.getByRole('link', { name: 'Try the demo' }).first().click()

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
