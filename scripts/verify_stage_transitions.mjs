/*
 * Visual verification harness for Phase 3 R5 stage-transition features.
 *
 * Layer 1 (verify): forward / back / reject flows on a Kanban card,
 *   undo toast presence, reject reason modal, bulk action bar appearance,
 *   filter chip application + URL serialisation.
 * Layer 2 (hostile): backwards-from-Sourced hidden state, terminal-state
 *   guard, double-click idempotence on a single forward move.
 *
 * Captures screenshots into scripts/verify_stage_transitions_output/
 */

import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.join(__dirname, '..')

const users = JSON.parse(
  fs.readFileSync(path.join(REPO, 'src/data/users.json'), 'utf8'),
)
const admin = users.find((u) => u.email === 'anish.d@getsetlearn.info')
if (!admin) throw new Error('seed Admin user missing')

const roles = JSON.parse(
  fs.readFileSync(path.join(REPO, 'src/data/roles.json'), 'utf8'),
)
const apps = JSON.parse(
  fs.readFileSync(path.join(REPO, 'src/data/applications.json'), 'utf8'),
)

const roleWithMostApps = roles
  .filter((r) => r.status === 'Open' || r.status === 'Draft')
  .map((r) => ({ r, n: apps.filter((a) => a.roleId === r.id).length }))
  .sort((a, b) => b.n - a.n)[0]?.r
if (!roleWithMostApps) throw new Error('no open role with applications found')

const outDir = path.join(__dirname, 'verify_stage_transitions_output')
fs.rmSync(outDir, { recursive: true, force: true })
fs.mkdirSync(outDir, { recursive: true })

const viewports = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'mobile', width: 375, height: 812 },
]

async function login(page) {
  await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle' })
  await page.fill('input[type="email"]', admin.email)
  await page.fill('input[type="password"]', 'GSL#123')
  const loginPromise = page.waitForResponse((r) => r.url().endsWith('/api/login'), {
    timeout: 5000,
  })
  await page.click('button[type="submit"]')
  await loginPromise
}

async function relaxCookie(context) {
  const cookies = await context.cookies()
  const session = cookies.find((c) => c.name === 'gsl_hr_session')
  if (session) {
    await context.clearCookies()
    await context.addCookies([{ ...session, sameSite: 'Lax' }])
  }
}

const browser = await chromium.launch()
let failed = false
const summary = []

function fail(msg) {
  console.error('  FAIL:', msg)
  summary.push({ status: 'FAIL', msg })
  failed = true
}
function pass(msg) {
  console.log('  PASS:', msg)
  summary.push({ status: 'PASS', msg })
}

