/*
 * Document upload + delete + verify endpoints.
 *
 * Permissions: Admin and HR. Reporting Managers and Leadership (even
 * allowlisted) cannot mutate; allowlisted Leadership can read via the
 * checklist page.
 *
 *   POST   /api/admin/documents             - upload (multipart with employeeId, templateId, file, expiresAt?)
 *   PATCH  /api/admin/documents             - update document (id; verify, notes, expiresAt)
 *   DELETE /api/admin/documents?id=...      - delete a document record + the file
 */

import crypto from 'node:crypto'
import { NextResponse } from 'next/server'
import { getCurrentSession } from '@/lib/identity'
import { findEmployeeById } from '@/lib/data'
import { canEditEmployeeDocuments, buildHrDocumentRepoPath, loadEmployeeDocuments } from '@/lib/documents'
import {
  atomicUpdateJson,
  deleteBinaryFile,
  putBinaryFile,
  QueueUpstreamError,
} from '@/lib/queue/githubQueue'
import type { EmployeeDocument } from '@/lib/types'

export const runtime = 'nodejs'

const DOCUMENTS_PATH = 'src/data/employee_documents.json'
const MAX_BYTES = 10 * 1024 * 1024 // 10 MB
const ALLOWED_EXT = new Set(['.pdf', '.png', '.jpg', '.jpeg', '.xlsx', '.xls', '.docx'])

function bad(message: string, status = 400) {
  return NextResponse.json({ message }, { status })
}

export async function POST(request: Request) {
  const session = await getCurrentSession()
  if (!canEditEmployeeDocuments(session)) {
    return bad('Only Admin or HR can upload documents.', 403)
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return bad('Expected multipart/form-data.')
  }

  const employeeId = String(formData.get('employeeId') ?? '').trim()
  const templateId = String(formData.get('templateId') ?? '').trim()
  const expiresAtRaw = formData.get('expiresAt')
  const expiresAt =
    typeof expiresAtRaw === 'string' && expiresAtRaw.trim() ? expiresAtRaw.trim() : null
  const file = formData.get('file')

  if (!employeeId || !templateId) return bad('employeeId and templateId are required.')
  if (!(file instanceof File)) return bad('file is required.')
  if (file.size === 0) return bad('Empty file.')
  if (file.size > MAX_BYTES) {
    return bad(`File too large: ${(file.size / 1024 / 1024).toFixed(1)} MB > 10 MB.`, 413)
  }

  const employee = await findEmployeeById(employeeId)
  if (!employee) return bad('Employee not found.', 404)

  const lower = file.name.toLowerCase()
  const dotIdx = lower.lastIndexOf('.')
  const ext = dotIdx >= 0 ? lower.slice(dotIdx) : ''
  if (!ALLOWED_EXT.has(ext)) {
    return bad(`File type ${ext || 'unknown'} not allowed. Use PDF/PNG/JPG/XLSX/DOCX.`)
  }

  const now = new Date().toISOString()
  const docId = `doc-${crypto.randomUUID()}`
  const repoPath = buildHrDocumentRepoPath(employeeId, docId, ext)
  const bytes = Buffer.from(await file.arrayBuffer())

  let fileWritten = false
  try {
    await putBinaryFile(
      repoPath,
      bytes,
      `feat(hr-documents): upload ${templateId} for ${employee.name.slice(0, 40)} (${employeeId.slice(0, 8)})`,
    )
    fileWritten = true

    const newDoc: EmployeeDocument = {
      id: docId,
      employeeId,
      templateId,
      uploadedAt: now,
      uploadedBy: session!.email,
      filePath: repoPath,
      originalFileName: file.name,
      fileSize: file.size,
      expiresAt,
      verified: false,
      auditLog: [
        {
          timestamp: now,
          user: session!.email,
          action: 'document.upload',
          after: {
            employeeId,
            templateId,
            filePath: repoPath,
            originalFileName: file.name,
            fileSize: file.size,
            expiresAt,
          },
        },
      ],
    }

    await atomicUpdateJson<EmployeeDocument[]>(
      DOCUMENTS_PATH,
      (current) => {
        const list = Array.isArray(current) ? current : []
        return {
          next: [...list, newDoc],
          commitMessage: `feat(hr-documents): record upload ${docId.slice(0, 12)}`,
        }
      },
      { defaultValue: [] as EmployeeDocument[] },
    )

    return NextResponse.json({ ok: true, document: newDoc })
  } catch (err) {
    if (fileWritten) {
      await deleteBinaryFile(repoPath, 'enqueue failed for document.upload')
    }
    if (err instanceof QueueUpstreamError) {
      return bad(err.message, 503)
    }
    const message = err instanceof Error ? err.message : 'Upload failed.'
    return bad(message, 503)
  }
}

interface PatchBody {
  id: string
  verified?: boolean
  notes?: string | null
  expiresAt?: string | null
}

export async function PATCH(request: Request) {
  const session = await getCurrentSession()
  if (!canEditEmployeeDocuments(session)) {
    return bad('Only Admin or HR can edit documents.', 403)
  }

  let body: PatchBody
  try {
    body = (await request.json()) as PatchBody
  } catch {
    return bad('Body must be JSON.')
  }
  const id = body.id?.trim()
  if (!id) return bad('id is required.')

  const now = new Date().toISOString()
  let touched = false

  await atomicUpdateJson<EmployeeDocument[]>(
    DOCUMENTS_PATH,
    (current) => {
      const list = Array.isArray(current) ? current : []
      const next = list.map((d) => {
        if (d.id !== id) return d
        touched = true
        const before = {
          verified: d.verified,
          notes: d.notes,
          expiresAt: d.expiresAt ?? null,
        }
        const after: EmployeeDocument = {
          ...d,
          verified: body.verified ?? d.verified,
          verifiedAt: body.verified ? now : d.verifiedAt,
          verifiedBy: body.verified ? session!.email : d.verifiedBy,
          notes: body.notes === null ? undefined : body.notes ?? d.notes,
          expiresAt: body.expiresAt === null ? null : body.expiresAt ?? d.expiresAt,
        }
        after.auditLog = [
          ...d.auditLog,
          {
            timestamp: now,
            user: session!.email,
            action: 'document.update',
            before,
            after: {
              verified: after.verified,
              notes: after.notes,
              expiresAt: after.expiresAt,
            },
          },
        ]
        return after
      })
      return {
        next,
        commitMessage: `feat(hr-documents): update ${id.slice(0, 12)}`,
      }
    },
    { defaultValue: [] as EmployeeDocument[] },
  )

  if (!touched) return bad('Document not found.', 404)
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: Request) {
  const session = await getCurrentSession()
  if (!canEditEmployeeDocuments(session)) {
    return bad('Only Admin or HR can delete documents.', 403)
  }
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')?.trim()
  if (!id) return bad('id is required.')

  const existing = loadEmployeeDocuments().find((d) => d.id === id)
  if (!existing) return bad('Document not found.', 404)

  await atomicUpdateJson<EmployeeDocument[]>(
    DOCUMENTS_PATH,
    (current) => {
      const list = Array.isArray(current) ? current : []
      return {
        next: list.filter((d) => d.id !== id),
        commitMessage: `feat(hr-documents): delete ${id.slice(0, 12)}`,
      }
    },
    { defaultValue: [] as EmployeeDocument[] },
  )

  await deleteBinaryFile(existing.filePath, `document.delete by ${session!.email}`)
  return NextResponse.json({ ok: true })
}
