import { NextResponse } from 'next/server'
import { getCurrentSession } from '@/lib/identity'
import { findRecognitionById } from '@/lib/data'
import { atomicUpdateJson } from '@/lib/queue/githubQueue'
import type { Recognition, RecognitionVoucher } from '@/lib/types'

export const runtime = 'nodejs'

const RECOGNITIONS_PATH = 'src/data/recognitions.json'

function bad(message: string, status = 400) {
  return NextResponse.json({ message }, { status })
}

interface Body {
  amount?: number
  provider?: string
  confirmDelivered?: boolean
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await getCurrentSession()
  if (!session) return bad('Unauthorised.', 401)
  if (session.role !== 'Admin' && session.role !== 'HR') {
    return bad('Only HR or Admin can record voucher delivery.', 403)
  }
  const rec = await findRecognitionById(params.id)
  if (!rec) return bad('Recognition not found.', 404)

  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return bad('Body must be JSON.')
  }
  if (body.amount != null && (typeof body.amount !== 'number' || body.amount < 0)) {
    return bad('amount must be a non-negative number.')
  }

  const now = new Date().toISOString()

  await atomicUpdateJson<Recognition[]>(
    RECOGNITIONS_PATH,
    (current) => {
      const list = Array.isArray(current) ? current : []
      const next = list.map((r) => {
        if (r.id !== params.id) return r
        const prior: RecognitionVoucher = r.voucher ?? {
          amount: 500,
          currency: 'INR',
          provider: 'Amazon',
          deliveredAt: null,
          deliveryConfirmedBy: null,
        }
        const updated: RecognitionVoucher = {
          ...prior,
          amount: body.amount ?? prior.amount,
          provider: body.provider ?? prior.provider,
          deliveredAt: body.confirmDelivered ? now : prior.deliveredAt,
          deliveryConfirmedBy: body.confirmDelivered ? session.email : prior.deliveryConfirmedBy,
        }
        return {
          ...r,
          voucher: updated,
          auditLog: [
            ...r.auditLog,
            {
              timestamp: now,
              user: session.email,
              action: body.confirmDelivered
                ? 'recognition.voucher-delivered'
                : 'recognition.voucher-update',
              after: { amount: updated.amount, provider: updated.provider, deliveredAt: updated.deliveredAt },
            },
          ],
        }
      })
      return {
        next,
        commitMessage: `feat(recognition): voucher update ${params.id}`,
      }
    },
    { defaultValue: [] as Recognition[] },
  )
  return NextResponse.json({ ok: true })
}
