/*
 * Daily 9am IST alert cron. Called by .github/workflows/daily-alerts.yml.
 *
 *   GET /api/cron/alerts
 *     headers: x-gsl-cron-token: <GSL_ALERT_CRON_TOKEN>
 *
 * Computes today's pending alerts via buildAlertActions, dedupes against
 * the alert log, sends each via Resend (deliverEmail), and appends to the
 * log atomically.
 *
 * Fails open: any single send error is logged but does not block other
 * alerts. The triggerKey scheme means a re-run after a partial failure
 * will only retry the failed ones.
 */

import crypto from 'node:crypto'
import { NextResponse } from 'next/server'
import { findEmployeeById, loadEmployees, loadUsers } from '@/lib/data'
import {
  buildAlertActions,
  loadAlertLog,
  loadAlertPreferences,
} from '@/lib/alerts'
import { loadEmployeeDocuments } from '@/lib/documents'
import {
  loadOnboardingTasks,
  loadOnboardingTemplates,
} from '@/lib/onboardingTasks'
import {
  loadOffboardingTasks,
  loadOffboardingTemplates,
} from '@/lib/offboardingTasks'
import { loadLeaveApplications } from '@/lib/leave'
import { deliverEmail } from '@/lib/mail'
import { atomicUpdateJson } from '@/lib/queue/githubQueue'
import type { AlertLogEntry } from '@/lib/types'

export const runtime = 'nodejs'

const LOG_PATH = 'src/data/alert_log.json'

export async function GET(request: Request) {
  const token = request.headers.get('x-gsl-cron-token')
  const expected = process.env.GSL_ALERT_CRON_TOKEN
  if (!expected) {
    return NextResponse.json(
      { message: 'GSL_ALERT_CRON_TOKEN env not configured.' },
      { status: 503 },
    )
  }
  if (!token || token !== expected) {
    return NextResponse.json({ message: 'Forbidden.' }, { status: 403 })
  }

  const now = new Date()
  const prefs = loadAlertPreferences()
  if (!prefs.globalEnabled) {
    return NextResponse.json({
      ok: true,
      skipped: 'global alerts disabled in preferences',
      fired: 0,
    })
  }

  // Build the HR recipient list from active HR-role users.
  const hrRecipients = (await loadUsers())
    .filter((u) => u.active && (u.role === 'HR' || u.role === 'Admin'))
    .map((u) => u.email)

  const actions = buildAlertActions({
    now,
    prefs,
    log: loadAlertLog(),
    employees: await loadEmployees(),
    documents: loadEmployeeDocuments(),
    onboardingTasks: loadOnboardingTasks(),
    onboardingTemplates: loadOnboardingTemplates(),
    offboardingTasks: loadOffboardingTasks(),
    offboardingTemplates: loadOffboardingTemplates(),
    leaveApplications: loadLeaveApplications(),
    hrRecipients,
  })

  void findEmployeeById // keep import for runtime tracing

  const newLogEntries: AlertLogEntry[] = []
  const errors: Array<{ triggerKey: string; message: string }> = []

  for (const action of actions) {
    try {
      for (const recipient of action.recipients) {
        await deliverEmail({
          to: recipient,
          subject: action.subject,
          body: action.body,
          context: `alert/${action.category}/${action.triggerKey.slice(0, 50)}`,
        })
      }
      newLogEntries.push({
        id: `alert-${crypto.randomUUID()}`,
        category: action.category,
        triggerKey: action.triggerKey,
        recipients: action.recipients,
        firedAt: now.toISOString(),
        notes: action.notes,
      })
    } catch (err) {
      errors.push({
        triggerKey: action.triggerKey,
        message: err instanceof Error ? err.message : 'Unknown send error',
      })
    }
  }

  if (newLogEntries.length > 0) {
    try {
      await atomicUpdateJson<AlertLogEntry[]>(
        LOG_PATH,
        (current) => {
          const list = Array.isArray(current) ? current : []
          return {
            next: [...list, ...newLogEntries],
            commitMessage: `chore(alerts): logged ${newLogEntries.length} fired alerts`,
          }
        },
        { defaultValue: [] as AlertLogEntry[] },
      )
    } catch (err) {
      // Log persistence failed; alerts were already sent. Surface so the
      // cron run is still considered successful for the alerts that went
      // out, but flag the audit-log gap.
      errors.push({
        triggerKey: '*log-persistence*',
        message: err instanceof Error ? err.message : 'log persistence failed',
      })
    }
  }

  return NextResponse.json({
    ok: true,
    considered: actions.length,
    fired: newLogEntries.length,
    errors,
  })
}
