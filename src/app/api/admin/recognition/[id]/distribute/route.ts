import { NextResponse } from 'next/server'
import { getCurrentSession } from '@/lib/identity'
import {
  findRecognitionById,
  loadRecognitions,
} from '@/lib/data'
import { atomicUpdateJson } from '@/lib/queue/githubQueue'
import type { Recognition, RecognitionDistribution } from '@/lib/types'

export const runtime = 'nodejs'

const RECOGNITIONS_PATH = 'src/data/recognitions.json'

/**
 * Record a Recognition distribution email send.
 *
 * Body: { recipientCount }
 *
 * The actual mailto: fires client-side after this POST returns 200.
 * This route appends a RecognitionDistribution entry, flips status to
 * 'Published' on the first distribution, and stamps publishedAt.
 * Subsequent distributions append to distributionEmails[] without
 * touching status (a re-share is not a re-publish).
 */
export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  const session = await getCurrentSession()
  if (!session) return NextResponse.json({ message: 'Not signed in.' }, { status: 401 })
  if (session.role !== 'Admin' && session.role !== 'HR') {
    return NextResponse.json(
      { message: 'Only Admin or HR can distribute recognition emails.' },
      { status: 403 },
    )
  }

  let body: { recipientCount?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ message: 'Invalid request.' }, { status: 400 })
  }
  const recipientCount =
    typeof body.recipientCount === 'number' && body.recipientCount > 0
      ? Math.floor(body.recipientCount)
      : 0
  if (recipientCount === 0) {
    return NextResponse.json(
      { message: 'recipientCount must be a positive integer.' },
      { status: 400 },
    )
  }

  const recognition = await findRecognitionById(params.id)
  if (!recognition) {
    return NextResponse.json({ message: 'Recognition not found.' }, { status: 404 })
  }
  if (recognition.status === 'Draft' || recognition.status === 'Nominated') {
    return NextResponse.json(
      {
        message:
          'This recognition has not been approved yet. Approve it before distributing.',
      },
      { status: 409 },
    )
  }
  if (recognition.status === 'Archived') {
    return NextResponse.json(
      { message: 'Cannot distribute an archived recognition.' },
      { status: 409 },
    )
  }

  const now = new Date().toISOString()
  const distribution: RecognitionDistribution = {
    sentAt: now,
    sentBy: session.email,
    recipientCount,
  }

  try {
    await atomicUpdateJson<Recognition[]>(
      RECOGNITIONS_PATH,
      (current) => {
        const next = current.map((r) => {
          if (r.id !== recognition.id) return r
          const wasPublished = r.status === 'Published'
          return {
            ...r,
            status: 'Published' as const,
            publishedAt: wasPublished ? r.publishedAt : now,
            distributionEmails: [...(r.distributionEmails ?? []), distribution],
            auditLog: [
              ...(r.auditLog ?? []),
              {
                timestamp: now,
                user: session.email,
                action: wasPublished ? 'recognition.redistribute' : 'recognition.publish',
                after: { recipientCount },
                notes: wasPublished
                  ? `Re-distributed to ${recipientCount} recipients.`
                  : `Published. Distributed to ${recipientCount} recipients.`,
              },
            ],
          }
        })
        return {
          next,
          commitMessage: `chore(recognition): distribute ${recognition.id}`,
        }
      },
      { defaultValue: await loadRecognitions() },
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Save failed.'
    return NextResponse.json({ message }, { status: 503 })
  }

  return NextResponse.json({ ok: true, distributedAt: now })
}

