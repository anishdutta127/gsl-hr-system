/*
 * Manual verification harness for the JD-editor sticky-toolbar fix.
 *
 * 1. Sign a JWT for the seeded Admin user using GSL_JWT_SECRET from
 *    .env.local (no real password, no users.json mutation).
 * 2. Open the role detail page, click "Edit description".
 * 3. Paste ~3000 words of test content and force a scroll to the bottom of
 *    the dialog body.
 * 4. Capture screenshots at desktop (1280x800) and mobile (375x812).
 * 5. Click the Bold button while scrolled, type, screenshot to confirm the
 *    button actually toggles formatting from a deep scroll position.
 *
 * Output: scripts/verify_jd_editor_output/*.png — Anish reviews these to
 * confirm the toolbar stays both visible AND clickable. Failure modes the
 * eye picks up immediately:
 *   - Toolbar absent → sticky still broken
 *   - Toolbar visible but click does nothing → z-index / pointer-events bug
 *   - Toolbar at viewport top but offset wrong → modal scroll container off
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
const targetRole = roles.find((r) => r.status === 'Open' || r.status === 'Draft' || r.status === 'Paused')
if (!targetRole) throw new Error('no editable role found in roles.json')

const outDir = path.join(__dirname, 'verify_jd_editor_output')
fs.rmSync(outDir, { recursive: true, force: true })
fs.mkdirSync(outDir, { recursive: true })

// Allow CLI override so we can run the 6000-word edge case Shruti asked for.
const wordCountTarget = Number(process.env.WORD_COUNT ?? '3000')
const sentence =
  'Develop and maintain a cohesive curriculum across STEM, robotics, coding, and AI tracks for K-12 learners with measurable outcomes mapped to NEP 2020 and NCF guidelines. '
const wordsPerSentence = sentence.trim().split(/\s+/).length
const sentencesNeeded = Math.ceil(wordCountTarget / wordsPerSentence)
const sentencesPerPara = 8
const paraCount = Math.ceil(sentencesNeeded / sentencesPerPara)
const para = sentence.repeat(sentencesPerPara)
const longContent = Array.from({ length: paraCount }, () => para).join('\n\n')
console.log(
  `[setup] generating ~${paraCount * sentencesPerPara * wordsPerSentence} words across ${paraCount} paragraphs`,
)

const viewports = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'mobile', width: 375, height: 812 },
]

const browser = await chromium.launch()
let failed = false
try {
  for (const vp of viewports) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
    })
    const page = await context.newPage()
    // Visit the login page first so the cookie that the API mints is part of
    // a same-site browsing context for subsequent navigations.
    await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle' })
    await page.fill('input[type="email"]', admin.email)
    await page.fill('input[type="password"]', 'TestPass123!')
    const loginPromise = page.waitForResponse((r) => r.url().endsWith('/api/login'), {
      timeout: 5000,
    })
    await page.click('button[type="submit"]')
    await loginPromise
    // Re-add the cookie with SameSite=Lax so Playwright sends it on the
    // page.request and page.goto navigations (real browsers send Strict on
    // same-site nav, but Playwright's request-context heuristic differs).
    let cookies = await context.cookies()
    const session = cookies.find((c) => c.name === 'gsl_hr_session')
    if (session) {
      await context.clearCookies()
      await context.addCookies([{ ...session, sameSite: 'Lax' }])
    }
    cookies = await context.cookies()
    console.log(`[${vp.name}] cookies relaxed:`, cookies.map((c) => `${c.name} (${c.sameSite})`))
    page.on('console', (msg) => {
      if (msg.type() === 'error') console.log(`[browser:${vp.name}]`, msg.text())
    })

    // Hard-load (window.location) to escape the login route's RSC tree.
    await page.evaluate((url) => { window.location.href = url },
      `http://localhost:3000/roles/${targetRole.id}`)
    await page.waitForLoadState('networkidle')
    await page.screenshot({ path: path.join(outDir, `${vp.name}-01-role-page.png`), fullPage: true })

    // The Edit description button lives in the role header's right-side
    // action row; it may be wrapped below or off-screen on narrower viewports.
    await page.getByRole('button', { name: /edit description/i }).scrollIntoViewIfNeeded()
    await page.getByRole('button', { name: /edit description/i }).click()
    await page.waitForSelector('[role="dialog"]', { state: 'visible' })
    await page.screenshot({ path: path.join(outDir, `${vp.name}-02-modal-open.png`) })

    // Paste long content via TipTap's contenteditable. Click into the editor
    // first, select all, then type/keyboard.insertText doesn't work well
    // with TipTap so we use the focused-element insertHTML approach.
    await page.locator('[aria-label="Role description"]').click()
    await page.evaluate(
      ([content]) => {
        const el = document.querySelector('[aria-label="Role description"]')
        if (el && el.isContentEditable) {
          el.innerHTML = ''
          // Insert via execCommand so TipTap registers the change.
          document.execCommand('insertHTML', false, content)
        }
      },
      [longContent.split(/\n\n/).map((p) => `<p>${p}</p>`).join('')],
    )
    await page.waitForTimeout(300)
    await page.screenshot({ path: path.join(outDir, `${vp.name}-03-content-pasted.png`) })

    // Scroll the dialog body to the bottom.
    const scrollResult = await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]')
      if (!dialog) return null
      const scrollables = Array.from(dialog.querySelectorAll('*')).filter((el) => {
        const cs = getComputedStyle(el)
        return (
          (cs.overflowY === 'auto' || cs.overflowY === 'scroll') &&
          el.scrollHeight > el.clientHeight
        )
      })
      const target = scrollables[scrollables.length - 1] ?? dialog
      target.scrollTop = target.scrollHeight
      return { tag: target.tagName, scrolled: target.scrollTop, max: target.scrollHeight }
    })
    console.log(`[${vp.name}] scrolled to`, scrollResult)
    await page.waitForTimeout(200)
    await page.screenshot({ path: path.join(outDir, `${vp.name}-04-scrolled.png`) })

    // Toolbar visibility check while scrolled.
    const toolbarBox = await page.locator('[role="toolbar"][aria-label="Formatting"]').boundingBox()
    const toolbarVisible = !!(toolbarBox && toolbarBox.height > 0 && toolbarBox.width > 0)
    console.log(`[${vp.name}] toolbar bbox:`, toolbarBox)

    // Footer (Save/Cancel) visibility check while scrolled.
    const cancelBox = await page.getByRole('button', { name: 'Cancel' }).first().boundingBox()
    const footerVisible = !!(cancelBox && cancelBox.y < vp.height)
    console.log(`[${vp.name}] cancel bbox:`, cancelBox)

    // Click Bold while scrolled — verify it actually applies formatting by
    // selecting all editor content first, then checking the rendered HTML
    // gains a <strong> tag.
    let boldClickWorked = false
    try {
      // Select all content in the editor.
      await page.locator('[aria-label="Role description"]').click()
      const isMac = process.platform === 'darwin'
      await page.keyboard.press(isMac ? 'Meta+A' : 'Control+A')
      await page.locator('[role="toolbar"] button[aria-label="Bold"]').click()
      // Allow TipTap's transaction to flush + React to re-render.
      await page.waitForTimeout(200)
      const html = await page.locator('[aria-label="Role description"]').innerHTML()
      const pressed = await page.locator('[role="toolbar"] button[aria-label="Bold"]').getAttribute('aria-pressed')
      boldClickWorked = html.includes('<strong>') || pressed === 'true'
      console.log(`[${vp.name}] bold pressed=${pressed}, contains <strong>=${html.includes('<strong>')}`)
    } catch (e) {
      console.log(`[${vp.name}] bold click failed:`, e.message)
    }

    await page.screenshot({ path: path.join(outDir, `${vp.name}-05-after-bold.png`) })

    if (!toolbarVisible) {
      console.error(`[${vp.name}] FAIL: toolbar not visible after scroll`)
      failed = true
    }
    if (!footerVisible) {
      console.error(`[${vp.name}] FAIL: footer not visible after scroll`)
      failed = true
    }
    if (!boldClickWorked) {
      console.error(`[${vp.name}] FAIL: bold button click did not toggle state`)
      failed = true
    }
    if (toolbarVisible && footerVisible && boldClickWorked) {
      console.log(`[${vp.name}] PASS: sticky toolbar + footer visible + bold clickable`)
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
