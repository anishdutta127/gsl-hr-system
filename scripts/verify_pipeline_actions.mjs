/*
 * Visual verification harness for Step 1 (Move / Add to additional role on
 * the candidate detail page) and Step 2 (resume + actions on the role-side
 * Kanban side panel).
 *
 * Mirrors verify_jd_editor.mjs's login flow. Captures screenshots into
 * scripts/verify_pipeline_actions_output/ for human review.
 */

import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const users = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'src/data/users.json'), 'utf8'),
)
const admin = users.find((u) => u.email === 'anish.d@getsetlearn.info')
if (!admin) throw new Error('seed Admin user missing')

const roles = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'src/data/roles.json'), 'utf8'),
)
const apps = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'src/data/applications.json'), 'utf8'),
)
const candidates = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'src/data/candidates.json'), 'utf8'),
)

// Pick a role that actually has at least one candidate in its Kanban so the
// side panel can be opened from a real card click.
const roleWithApps = roles.find(
  (r) => apps.some((a) => a.roleId === r.id) && (r.status === 'Open' || r.status === 'Draft'),
)
if (!roleWithApps) throw new Error('no role with active applications found')
const sampleApp = apps.find((a) => a.roleId === roleWithApps.id)
const sampleCandidate = candidates.find((c) => c.id === sampleApp.candidateId)
if (!sampleCandidate) throw new Error('sample candidate not found in candidates.json')

const outDir = path.join(__dirname, 'verify_pipeline_actions_output')
fs.rmSync(outDir, { recursive: true, force: true })
fs.mkdirSync(outDir, { recursive: true })

const viewports = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'mobile', width: 375, height: 812 },
]

async function login(page) {
  await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle' })
  await page.fill('input[type="email"]', admin.email)
  await page.fill('input[type="password"]', 'TestPass123!')
  const loginPromise = page.waitForResponse((r) => r.url().endsWith('/api/login'), {
    timeout: 5000,
  })
  await page.click('button[type="submit"]')
  await loginPromise
}

async function relaxCookie(context) {
  let cookies = await context.cookies()
  const session = cookies.find((c) => c.name === 'gsl_hr_session')
  if (session) {
    await context.clearCookies()
    await context.addCookies([{ ...session, sameSite: 'Lax' }])
  }
}

