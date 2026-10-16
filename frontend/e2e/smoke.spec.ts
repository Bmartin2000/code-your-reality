import { expect, test } from '@playwright/test'

for (const path of ['/', '/studio', '/studio/new', '/studio/projects', '/studio/apps', '/studio/settings', '/no-such-page']) {
  test(`renders ${path} without horizontal overflow or console errors`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
    await page.goto(path)
    await page.waitForLoadState('networkidle')
    await expect(page.locator('#main').first()).toBeVisible()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow).toBeLessThanOrEqual(1)
    expect(errors).toEqual([])
  })
}
