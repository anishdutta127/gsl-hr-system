/*
 * Upload the completed handover document for an exiting employee.
 *
 *   POST /api/admin/exit-handover/[employeeId]/document
 *     multipart with file=<File>.
 *
 * Permissions: HR + Admin always; HOD if they are the employee's
 * reporting manager (canEditHandover).
 */

import crypto from 'node:crypto'
import { NextResponse } from 'next/server'
import { getCurrentSession } from '@/lib/identity'
import { findEmployeeById } from '@/lib/data'
import {
  buildHandoverRepoPath,
  canEditHandover,
  emptyHandover,
} from '@/lib/exitHandover'
import {
  atomicUpdateJson,
  deleteBinaryFile,
  putBinaryFile,
} from '@/lib/queue/githubQueue'
import type { ExitHandover, HandoverDocumentFile } from '@/lib/types'

export const runtime = 'nodejs'

const HANDOVERS_PATH = 'src/data/exit_handovers.json'
const MAX_BYTES = 10 * 1024 * 1024
const ALLOWED_EXT = new Set(['.pdf', '.docx', '.doc', '.md'])

function bad(message: string, status = 400) {
  return NextResponse.json({ message }, { status })
}

export async function POST(request: Request, { params }: { params: { employeeId: string } }) {
  const session = await getCurrentSession()
  if (!session) return bad('Unauthorised.', 401)

  const employee = findEmployeeById(params.employeeId)
  if (!employee) return bad('Employee not found.', 404)
  if (!canEditHandover(session, { reportingManagerId: employee.reportingManagerId ?? null })) {
    return bad('Forbidden.', 403)
  }

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
    return bad(`File too large: ${(file.size / 1024 / 1024).toFixed(1)} MB > 10 MB.`, 413)
  }

  const lower = file.name.toLowerCase()
  const dotIdx = lower.lastIndexOf('.')
  const ext = dotIdx >= 0 ? lower.slice(dotIdx) : ''
  if (!ALLOWED_EXT.has(ext)) {
    return bad(`File type ${ext || 'unknown'} not allowed. Use PDF, DOCX, or MD.`)
  }

  const fileId = `hand-${crypto.randomUUID()}`
  const repoPath = buildHandoverRepoPath(params.employeeId, fileId, ext)
  const bytes = Buffer.from(await file.arrayBuffer())
  const now = new Date().toISOString()

  let fileWritten = false
  try {
    await putBinaryFile(
      repoPath,
      bytes,
      `feat(exit-handover): upload doc for ${employee.name.slice(0, 40)} (${params.employeeId.slice(0, 8)})`,
    )
    fileWritten = true

    const docMeta: HandoverDocumentFile = {
      uploadedAt: now,
      uploadedBy: session!.email,
      filename: file.name,
      fileSize: file.size,
      storageRef: repoPath,
    }

    await atomicUpdateJson<ExitHandover[]>(
      HANDOVERS_PATH,
      (current) => {
        const list = Array.isArray(current) ? current : []
        const idx = list.findIndex((h) => h.employeeId === params.employeeId)
        const base = idx >= 0 ? list[idx]! : emptyHandover(params.employeeId, now)
        const updated: ExitHandover = {
          ...base,
          document: docMeta,
          updatedAt: now,
          // Re-uploading after review resets review state to make HR look
          // at the new version - safer than silently keeping the stale
          // reviewed-at on a different file.
          reviewedAt: null,
          reviewedBy: null,
          reviewNotes: '',
          auditLog: [
            ...base.auditLog,
            {
              timestamp: now,
              user: session!.email,
              action: 'exit-handover.upload',
              after: { filename: file.name, fileSize: file.size, storageRef: repoPath },
            },
          ],
        }
        const next = idx >= 0 ? [...list.slice(0, idx), updated, ...list.slice(idx + 1)] : [...list, updated]
        return {
          next,
          commitMessage: `feat(exit-handover): record doc for ${params.employeeId}`,
        }
      },
      { defaultValue: [] as ExitHandover[] },
    )
    return NextResponse.json({ ok: true, document: docMeta })
  } catch (err) {
    if (fileWritten) {
      await deleteBinaryFile(repoPath, 'enqueue failed for exit-handover.upload')
    }
    const message = err instanceof Error ? err.message : 'Upload failed.'
    return bad(message, 503)
  }
}
