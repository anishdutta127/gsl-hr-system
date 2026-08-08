/*
 * Recognition employee photo upload.
 *
 *   POST /api/admin/recognition/[id]/photo  - multipart file=<image>
 *
 * Stored as public/recognition-photos/[recognitionId].jpg (cropped to a
 * 1:1 square client-side before upload). Public/ is served as a CDN
 * asset so the public /celebrate page can <img src> it directly.
 *
 * HR-Admin only.
 */

import { NextResponse } from 'next/server'
import { getCurrentSession } from '@/lib/identity'
import { findRecognitionById } from '@/lib/data'
import {
  atomicUpdateJson,
  putBinaryFile,
} from '@/lib/queue/githubQueue'
import type { Recognition } from '@/lib/types'

export const runtime = 'nodejs'

const RECOGNITIONS_PATH = 'src/data/recognitions.json'
const MAX_BYTES = 5 * 1024 * 1024
const ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp'])

function bad(message: string, status = 400) {
  return NextResponse.json({ message }, { status })
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await getCurrentSession()
  if (!session) return bad('Unauthorised.', 401)
  if (session.role !== 'Admin' && session.role !== 'HR') {
    return bad('Only HR or Admin can upload recognition photos.', 403)
  }

  const recognition = await findRecognitionById(params.id)
  if (!recognition) return bad('Recognition not found.', 404)

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return bad('Expected multipart/form-data.')
  }

  const file = formData.get('file')
  if (!(file instanceof File)) return bad('file is required.')
  if (file.size === 0) return bad('Empty file.')
  if (file.size > MAX_BYTES) {
    return bad(`File too large: ${(file.size / 1024 / 1024).toFixed(1)} MB > 5 MB.`, 413)
  }

  const lower = file.name.toLowerCase()
  const dotIdx = lower.lastIndexOf('.')
  const ext = dotIdx >= 0 ? lower.slice(dotIdx) : ''
  if (!ALLOWED_EXT.has(ext)) {
    return bad(`File type ${ext || 'unknown'} not allowed. Use JPG, PNG, or WEBP.`)
  }

  // Photos always land as .jpg under public/recognition-photos/ so the
  // public celebrate page can predict the URL. Client crops to 1:1
  // before posting; if they post a PNG we still rewrite to .jpg.
  const safeRecId = params.id.replace(/[^A-Za-z0-9-]/g, '')
  const repoPath = `public/recognition-photos/${safeRecId}.jpg`
  const bytes = Buffer.from(await file.arrayBuffer())
  const now = new Date().toISOString()

  try {
    await putBinaryFile(
      repoPath,
      bytes,
      `feat(recognition): photo for ${params.id}`,
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upload failed.'
    return bad(message, 503)
  }

  await atomicUpdateJson<Recognition[]>(
    RECOGNITIONS_PATH,
    (current) => {
      const list = Array.isArray(current) ? current : []
      const next = list.map((r) => {
        if (r.id !== params.id) return r
        return {
          ...r,
          employeePhoto: {
            storageRef: `/recognition-photos/${safeRecId}.jpg`,
            uploadedAt: now,
            uploadedBy: session.email,
          },
          auditLog: [
            ...r.auditLog,
            {
              timestamp: now,
              user: session.email,
              action: 'recognition.photo-upload',
              after: { storageRef: `/recognition-photos/${safeRecId}.jpg` },
            },
          ],
        }
      })
      return {
        next,
        commitMessage: `feat(recognition): record photo for ${params.id}`,
      }
    },
    { defaultValue: [] as Recognition[] },
  )

  return NextResponse.json({
    ok: true,
    photo: { storageRef: `/recognition-photos/${safeRecId}.jpg` },
  })
}
