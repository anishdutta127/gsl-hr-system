/*
 * Serve / remove the FINAL letter for a letter step of an exit process.
 *
 *   GET    .../steps/[templateId]/letter/[fileId]  -> streams the file
 *   DELETE .../steps/[templateId]/letter/[fileId]  -> removes it
 *
 * GET is gated on canViewExitLetterDocument(session, step.kind): the No Dues
 * letter carries settlement figures so it is HR/Admin-only (a reporting manager
 * / HOD gets 403); relieving/experience follow the exit leadership allowlist.
 * This is the confidentiality boundary - enforced here at the fetch route, not
 * just the UI. DELETE is gated on canEditExitProcess (HR + Admin) and reverts
 * the step from Completed when no letter (uploaded, generated or signed) remains.
 */

import fs from 'node:fs'
import path from 'node:path'
import { NextResponse } from 'next/server'
import { getCurrentSession } from '@/lib/identity'
import { findEmployeeById } from '@/lib/data'
import {
  applyStepPatch,
  assertInsideExitLetterDocsRoot,
  canEditExitProcess,
  canViewExitLetterDocument,
  loadExitProcesses,
  stepActionLabel,
} from '@/lib/exitProcess'
import { atomicUpdateJson, deleteBinaryFile } from '@/lib/queue/githubQueue'
import type { ExitProcess, ExitStepStatus } from '@/lib/types'

export const runtime = 'nodejs'

const PROCESSES_PATH = 'src/data/exit_processes.json'

const CONTENT_TYPES: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.doc': 'application/msword',
}

function json(message: string, status: number) {
  return NextResponse.json({ message }, { status })
}

export async function GET(
  _request: Request,
  { params }: { params: { employeeId: string; templateId: string; fileId: string } },
) {
  const session = await getCurrentSession()
  if (!session) return json('Unauthorised.', 401)

  const employee = await findEmployeeById(params.employeeId)
  if (!employee) return json('Employee not found.', 404)

  const exitProc = loadExitProcesses().find((p) => p.employeeId === params.employeeId)
  const step = exitProc?.steps.find((s) => s.templateId === params.templateId)
  if (!step) return json('Step not found.', 404)

  // Confidentiality gate - the whole point of this route. Keyed on the step
  // kind: No Dues (financial) is HR/Admin only; relieving/experience follow the
  // exit leadership allowlist. HOD / reporting manager never.
  if (!canViewExitLetterDocument(session, step.kind)) return json('Forbidden.', 403)

  const doc = step.data.letterDocument
  if (!doc) return json('No letter document.', 404)
  // fileId must match the stored ref (prevents guessing another file).
  if (!doc.storageRef.includes(params.fileId)) return json('File reference mismatch.', 404)
  if (path.isAbsolute(doc.storageRef) || doc.storageRef.includes('..')) {
    return json('Stored path is malformed.', 400)
  }
  const absolute = path.resolve(process.cwd(), doc.storageRef)
  try {
    assertInsideExitLetterDocsRoot(absolute)
  } catch {
    return json('Path escapes exit-letter-docs root.', 403)
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
      // Confidential (No Dues carries settlement figures) - never cache in a
      // shared / proxy cache.
      'Cache-Control': 'private, no-store',
    },
  })
}

export async function DELETE(
  _request: Request,
  { params }: { params: { employeeId: string; templateId: string; fileId: string } },
) {
  const session = await getCurrentSession()
  if (!session) return json('Not signed in.', 401)
  if (!canEditExitProcess(session)) return json('Only Admin or HR can remove an exit letter.', 403)

  const employee = await findEmployeeById(params.employeeId)
  if (!employee) return json('Employee not found.', 404)

  const exitProc = loadExitProcesses().find((p) => p.employeeId === params.employeeId)
  const step = exitProc?.steps.find((s) => s.templateId === params.templateId)
  if (!step) return json('Step not found.', 404)
  const doc = step.data.letterDocument
  if (!doc || !doc.storageRef.includes(params.fileId)) return json('Letter document not found.', 404)

  const now = new Date().toISOString()
  const label = stepActionLabel(step.kind)

  await atomicUpdateJson<ExitProcess[]>(
    PROCESSES_PATH,
    (current) => {
      const list = Array.isArray(current) ? current : []
      const next = list.map((p) => {
        if (p.employeeId !== params.employeeId) return p
        const s = p.steps.find((x) => x.templateId === params.templateId)
        // Revert completion only when no other letter signal survives removal:
        // a generated letter (letterIssuedAt) or, for No Dues, a recorded signed
        // copy still counts as "letter present" and keeps the step Completed.
        const hasOtherSignal = Boolean(s?.data.letterIssuedAt) || Boolean(s?.data.signed)
        const nextStatus: ExitStepStatus | undefined =
          s?.status === 'Completed' && !hasOtherSignal ? 'Not Started' : undefined
        return applyStepPatch({
          process: p,
          templateId: params.templateId,
          patch: { status: nextStatus, data: { letterDocument: null } },
          by: session.email,
          now,
          action: `exit.${label}.letter.remove`,
        })
      })
      return {
        next,
        commitMessage: `feat(exits): remove ${label} letter ${params.employeeId.slice(0, 8)}`,
      }
    },
    { defaultValue: loadExitProcesses() },
  )

  await deleteBinaryFile(doc.storageRef, 'exit letter removed')
  return NextResponse.json({ ok: true })
}