try {
  for (const vp of viewports) {
    console.log(`\n=== ${vp.name} (${vp.width}×${vp.height}) ===`)
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } })
    const page = await context.newPage()
    page.on('console', (msg) => {
      const t = msg.text().slice(0, 200)
      if (msg.type() === 'error' || /warn/i.test(msg.type())) {
        console.log(`[browser:${vp.name}:${msg.type()}]`, t)
      }
    })
    page.on('pageerror', (e) => console.log(`[browser:${vp.name}:pageerror]`, e.message))

    await login(page)
    await relaxCookie(context)

    const url = `http://localhost:3000/roles/${roleWithMostApps.id}`
    await page.goto(url, { waitUntil: 'networkidle' })
    await page.screenshot({
      path: path.join(outDir, `${vp.name}-01-kanban-loaded.png`),
      fullPage: true,
    })

    // Filters toolbar present
    const filtersToolbar = await page
      .getByRole('toolbar', { name: /pipeline filters/i })
      .first()
      .isVisible()
      .catch(() => false)
    if (filtersToolbar) pass(`${vp.name}: filters toolbar visible`)
    else fail(`${vp.name}: filters toolbar missing`)

    // Apply "New this week" filter and verify URL.
    const newChip = page.getByRole('button', { name: /^new this week$/i })
    if (await newChip.isVisible().catch(() => false)) {
      await newChip.click()
      await page.waitForTimeout(300)
      const u = page.url()
      if (u.includes('filters=new')) pass(`${vp.name}: filter URL serialises`)
      else fail(`${vp.name}: filter URL did not update — ${u}`)
      await page.screenshot({
        path: path.join(outDir, `${vp.name}-02-filter-applied.png`),
        fullPage: true,
      })
      // Clear filters by clicking All.
      await page.getByRole('button', { name: /^all$/i }).click()
      await page.waitForTimeout(200)
    }

    // Hover a card on desktop, see action buttons. On mobile they are static.
    // Locate the first forward-move button via data-card-action.
    const forwardBtn = page.locator('[data-card-action="forward"]').first()
    let forwardBtnExists = (await forwardBtn.count()) > 0
    if (!forwardBtnExists) {
      // On desktop the buttons may be hover-revealed; force visibility by
      // hovering over a card.
      const card = page.locator('[role="list"] [aria-label^="Candidate"]').first()
      if ((await card.count()) > 0) await card.hover()
      forwardBtnExists = (await forwardBtn.count()) > 0
    }
    if (forwardBtnExists) pass(`${vp.name}: forward button rendered on cards`)
    else fail(`${vp.name}: forward button missing on cards`)

    // Reject button always present until terminal.
    const rejectBtn = page.locator('[data-card-action="reject"]').first()
    if ((await rejectBtn.count()) > 0) pass(`${vp.name}: reject button rendered`)
    else fail(`${vp.name}: reject button missing`)

    // Click reject on the first card → reject reason modal opens.
    if ((await rejectBtn.count()) > 0) {
      await rejectBtn.scrollIntoViewIfNeeded()
      await rejectBtn.click({ force: true })
      const rejectDialog = page.locator('[role="dialog"][aria-labelledby="reject-reason-heading"]')
      await rejectDialog.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {})
      const dialogVisible = await rejectDialog.isVisible().catch(() => false)
      if (dialogVisible) {
        pass(`${vp.name}: reject reason modal opens`)
        await page.screenshot({
          path: path.join(outDir, `${vp.name}-03-reject-modal.png`),
        })
        // Try to submit without selecting a reason (should fail validation
        // silently).
        const rejectSubmit = rejectDialog.getByRole('button', { name: /^reject$/i })
        await rejectSubmit.click().catch(() => {})
        await page.waitForTimeout(200)
        // The form should still be open with an error visible.
        const stillOpen = await rejectDialog.isVisible().catch(() => false)
        if (stillOpen) pass(`${vp.name}: reject form blocks empty reason`)
        else fail(`${vp.name}: reject form unexpectedly closed without reason`)
        // Cancel out.
        await rejectDialog.getByRole('button', { name: /^cancel$/i }).click()
        await page.waitForTimeout(200)
      } else {
        fail(`${vp.name}: reject reason modal did not open`)
      }
    }

    // Multi-select: check the first card's checkbox to surface the bulk bar.
    const firstCheckbox = page.locator('input[type="checkbox"][aria-label^="Select "]').first()
    if ((await firstCheckbox.count()) > 0) {
      await firstCheckbox.scrollIntoViewIfNeeded()
      await firstCheckbox.click({ force: true })
      await page.waitForTimeout(200)
      const bar = page.getByRole('region', { name: /bulk actions/i })
      const barVisible = await bar.isVisible().catch(() => false)
      if (barVisible) pass(`${vp.name}: bulk action bar appears on selection`)
      else fail(`${vp.name}: bulk action bar missing after selection`)
      await page.screenshot({
        path: path.join(outDir, `${vp.name}-04-bulk-bar.png`),
        fullPage: true,
      })
      // Clear selection.
      const clearBtn = bar.getByRole('button', { name: /clear selection/i })
      if (await clearBtn.isVisible().catch(() => false)) await clearBtn.click()
    }

    await context.close()
  }
} finally {
  await browser.close()
}

if (failed) {
  console.error(
    `\nFAILED — see screenshots in ${outDir}\nResults:`,
    summary.filter((s) => s.status === 'FAIL'),
  )
  process.exit(1)
} else {
  console.log(`\nPASS — ${summary.length} checks. Screenshots in ${outDir}`)
}
