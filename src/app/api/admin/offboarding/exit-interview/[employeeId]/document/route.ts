/*
 * Upload / replace the CONFIDENTIAL exit-interview document.
 *
 *   POST /api/admin/offboarding/exit-interview/[employeeId]/document
 *     multipart with file=<File>.
 *
 * HR + Admin only (canEditExitInterview). The document inherits exit-interview
 * confidentiality - it is served ONLY through the gated GET route, never
 * directly. Replacing deletes the previous file after the record is repointed.
 */

import crypto from 'node:crypto'
import { NextResponse } from 'next/server'
import { getCurrentSession } from '@/lib/identity'
import { findEmployeeById } from '@/lib/data'
import {
  buildExitInterviewDocPath,
  canEditExitInterview,
  loadExitInterviews,
} from '@/lib/offboardingTasks'
import { atomicUpdateJson, deleteBinaryFile, putBinaryFile } from '@/lib/queue/githubQueue'
import type { ExitInterview, ExitInterviewDocumentFile } from '@/lib/types'

export const runtime = 'nodejs'

const FILE_PATH = 'src/data/exit_interviews.json'
const MAX_BYTES = 15 * 1024 * 1024
const ALLOWED_EXT = new Set(['.pdf', '.docx', '.doc', '.md', '.txt', '.rtf', '.odt'])

function bad(message: string, status = 400) {
  return NextResponse.json({ message }, { status })
}

function emptyInterview(employeeId: string, now: string, by: string): ExitInterview {
  return {
    employeeId,
    conductedAt: now,
    conductedBy: by,
    reasonForLeaving: '',
    wouldRecommend: null,
    satisfactionWithManager: null,
    satisfactionWithRole: null,
    topThingsToChange: '',
    freeText: '',
    interviewDocument: null,
    auditLog: [],
  }
}

export async function POST(request: Request, { params }: { params: { employeeId: string } }) {
  const session = await getCurrentSession()
  if (!canEditExitInterview(session)) {
    return bad('Only Admin or HR can upload exit-interview documents.', 403)
  }
  const employee = await findEmployeeById(params.employeeId)
  if (!employee) return bad('Employee not found.', 404)

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
    return bad(`File too large: ${(file.size / 1024 / 1024).toFixed(1)} MB > 15 MB.`, 413)
  }
  const lower = file.name.toLowerCase()
  const dotIdx = lower.lastIndexOf('.')
  const ext = dotIdx >= 0 ? lower.slice(dotIdx) : ''
  if (!ALLOWED_EXT.has(ext)) {
    return bad(`File type ${ext || 'unknown'} not allowed. Use PDF, DOCX, DOC, ODT, RTF, MD or TXT.`)
  }

  const fileId = `intv-${crypto.randomUUID()}`
  const repoPath = buildExitInterviewDocPath(params.employeeId, fileId, ext)
  const bytes = Buffer.from(await file.arrayBuffer())
  const now = new Date().toISOString()
  const existing = loadExitInterviews().find((i) => i.employeeId === employee.id)
  const oldRef = existing?.interviewDocument?.storageRef ?? null

  let fileWritten = false
  try {
    await putBinaryFile(
      repoPath,
      bytes,
      `feat(exit-interview): upload confidential doc (${params.employeeId.slice(0, 8)})`,
    )
    fileWritten = true

    const docMeta: ExitInterviewDocumentFile = {
      uploadedAt: now,
      uploadedBy: session!.email,
      filename: file.name,
      fileSize: file.size,
      storageRef: repoPath,
    }

    await atomicUpdateJson<ExitInterview[]>(
      FILE_PATH,
      (current) => {
        const list = Array.isArray(current) ? current : []
        const idx = list.findIndex((i) => i.employeeId === employee.id)
        const base = idx >= 0 ? list[idx]! : emptyInterview(employee.id, now, session!.email)
        const updated: ExitInterview = {
          ...base,
          interviewDocument: docMeta,
          auditLog: [
            ...base.auditLog,
            {
              timestamp: now,
              user: session!.email,
              action: oldRef ? 'exit-interview.document.replace' : 'exit-interview.document.upload',
              after: { filename: file.name, fileSize: file.size, storageRef: repoPath },
            },
          ],
        }
        const next = idx >= 0 ? [...list.slice(0, idx), updated, ...list.slice(idx + 1)] : [...list, updated]
        return {
          next,
          commitMessage: `feat(exit-interview): ${oldRef ? 'replace' : 'add'} doc for ${employee.id.slice(0, 8)}`,
        }
      },
      { defaultValue: [] as ExitInterview[] },
    )

    // Only after the record points at the new file: drop the replaced one.
    if (oldRef && oldRef !== repoPath) {
      await deleteBinaryFile(oldRef, 'exit-interview document replaced')
    }
    return NextResponse.json({ ok: true, document: docMeta })
  } catch (err) {
    if (fileWritten) {
      await deleteBinaryFile(repoPath, 'atomicUpdate failed for exit-interview doc upload')
    }
    const message = err instanceof Error ? err.message : 'Upload failed.'
    return bad(message, 503)
  }
}