const browser = await chromium.launch()
let failed = false
try {
  for (const vp of viewports) {
    console.log(`\n=== ${vp.name} (${vp.width}×${vp.height}) ===`)
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } })
    const page = await context.newPage()
    page.on('console', (msg) => {
      console.log(`[browser:${vp.name}:${msg.type()}]`, msg.text().slice(0, 200))
    })
    page.on('pageerror', (e) => console.log(`[browser:${vp.name}:pageerror]`, e.message))

    await login(page)
    await relaxCookie(context)

    // ---------- Step 1: candidate detail Move/Add buttons ----------
    await page.evaluate((url) => {
      window.location.href = url
    }, `http://localhost:3000/candidates/${sampleCandidate.id}`)
    await page.waitForLoadState('networkidle')
    await page.screenshot({
      path: path.join(outDir, `${vp.name}-01-candidate-detail.png`),
      fullPage: true,
    })

    const moveBtn = page.getByRole('button', { name: /move to other role/i })
    const addBtn = page.getByRole('button', { name: /add to additional role/i })
    const moveVisible = await moveBtn.isVisible().catch(() => false)
    const addVisible = await addBtn.isVisible().catch(() => false)
    console.log(`[${vp.name}] candidate detail Move button visible: ${moveVisible}`)
    console.log(`[${vp.name}] candidate detail Add button visible: ${addVisible}`)
    if (!moveVisible) {
      console.error(`[${vp.name}] FAIL: Move button missing on candidate detail`)
      failed = true
    }
    if (!addVisible) {
      console.error(`[${vp.name}] FAIL: Add button missing on candidate detail`)
      failed = true
    }

    // Open the Add modal to confirm the role picker is populated.
    if (addVisible) {
      console.log(`[${vp.name}] addBtn count=${await addBtn.count()}, disabled=${await addBtn.first().isDisabled()}`)
      // Wait a beat to make sure React has hydrated.
      await page.waitForTimeout(1000)
      // Use a real user-input click rather than synthetic, with focus first.
      await addBtn.first().focus()
      await addBtn.first().click()
      await page.waitForTimeout(1500)
      const dialogCount = await page.locator('[role="dialog"]').count()
      const allDialogs = await page.locator('[role="dialog"]').evaluateAll((els) =>
        els.map((e) => ({ labelledby: e.getAttribute('aria-labelledby') })),
      )
      console.log(`[${vp.name}] dialogs after click:`, dialogCount, allDialogs)
      await page.screenshot({
        path: path.join(outDir, `${vp.name}-02a-after-add-click.png`),
        fullPage: true,
      })
      await page.waitForSelector('[role="dialog"][aria-labelledby="pipeline-action-heading"]', {
        state: 'visible',
        timeout: 5000,
      })
      await page.screenshot({
        path: path.join(outDir, `${vp.name}-02-add-modal.png`),
      })
      const dropOptions = await page.locator('#add-dest option').count()
      console.log(`[${vp.name}] Add modal destination options: ${dropOptions}`)
      if (dropOptions <= 1) {
        console.error(`[${vp.name}] FAIL: Add modal has no destination roles`)
        failed = true
      }
      // Close modal.
      await page.keyboard.press('Escape')
    }

    // ---------- Step 2: side panel from role Kanban ----------
    await page.evaluate((url) => {
      window.location.href = url
    }, `http://localhost:3000/roles/${roleWithApps.id}`)
    await page.waitForLoadState('networkidle')
    await page.screenshot({
      path: path.join(outDir, `${vp.name}-03-role-kanban.png`),
      fullPage: true,
    })

    // Click an Open button on a candidate card. The card itself is draggable;
    // the explicit Open button is the keyboard-friendly path that avoids the
    // dnd-kit click/drag race.
    const openBtns = page.locator('[data-card-action="open"]')
    const openCount = await openBtns.count()
    console.log(`[${vp.name}] role kanban "Open" buttons: ${openCount}`)
    if (openCount === 0) {
      console.error(`[${vp.name}] FAIL: no Open buttons on role kanban cards`)
      failed = true
    } else {
      await openBtns.first().click()
      await page.waitForSelector('[role="dialog"][aria-labelledby="kanban-panel-heading"]', {
        state: 'visible',
      })
      await page.screenshot({
        path: path.join(outDir, `${vp.name}-04-side-panel.png`),
      })

      const viewResume = await page
        .getByRole('link', { name: /view resume/i })
        .first()
        .isVisible()
        .catch(() => false)
      const noResume = await page
        .getByText(/no resume on file/i)
        .first()
        .isVisible()
        .catch(() => false)
      const uploadCtrl = await page
        .locator('input[type="file"][accept*="pdf"]')
        .first()
        .count()
      console.log(
        `[${vp.name}] side-panel View resume: ${viewResume}, "No resume": ${noResume}, Upload input: ${uploadCtrl > 0}`,
      )
      const sidePanelOk = (viewResume || noResume) && uploadCtrl > 0
      if (!sidePanelOk) {
        console.error(
          `[${vp.name}] FAIL: side panel resume controls missing (need either View or No resume + an upload input)`,
        )
        failed = true
      }

      const panel = page.locator('[role="dialog"][aria-labelledby="kanban-panel-heading"]')
      const sidePanelMove = await panel
        .getByRole('button', { name: /move to other role/i })
        .first()
        .isVisible()
        .catch(() => false)
      const sidePanelAdd = await panel
        .getByRole('button', { name: /add to additional role/i })
        .first()
        .isVisible()
        .catch(() => false)
      console.log(
        `[${vp.name}] side-panel Move visible: ${sidePanelMove}, Add visible: ${sidePanelAdd}`,
      )
      if (!sidePanelMove && !sidePanelAdd) {
        console.error(`[${vp.name}] FAIL: side panel has no pipeline actions`)
        failed = true
      }
    }

    await context.close()
  }
} finally {
  await browser.close()
}

if (failed) {
  console.error('\nFAILED — see screenshots in', outDir)
  process.exit(1)
} else {
  console.log('\nPASS — see screenshots in', outDir)
}
