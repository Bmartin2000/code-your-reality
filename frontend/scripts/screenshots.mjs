// Captures the README screenshots from a running dev setup (backend :8000, Vite :5173).
// Prepares a fresh guided sample through the public API: review, approve, compile, operate.
// Usage: node scripts/screenshots.mjs
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import path from 'node:path'

const API = 'http://127.0.0.1:8000/api'
const WEB = 'http://localhost:5173'
const OUT = path.resolve('..', 'docs', 'screenshots')
mkdirSync(OUT, { recursive: true })

async function call(method, url, body) {
  const res = await fetch(API + url, { method, headers: { 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) })
  const json = res.status === 204 ? null : await res.json()
  if (!res.ok) throw new Error(`${method} ${url}: ${JSON.stringify(json)}`)
  return json
}

function decide(defn) {
  const touch = (x) => {
    if (x.review.status === 'pending') x.review.status = 'accepted'
  }
  for (const e of defn.entities) {
    touch(e)
    e.fields.forEach(touch)
  }
  for (const m of defn.state_machines) {
    touch(m)
    m.transitions.forEach(touch)
  }
  for (const r of defn.rules) r.id === 'late_fee_policy' ? (r.review.status = 'rejected') : touch(r)
  defn.actions.forEach(touch)
  for (const q of defn.questions) Object.assign(q, { resolved: true, answer: 'Items are moved to maintenance by the workshop lead outside this process.' })
  return defn
}

const project = await call('POST', '/projects/sample')
await call('PUT', `/projects/${project.id}/workflow`, { definition: decide(project.workflow.definition), base_version: project.workflow.version })
await call('POST', `/projects/${project.id}/workflow/approve`)
let job = await call('POST', `/projects/${project.id}/compile`)
while (job.status !== 'succeeded' && job.status !== 'failed') job = await call('GET', `/jobs/${job.id}`)
const slug = job.result.slug
await call('POST', `/apps/${slug}/seed-sample`)
const items = await call('GET', `/apps/${slug}/records/item`)
const customers = await call('GET', `/apps/${slug}/records/customer`)
const day = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10)
const byName = (n) => items.find((i) => i.data.name.startsWith(n)).id
await call('POST', `/apps/${slug}/records/rental`, { item: byName('Canon'), customer: customers[0].id, start_date: day(0), expected_return: day(3), deposit: 250 })
await call('POST', `/apps/${slug}/records/rental`, { item: byName('Aputure'), customer: customers[1].id, start_date: day(0), expected_return: day(2), deposit: 120 })
await fetch(`${API}/apps/${slug}/records/rental`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ item: byName('Canon'), customer: customers[2].id, start_date: day(0), expected_return: day(1), deposit: 50 }) })
const sony = await call('POST', `/apps/${slug}/records/rental`, { item: byName('Sony'), customer: customers[2].id, start_date: day(-3), expected_return: day(0), deposit: 180 })
await call('POST', `/apps/${slug}/records/rental/${sony.record.id}/transitions/complete_return`)

// A second, un-reviewed sample for the "Understand" screen.
const fresh = await call('POST', '/projects/sample')

const browser = await chromium.launch()
const shot = async (page, name) => {
  await page.screenshot({ path: path.join(OUT, `${name}.png`) })
  console.log('saved', name)
}

const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await desktop.goto(WEB)
await desktop.waitForTimeout(10_200) // hero cycle reaches the assembled, live application
await shot(desktop, 'landing-hero')

await desktop.goto(`${WEB}/studio/projects/${fresh.id}`)
await desktop.waitForTimeout(900)
await shot(desktop, 'studio-review')

await desktop.goto(`${WEB}/studio/projects/${project.id}`)
await desktop.waitForTimeout(1200)
await shot(desktop, 'studio-ready')

await desktop.goto(`${WEB}/studio/projects/${fresh.id}/advanced`)
await desktop.getByRole('button', { name: /An unavailable item cannot be rented/ }).first().click()
await desktop.waitForTimeout(900)
await shot(desktop, 'studio-advanced')

await desktop.goto(`${WEB}/apps/${slug}`)
await desktop.waitForTimeout(1200)
await shot(desktop, 'app-overview')

await desktop.getByRole('button', { name: 'New rental' }).click()
const dialog = desktop.getByRole('dialog')
await dialog.getByLabel(/^Item/).selectOption({ index: 1 })
await dialog.getByLabel(/^Customer/).selectOption({ index: 1 })
await dialog.getByLabel(/^Item/).selectOption({ label: (await dialog.getByLabel(/^Item/).locator('option', { hasText: 'rented' }).first().textContent()).trim() })
await dialog.getByLabel(/Expected return/).fill(day(2))
await dialog.getByLabel(/Deposit/).fill('90')
await dialog.getByRole('button', { name: 'Create rental' }).click()
await dialog.getByRole('alert').waitFor()
await desktop.waitForTimeout(400)
await shot(desktop, 'app-rule-enforced')

const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
await mobile.goto(WEB)
await mobile.waitForTimeout(10_200)
await shot(mobile, 'mobile-landing')
await mobile.goto(`${WEB}/studio/new`)
await mobile.waitForTimeout(1200)
await shot(mobile, 'mobile-record')
await mobile.goto(`${WEB}/studio/projects/${project.id}`)
await mobile.waitForTimeout(1200)
await shot(mobile, 'mobile-ready')
await mobile.goto(`${WEB}/apps/${slug}`)
await mobile.waitForTimeout(1200)
await shot(mobile, 'mobile-app')

await browser.close()
console.log('sample project', project.id, 'app', slug)
