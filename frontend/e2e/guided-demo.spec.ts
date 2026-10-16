import { expect, test } from '@playwright/test'

test('guided sample: review, approve, compile, operate a rental cycle', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('The world is your')
  await page.getByRole('link', { name: 'Experience the Demo' }).click()

  // Understand: sample data is labelled and evidence is shown.
  await expect(page.getByText('Sample data').first()).toBeVisible()
  await expect(page.getByText('Illustrated storyboard · sample')).toBeVisible()
  await page.getByRole('button', { name: /Confirm \d+ with evidence/ }).click()
  await expect(page.getByText(/Saved · v2/)).toBeVisible()

  // Verify: decide the remaining inferences, then approve.
  await page.getByRole('link', { name: /Verify & approve/ }).click()
  const pending = page.locator('li.surface')
  await expect(pending.first()).toBeVisible()
  while ((await pending.count()) > 0) {
    const row = pending.first()
    const isNote = (await row.textContent())?.includes('Late returns')
    await row.getByRole('button', { name: isNote ? 'Reject' : 'Confirm' }).click()
    await page.waitForTimeout(150)
  }
  await expect(page.getByText('Ready for approval.')).toBeVisible({ timeout: 10_000 })
  await page.getByRole('button', { name: 'Approve workflow' }).click()

  // Compile: real compiler stages, then open the generated app.
  await page.getByRole('button', { name: 'Compile Application' }).click()
  await expect(page.getByText('Application ready')).toBeVisible()
  await page.getByRole('link', { name: 'Open application' }).first().click()

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
  const camera = page.getByRole('row', { name: /Canon EOS R6 body/ })
  await expect(camera.getByText('Rented')).toBeVisible()
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
