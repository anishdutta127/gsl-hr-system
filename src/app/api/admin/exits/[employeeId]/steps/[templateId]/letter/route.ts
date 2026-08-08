/*
 * Upload / replace the FINAL letter for a letter step of an exit process.
 *
 *   POST /api/admin/exits/[employeeId]/steps/[templateId]/letter
 *     multipart with file=<File>.
 *
 * HR + Admin only (canEditExitProcess). The document inherits the step's
 * visibility - it is served ONLY through the gated per-step GET route
 * (canViewExitLetterDocument), never directly, so the No Dues letter (which
 * carries settlement figures) never reaches a reporting manager / HOD.
 *
 * A present letter (uploaded here, or generated earlier) satisfies the step:
 * the upload marks it Completed. Replacing deletes the previous file after the
 * record is repointed. atomicUpdateJson + auditLog, same as every exit write.
 */

import crypto from 'node:crypto'
import { NextResponse } from 'next/server'
import { getCurrentSession } from '@/lib/identity'
import { findEmployeeById } from '@/lib/data'
import {
  applyStepPatch,
  buildExitLetterDocPath,
  canEditExitProcess,
  letterTemplateIdForKind,
  loadExitProcesses,
  stepActionLabel,
} from '@/lib/exitProcess'
import { atomicUpdateJson, deleteBinaryFile, putBinaryFile } from '@/lib/queue/githubQueue'
import type { ExitLetterDocumentFile, ExitProcess } from '@/lib/types'

export const runtime = 'nodejs'

const PROCESSES_PATH = 'src/data/exit_processes.json'
const MAX_BYTES = 15 * 1024 * 1024
// Signed letters come back as scanned PDFs; drafts as .docx/.doc.
const ALLOWED_EXT = new Set(['.pdf', '.docx', '.doc'])

function bad(message: string, status = 400) {
  return NextResponse.json({ message }, { status })
}

export async function POST(
  request: Request,
  { params }: { params: { employeeId: string; templateId: string } },
) {
  const session = await getCurrentSession()
  if (!session) return bad('Not signed in.', 401)
  if (!canEditExitProcess(session)) {
    return bad('Only Admin or HR can upload an exit letter.', 403)
  }
  const employee = await findEmployeeById(params.employeeId)
  if (!employee) return bad('Employee not found.', 404)

  const exitProc = loadExitProcesses().find((p) => p.employeeId === params.employeeId)
  if (!exitProc) return bad('No exit in progress for this employee.', 404)
  const step = exitProc.steps.find((s) => s.templateId === params.templateId)
  if (!step) return bad('Step not found.', 404)
  if (!letterTemplateIdForKind(step.kind)) {
    return bad('This step does not take a letter document.', 400)
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
    return bad(`File too large: ${(file.size / 1024 / 1024).toFixed(1)} MB > 15 MB.`, 413)
  }
  const lower = file.name.toLowerCase()
  const dotIdx = lower.lastIndexOf('.')
  const ext = dotIdx >= 0 ? lower.slice(dotIdx) : ''
  if (!ALLOWED_EXT.has(ext)) {
    return bad(`File type ${ext || 'unknown'} not allowed. Upload a PDF or DOCX.`)
  }

  const fileId = `letter-${crypto.randomUUID()}`
  const repoPath = buildExitLetterDocPath(params.employeeId, params.templateId, fileId, ext)
  const bytes = Buffer.from(await file.arrayBuffer())
  const now = new Date().toISOString()
  const oldRef = step.data.letterDocument?.storageRef ?? null
  const label = stepActionLabel(step.kind)

  let fileWritten = false
  try {
    await putBinaryFile(
      repoPath,
      bytes,
      `feat(exits): upload ${label} letter (${params.employeeId.slice(0, 8)})`,
    )
    fileWritten = true

    const docMeta: ExitLetterDocumentFile = {
      uploadedAt: now,
      uploadedBy: session.email,
      filename: file.name,
      fileSize: file.size,
      storageRef: repoPath,
    }

    await atomicUpdateJson<ExitProcess[]>(
      PROCESSES_PATH,
      (current) => {
        const list = Array.isArray(current) ? current : []
        const next = list.map((p) =>
          p.employeeId === params.employeeId
            ? applyStepPatch({
                process: p,
                templateId: params.templateId,
                // A present letter satisfies the step: mark it Completed.
                patch: { status: 'Completed', data: { letterDocument: docMeta } },
                by: session.email,
                now,
                action: `exit.${label}.letter.${oldRef ? 'replace' : 'upload'}`,
              })
            : p,
        )
        return {
          next,
          commitMessage: `feat(exits): ${oldRef ? 'replace' : 'add'} ${label} letter ${params.employeeId.slice(0, 8)}`,
        }
      },
      { defaultValue: loadExitProcesses() },
    )

    // Only after the record points at the new file: drop the replaced one.
    if (oldRef && oldRef !== repoPath) {
      await deleteBinaryFile(oldRef, 'exit letter replaced')
    }
    return NextResponse.json({ ok: true, document: docMeta })
  } catch (err) {
    if (fileWritten) {
      await deleteBinaryFile(repoPath, 'atomicUpdate failed for exit letter upload')
    }
    const message = err instanceof Error ? err.message : 'Upload failed.'
    return bad(message, 503)
  }
}
