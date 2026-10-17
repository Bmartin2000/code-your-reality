import { expect, test } from '@playwright/test'

// Runs after the other suites (its own project): it upgrades the shared workspace to Plus.
// Nothing here talks to the real Számlázz.hu: invoices stay drafts, and the connection is removed again.
test('subscription invoices for the owner and invoicing customers from the app', async ({ page }) => {
  await page.request.post('/api/account/plan', { data: { plan: 'free' } })

  // Subscribe to Plus: the first period's invoice appears as a draft.
  await page.goto('/studio/upgrade?plan=plus')
  await page.getByLabel('Company name').fill('Rent & Go Kft.')
  await page.getByLabel('Billing email').fill('billing@example.com')
  await page.getByRole('button', { name: 'Activate Plus' }).click()
  await expect(page.getByRole('heading', { name: 'Plus is active.' })).toBeVisible()

  await page.goto('/studio/billing')
  await expect(page.getByText('Invoices are drafts until Számlázz.hu is connected.')).toBeVisible()
  const invoices = page.getByRole('region', { name: 'Invoices' }).or(page.locator('section[aria-labelledby="invoices-title"]'))
  await expect(invoices.getByText(/DRAFT-\d{4}/).first()).toBeVisible()
  await expect(page.getByText(/of 30/)).toBeVisible()
  await invoices.getByRole('button', { name: 'View' }).first().click()
  await expect(page.getByRole('dialog').getByText('DRAFT – not a valid invoice.', { exact: false })).toBeVisible()
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).last().click()

  // Billing address for the invoices.
  await page.getByLabel('Postcode').fill('1051')
  await page.getByLabel('City').fill('Budapest')
  await page.getByLabel('Street address').fill('Fő utca 1.')
  await page.getByRole('button', { name: 'Save details' }).click()
  await expect(page.getByText('Billing details saved')).toBeVisible()

  // Connect Számlázz.hu from the owner's admin; the key is never shown again. Then disconnect.
  await page.getByRole('link', { name: 'Connect Számlázz.hu' }).click()
  await page.getByRole('radio', { name: /Számlázz\.hu/ }).click()
  await page.getByRole('button', { name: 'Save and connect' }).click()
  await expect(page.getByText('Required to connect.')).toBeVisible()
  await page.getByLabel('Számla Agent key').fill('test-agent-key-0042')
  await page.getByRole('button', { name: 'Save and connect' }).click()
  await expect(page.getByText(/Számlázz\.hu is connected \(key …0042\)/)).toBeVisible()
  await expect(page.getByLabel('Számla Agent key')).toHaveValue('')
  await page.getByRole('button', { name: 'Disconnect and remove the key' }).click()
  await expect(page.getByText(/Számlázz\.hu is connected/)).toHaveCount(0)

  // In the app: invoice a rental; customer and deposit are filled in.
  await page.goto('/demo')
  await page.getByRole('button', { name: 'Build my app' }).click()
  await page.getByRole('link', { name: 'Open my app' }).click({ timeout: 20_000 })
  await page.getByRole('button', { name: 'Add sample records' }).click()
  await page.getByRole('button', { name: 'New rental' }).click()
  const create = page.getByRole('dialog')
  await create.getByLabel(/^Item/).selectOption({ label: 'Canon EOS R6 body · ITE-0001' })
  await create.getByLabel(/^Customer/).selectOption({ index: 1 })
  await create.getByLabel(/Expected return/).fill(new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 10))
  await create.getByLabel(/Deposit/).fill('25000')
  await create.getByRole('button', { name: 'Create rental' }).click()

  await page.getByRole('button', { name: 'Invoice', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByLabel('Name')).not.toHaveValue('')
  await expect(dialog.getByLabel('Line 1 unit price')).toHaveValue('25000')
  await dialog.getByLabel('Line 1 item').fill('Camera rental, 2 days')
  await dialog.getByLabel('Line 1 quantity').fill('2')
  await dialog.getByLabel('Line 1 unit price').fill('12000')
  await expect(dialog.getByText(/Total .*30[\s,.]?480/)).toBeVisible()
  await dialog.getByRole('button', { name: 'Save draft' }).click()
  await expect(page.getByText(/Draft DRAFT-0001 saved/)).toBeVisible()
  await expect(page.getByText(/Invoice DRAFT-0001 for 30480 HUF \(draft\)/)).toBeVisible() // in the rental's history

  await page.getByRole('link', { name: /Invoices/ }).first().click()
  await expect(page.getByRole('heading', { name: 'Invoices', level: 1 })).toBeVisible()
  await expect(page.getByRole('listitem').getByText('DRAFT-0001', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Invoicing settings' })).toBeVisible()

  await page.request.post('/api/account/plan', { data: { plan: 'free' } })
})
