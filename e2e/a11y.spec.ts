/*
 * axe-core CI sweep. Runs against the deployed Vercel URL (override via
 * A11Y_BASE_URL). Scans public + auth-landing surfaces that don't require
 * a session cookie; extending to authenticated pages would require a test
 * login flow, wired in when the baseline matters more than shipping.
 *
 * Baseline lives in .axe-baseline.json at the repo root. One entry per
 * route is the cap of allowed violations at serious/critical severity.
 * CI fails if the actual violation count exceeds the baseline.
 */

import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import fs from 'node:fs'
import path from 'node:path'

interface Baseline {
  [route: string]: number | string
}

const baseline = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), '.axe-baseline.json'), 'utf-8'),
) as Baseline

const ROUTES_TO_SCAN = ['/careers', '/login', '/portal/request-new-link']

for (const route of ROUTES_TO_SCAN) {
  test(`a11y: ${route} has no new serious violations`, async ({ page }) => {
    await page.goto(route, { waitUntil: 'networkidle' })

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()

    const seriousPlus = results.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    )

    const allowed = typeof baseline[route] === 'number' ? (baseline[route] as number) : 0

    if (seriousPlus.length > allowed) {
      console.log(`\n${route}: ${seriousPlus.length} serious+ violations (baseline ${allowed}):`)
      for (const v of seriousPlus) {
        console.log(`  - ${v.id} (${v.impact}): ${v.help}`)
        console.log(`    ${v.helpUrl}`)
        for (const node of v.nodes.slice(0, 3)) {
          console.log(`    target: ${node.target.join(' ')}`)
        }
      }
    }

    expect(
      seriousPlus.length,
      `${route}: ${seriousPlus.length} violations exceed baseline ${allowed}`,
    ).toBeLessThanOrEqual(allowed)
  })
}
