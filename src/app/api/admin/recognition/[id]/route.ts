/*
 * Per-recognition mutations: edit write-up + freeform PATCH-like updates.
 *
 *   POST   /api/admin/recognition/[id]              body: { writeup }      (edit writeup, Nominated only)
 *   DELETE /api/admin/recognition/[id]              admin hard-delete
 *
 * Approve / reject / archive land at /api/admin/recognition/[id]/approve
 * with action query param. Split into a second route file for clarity.
 *
 * Auth: Admin + HR only. The canTransition helper centralises the gate.
 */

import { NextResponse } from 'next/server'
import { getCurrentSession } from '@/lib/identity'
import { loadRecognitions } from '@/lib/data'
import { atomicUpdateJson } from '@/lib/queue/githubQueue'
import { canTransition, validateWriteup } from '@/lib/recognitionState'
import type { Recognition } from '@/lib/types'

export const runtime = 'nodejs'

const RECOGNITIONS_PATH = 'src/data/recognitions.json'

function bad(message: string, status = 400) {
  return NextResponse.json({ message }, { status })
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  const session = await getCurrentSession()
  if (!session) return bad('Not signed in.', 401)

  const list = loadRecognitions()
  const target = list.find((r) => r.id === params.id)
  if (!target) return bad('Recognition not found.', 404)

  const transition = canTransition({
    current: target.status,
    action: 'edit',
    actorRole: session.role,
  })
  if (!transition.ok) return bad(transition.reason ?? 'Forbidden.', 403)

  let body: { writeup?: unknown }
  try {
    body = (await request.json()) as { writeup?: unknown }
  } catch {
    return bad('Body must be JSON.')
  }

  const writeup = typeof body.writeup === 'string' ? body.writeup : ''
  const writeupError = validateWriteup(writeup)
  if (writeupError) return bad(writeupError)

  const now = new Date().toISOString()

  try {
    await atomicUpdateJson<Recognition[]>(
      RECOGNITIONS_PATH,
      (current) => {
        const arr = Array.isArray(current) ? current : []
        const next = arr.map((r) => {
          if (r.id !== params.id) return r
          return {
            ...r,
            writeup: writeup.trim(),
            auditLog: [
              ...r.auditLog,
              {
                timestamp: now,
                user: session.email,
                action: 'recognition.edit-writeup',
                before: { writeup: r.writeup },
                after: { writeup: writeup.trim() },
              },
            ],
          }
        })
        return {
          next,
          commitMessage: `feat(recognition): edit write-up ${params.id}`,
        }
      },
      { defaultValue: loadRecognitions() },
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Save failed.'
    return NextResponse.json({ message }, { status: 503 })
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const session = await getCurrentSession()
  if (!session) return bad('Not signed in.', 401)
  if (session.role !== 'Admin') {
    return bad('Only Admin can hard-delete a recognition record.', 403)
  }

  let removed = false
  await atomicUpdateJson<Recognition[]>(
    RECOGNITIONS_PATH,
    (current) => {
      const arr = Array.isArray(current) ? current : []
      const next = arr.filter((r) => r.id !== params.id)
      removed = next.length !== arr.length
      return {
        next,
        commitMessage: `feat(recognition): hard-delete ${params.id}`,
      }
    },
    { defaultValue: loadRecognitions() },
  )

  if (!removed) return bad('Recognition not found.', 404)
  return NextResponse.json({ ok: true })
}
