import { NextResponse } from 'next/server'
import { getCurrentSession } from '@/lib/identity'
import { findRecognitionById } from '@/lib/data'
import { atomicUpdateJson } from '@/lib/queue/githubQueue'
import type { Recognition } from '@/lib/types'

export const runtime = 'nodejs'

const RECOGNITIONS_PATH = 'src/data/recognitions.json'

function bad(message: string, status = 400) {
  return NextResponse.json({ message }, { status })
}

interface Body {
  enabled: boolean
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await getCurrentSession()
  if (!session) return bad('Unauthorised.', 401)
  if (session.role !== 'Admin' && session.role !== 'HR') {
    return bad('Only HR or Admin can toggle public share.', 403)
  }
  const rec = await findRecognitionById(params.id)
  if (!rec) return bad('Recognition not found.', 404)

  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return bad('Body must be JSON.')
  }
  if (typeof body.enabled !== 'boolean') return bad('enabled must be boolean.')

  // Pragmatic guard: only Approved or Published recognitions can be shared
  // publicly. Drafts and Nominated stay internal.
  if (body.enabled && rec.status !== 'Approved' && rec.status !== 'Published') {
    return bad(
      `Recognition status is ${rec.status}. Approve or publish it before enabling public share.`,
    )
  }

  const now = new Date().toISOString()
  await atomicUpdateJson<Recognition[]>(
    RECOGNITIONS_PATH,
    (current) => {
      const list = Array.isArray(current) ? current : []
      const next = list.map((r) => {
        if (r.id !== params.id) return r
        return {
          ...r,
          publicShareEnabled: body.enabled,
          auditLog: [
            ...r.auditLog,
            {
              timestamp: now,
              user: session.email,
              action: body.enabled
                ? 'recognition.public-share-enable'
                : 'recognition.public-share-disable',
            },
          ],
        }
      })
      return {
        next,
        commitMessage: `feat(recognition): ${body.enabled ? 'enable' : 'disable'} public share ${params.id}`,
      }
    },
    { defaultValue: [] as Recognition[] },
  )
  return NextResponse.json({ ok: true })
}
