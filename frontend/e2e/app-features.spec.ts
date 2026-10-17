import { expect, test } from '@playwright/test'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'

// CRM/ERP features of a finished app: board, filters, notes, import, renaming sections,
// plus the Studio pages for managing apps, billing and support.
test('finished app: board, filter, note, import and renamed sections', async ({ page }) => {
  await page.goto('/demo')
  await page.getByRole('button', { name: 'Build my app' }).click()
  await expect(page.getByRole('heading', { name: 'Your app is ready.' })).toBeVisible({ timeout: 20_000 })
  await page.getByRole('link', { name: 'Open my app' }).click()
  await page.getByRole('button', { name: 'Add sample records' }).click()
  await expect(page.getByText('Sample records added')).toBeVisible()
  const appUrl = page.url()

  // Rent the camera from the overview.
  await page.getByRole('button', { name: 'New rental' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel(/^Item/).selectOption({ label: 'Canon EOS R6 body · ITE-0001' })
  await dialog.getByLabel(/^Customer/).selectOption({ index: 1 })
  await dialog.getByLabel(/Expected return/).fill(new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 10))
  await dialog.getByLabel(/Deposit/).fill('100')
  await dialog.getByRole('button', { name: 'Create rental' }).click()

  // Record page: add a note.
  await expect(page.getByText('Notes & history')).toBeVisible()
  await page.getByLabel('Add a note').fill('Customer will call before returning.')
  await page.getByRole('button', { name: 'Add note' }).click()
  await expect(page.getByText('Customer will call before returning.')).toBeVisible()

  // Rentals: pipeline board with the rental in its column; status filter.
  await page.goto(`${appUrl}/rental`)
  await page.getByRole('button', { name: 'Board' }).click()
  const column = page.getByRole('region', { name: 'Active column' })
  await expect(column.getByText('REN-0001', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'List' }).click()
  await page.getByRole('group', { name: 'Filter' }).getByRole('button', { name: /^Returned/ }).click()
  await expect(page.getByText('No matches')).toBeVisible()

  // Import items from a CSV; a row that breaks the rules is skipped and explained.
  await page.goto(`${appUrl}/item`)
  await page.getByRole('button', { name: 'Import' }).click()
  const csv = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cyr-')), 'items.csv')
  fs.writeFileSync(csv, 'Name;Type\nSlider 120 cm;grip\n;Lens\n')
  await page.getByLabel('CSV file').setInputFiles(csv)
  await expect(page.getByText('2 rows ready')).toBeVisible()
  await page.getByRole('button', { name: /Import 2 rows/ }).click()
  await expect(page.getByText('1 item imported, 1 skipped.')).toBeVisible()
  await expect(page.getByText('Row 2:')).toBeVisible()
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByRole('row', { name: /Slider 120 cm/ })).toBeVisible()

  // Improve this app → rename a section and give it a colour; the menu follows.
  await page.getByRole('button', { name: 'Improve this app' }).click()
  await expect(page.getByLabel('Describe a small change')).toBeVisible()
  await page.getByRole('tab', { name: 'Names & colours' }).click()
  await page.getByLabel('Inventory: menu name').fill('Equipment')
  await page.getByRole('radiogroup', { name: 'Inventory: colour' }).getByRole('radio', { name: 'Teal' }).click()
  await page.getByRole('button', { name: 'Save names' }).click()
  await expect(page.getByRole('heading', { name: 'Equipment', level: 1 })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Application sections' }).first().getByRole('link', { name: 'Equipment' })).toBeVisible()
})

test('studio: manage apps, billing for the owner, help centre', async ({ page }) => {
  await page.goto('/studio/apps')
  await expect(page.getByRole('heading', { name: 'My apps' })).toBeVisible()
  await expect(page.getByText('Your app grows with your business')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Change' }).first()).toBeVisible()

  await page.goto('/studio/settings')
  await page.getByRole('link', { name: 'Billing & payments' }).click()
  await expect(page.getByRole('heading', { name: 'Billing & payments' })).toBeVisible()
  await expect(page.getByText('Online payment isn’t connected in this preview.')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Billing history' })).toBeVisible()

  await page.getByRole('link', { name: 'Help & support' }).first().click()
  await expect(page.getByRole('heading', { name: 'Help & support' })).toBeVisible()
  await page.getByText('How do I change an app that is already finished?').click()
  await expect(page.getByText(/press “Improve this app”/)).toBeVisible()
})
