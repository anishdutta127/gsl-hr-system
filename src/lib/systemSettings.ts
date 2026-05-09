/*
 * System settings — admin-editable defaults that live as JSON, not
 * env vars. Riddhi flips them from the /admin/alerts/preferences page;
 * the change persists across deploys without an env redeploy.
 *
 * Today carries one setting (leaveFlow). Anything else that's
 * "Riddhi-tunable from the UI" lands here as we discover it.
 */

import fs from 'node:fs'
import path from 'node:path'
import type { LeaveFlow, SystemSettings } from './types'

const FILE_PATH = path.join(process.cwd(), 'src', 'data', 'system_settings.json')

// TESTING DEFAULT: leaveFlow defaults to 'hr-mediated' since Riddhi
// stated she needs time before opening up self-service. When/if
// self-service ships and Riddhi is ready, she flips this from the
// /admin/alerts/preferences page — no env var required.
const DEFAULT_SETTINGS: SystemSettings = {
  leaveFlow: 'hr-mediated',
  updatedAt: '',
  updatedBy: '',
}

export function loadSystemSettings(): SystemSettings {
  try {
    if (!fs.existsSync(FILE_PATH)) return { ...DEFAULT_SETTINGS }
    const text = fs.readFileSync(FILE_PATH, 'utf-8').trim()
    if (!text) return { ...DEFAULT_SETTINGS }
    const parsed = JSON.parse(text) as Partial<SystemSettings>
    return {
      leaveFlow: parsed.leaveFlow ?? DEFAULT_SETTINGS.leaveFlow,
      updatedAt: parsed.updatedAt ?? '',
      updatedBy: parsed.updatedBy ?? '',
    }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function getLeaveFlow(): LeaveFlow {
  return loadSystemSettings().leaveFlow
}
