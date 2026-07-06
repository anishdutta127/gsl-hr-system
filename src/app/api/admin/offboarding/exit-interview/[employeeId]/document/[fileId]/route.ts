/*
 * Serve / remove the CONFIDENTIAL exit-interview document.
 *
 *   GET    .../exit-interview/[employeeId]/document/[fileId]  -> streams the file
 *   DELETE .../exit-interview/[employeeId]/document/[fileId]  -> removes it
 *
 * GET is gated on canViewExitInterview (HR + Admin always; HOD NEVER; a
 * reporting manager NEVER; Leadership only when allowlisted). This is the
 * confidentiality boundary - enforced here at the fetch route, not just the UI.
 * The document can contain candid feedback about the reporting manager.
 * DELETE is gated on canEditExitInterview (HR + Admin only).
 */

import fs from 'node:fs'
import path from 'node:path'
import { NextResponse } from 'next/server'
import { getCurrentSession } from '@/lib/identity'
import { findEmployeeById } from '@/lib/data'
import {
  assertInsideExitInterviewDocsRoot,
  canEditExitInterview,
  canViewExitInterview,
  loadExitInterviews,
} from '@/lib/offboardingTasks'
import { atomicUpdateJson, deleteBinaryFile } from '@/lib/queue/githubQueue'
import type { ExitInterview } from '@/lib/types'

export const runtime = 'nodejs'

const FILE_PATH = 'src/data/exit_interviews.json'

const CONTENT_TYPES: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.doc': 'application/msword',
  '.odt': 'application/vnd.oasis.opendocument.text',
  '.rtf': 'application/rtf',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
}

function json(message: string, status: number) {
  return NextResponse.json({ message }, { status })
}

export async function GET(
  _request: Request,
  { params }: { params: { employeeId: string; fileId: string } },
) {
  const session = await getCurrentSession()
  if (!session) return json('Unauthorised.', 401)
  // Confidentiality gate - the whole point of this route.
  if (!canViewExitInterview(session)) return json('Forbidden.', 403)

  const employee = findEmployeeById(params.employeeId)
  if (!employee) return json('Employee not found.', 404)

  const interview = loadExitInterviews().find((i) => i.employeeId === params.employeeId)
  const doc = interview?.interviewDocument
  if (!doc) return json('No exit-interview document.', 404)
  // fileId must match the stored ref (prevents guessing another file).
  if (!doc.storageRef.includes(params.fileId)) return json('File reference mismatch.', 404)
  if (path.isAbsolute(doc.storageRef) || doc.storageRef.includes('..')) {
    return json('Stored path is malformed.', 400)
  }
  const absolute = path.resolve(process.cwd(), doc.storageRef)
  try {
    assertInsideExitInterviewDocsRoot(absolute)
  } catch {
    return json('Path escapes exit-interview-docs root.', 403)
  }
  if (!fs.existsSync(absolute)) {
    return json('File missing on disk. Storage and record have drifted.', 404)
  }

  const buffer = fs.readFileSync(absolute)
  const ext = path.extname(absolute).toLowerCase()
  const contentType = CONTENT_TYPES[ext] ?? 'application/octet-stream'
  const inline = ext === '.pdf'
  const safeName = doc.filename.replace(/"/g, '')
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${safeName}"`,
      // Confidential - never cache in a shared/proxy cache.
      'Cache-Control': 'private, no-store',
    },
  })
}

export async function DELETE(
  _request: Request,
  { params }: { params: { employeeId: string; fileId: string } },
) {
  const session = await getCurrentSession()
  if (!canEditExitInterview(session)) return json('Only Admin or HR can remove the document.', 403)

  const employee = findEmployeeById(params.employeeId)
  if (!employee) return json('Employee not found.', 404)

  const interview = loadExitInterviews().find((i) => i.employeeId === params.employeeId)
  const doc = interview?.interviewDocument
  if (!doc || !doc.storageRef.includes(params.fileId)) return json('Document not found.', 404)

  const now = new Date().toISOString()
  await atomicUpdateJson<ExitInterview[]>(
    FILE_PATH,
    (current) => {
      const list = Array.isArray(current) ? current : []
      const idx = list.findIndex((i) => i.employeeId === params.employeeId)
      if (idx < 0) return { next: list, commitMessage: `chore(exit-interview): no-op remove ${params.employeeId.slice(0, 8)}` }
      const base = list[idx]!
      const updated: ExitInterview = {
        ...base,
        interviewDocument: null,
        auditLog: [
          ...base.auditLog,
          {
            timestamp: now,
            user: session!.email,
            action: 'exit-interview.document.remove',
            before: { storageRef: doc.storageRef, filename: doc.filename },
          },
        ],
      }
      return {
        next: [...list.slice(0, idx), updated, ...list.slice(idx + 1)],
        commitMessage: `feat(exit-interview): remove doc for ${params.employeeId.slice(0, 8)}`,
      }
    },
    { defaultValue: [] as ExitInterview[] },
  )
  await deleteBinaryFile(doc.storageRef, 'exit-interview document removed')
  return NextResponse.json({ ok: true })
}
