/*
 * Exit interview submit. Confidential — only HR/Admin can submit/edit;
 * Leadership can read only when allowlisted via GSL_INTERVIEW_VIEWERS.
 * HOD never sees this content.
 *
 *   PUT /api/admin/offboarding/exit-interview/[employeeId]
 *     body: ExitInterview minus employeeId/conductedAt/conductedBy/auditLog
 */

import { NextResponse } from 'next/server'
import { getCurrentSession } from '@/lib/identity'
import { findEmployeeById } from '@/lib/data'
import {
  canEditExitInterview,
  loadExitInterviews,
} from '@/lib/offboardingTasks'
import { atomicUpdateJson } from '@/lib/queue/githubQueue'
import type { ExitInterview } from '@/lib/types'

export const runtime = 'nodejs'

const FILE_PATH = 'src/data/exit_interviews.json'

function bad(message: string, status = 400) {
  return NextResponse.json({ message }, { status })
}

interface Body {
  reasonForLeaving?: string
  wouldRecommend?: 'Yes' | 'No' | 'Maybe' | null
  satisfactionWithManager?: 1 | 2 | 3 | 4 | 5 | null
  satisfactionWithRole?: 1 | 2 | 3 | 4 | 5 | null
  topThingsToChange?: string
  freeText?: string
}

const SAT_VALUES = [1, 2, 3, 4, 5] as const
const REC_VALUES = ['Yes', 'No', 'Maybe'] as const

export async function PUT(
  request: Request,
  { params }: { params: { employeeId: string } },
) {
  const session = await getCurrentSession()
  if (!canEditExitInterview(session)) {
    return bad('Only Admin or HR can submit exit interviews.', 403)
  }
  const employee = await findEmployeeById(params.employeeId)
  if (!employee) return bad('Employee not found.', 404)

  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return bad('Body must be JSON.')
  }
  if (
    body.satisfactionWithManager !== undefined &&
    body.satisfactionWithManager !== null &&
    !SAT_VALUES.includes(body.satisfactionWithManager)
  ) {
    return bad('satisfactionWithManager must be 1-5 or null.')
  }
  if (
    body.satisfactionWithRole !== undefined &&
    body.satisfactionWithRole !== null &&
    !SAT_VALUES.includes(body.satisfactionWithRole)
  ) {
    return bad('satisfactionWithRole must be 1-5 or null.')
  }
  if (
    body.wouldRecommend !== undefined &&
    body.wouldRecommend !== null &&
    !REC_VALUES.includes(body.wouldRecommend as 'Yes')
  ) {
    return bad('wouldRecommend must be Yes/No/Maybe or null.')
  }

  const now = new Date().toISOString()
  const existing = loadExitInterviews().find((i) => i.employeeId === employee.id)

  const next: ExitInterview = {
    employeeId: employee.id,
    conductedAt: existing?.conductedAt ?? now,
    conductedBy: existing?.conductedBy ?? session!.email,
    reasonForLeaving: body.reasonForLeaving ?? existing?.reasonForLeaving ?? '',
    wouldRecommend:
      body.wouldRecommend !== undefined ? body.wouldRecommend : (existing?.wouldRecommend ?? null),
    satisfactionWithManager:
      body.satisfactionWithManager !== undefined
        ? body.satisfactionWithManager
        : (existing?.satisfactionWithManager ?? null),
    satisfactionWithRole:
      body.satisfactionWithRole !== undefined
        ? body.satisfactionWithRole
        : (existing?.satisfactionWithRole ?? null),
    topThingsToChange: body.topThingsToChange ?? existing?.topThingsToChange ?? '',
    freeText: body.freeText ?? existing?.freeText ?? '',
    auditLog: [
      ...(existing?.auditLog ?? []),
      {
        timestamp: now,
        user: session!.email,
        action: existing ? 'exit-interview.update' : 'exit-interview.create',
        after: {
          reasonForLeaving: body.reasonForLeaving,
          wouldRecommend: body.wouldRecommend,
        },
      },
    ],
  }

  await atomicUpdateJson<ExitInterview[]>(
    FILE_PATH,
    (current) => {
      const list = Array.isArray(current) ? current : []
      const without = list.filter((i) => i.employeeId !== employee.id)
      return {
        next: [...without, next],
        commitMessage: `feat(offboarding): ${existing ? 'update' : 'create'} exit interview for ${employee.id.slice(0, 8)}`,
      }
    },
    { defaultValue: [] as ExitInterview[] },
  )

  return NextResponse.json({
    ok: true,
    note: 'Exit interview saved. Reflects in the dossier once Vercel rebuilds (~2 minutes).',
  })
}
