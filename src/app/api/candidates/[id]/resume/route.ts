import path from 'node:path'
import { NextResponse } from 'next/server'
import { findCandidateById } from '@/lib/data'
import { getCurrentSession } from '@/lib/identity'
import { enqueueUpdate } from '@/lib/queue/pendingUpdates'
import { putBinaryFile } from '@/lib/queue/githubQueue'

export const runtime = 'nodejs'

const MAX_BYTES = 10 * 1024 * 1024 // 10 MB
const ALLOWED_EXTS = new Set(['.pdf', '.docx'])

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await getCurrentSession()
  if (!session) return NextResponse.json({ message: 'Not signed in.' }, { status: 401 })
  if (session.role !== 'Admin' && session.role !== 'HR') {
    return NextResponse.json({ message: 'Only Admin or HR can upload resumes.' }, { status: 403 })
  }

  const candidate = findCandidateById(params.id)
  if (!candidate) return NextResponse.json({ message: 'Candidate not found.' }, { status: 404 })

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ message: 'Expected multipart/form-data.' }, { status: 400 })
  }

  const file = formData.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ message: 'No file provided.' }, { status: 400 })
  }
  if (file.size === 0) {
    return NextResponse.json({ message: 'File is empty.' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ message: 'File exceeds 10 MB limit.' }, { status: 413 })
  }

  const ext = path.extname(file.name).toLowerCase()
  if (!ALLOWED_EXTS.has(ext)) {
    return NextResponse.json({ message: 'Only .pdf or .docx allowed.' }, { status: 400 })
  }

  // Path: onedrive-data/seed/resumes/uploaded/{candidateId}{ext}
  // Predictable path means re-upload overwrites cleanly via the same sha+PUT.
  const repoPath = `onedrive-data/seed/resumes/uploaded/${candidate.id}${ext}`
  const bytes = Buffer.from(await file.arrayBuffer())

  try {
    await putBinaryFile(
      repoPath,
      bytes,
      `feat(resumes): upload for ${candidate.name.slice(0, 40)} (${candidate.id.slice(0, 8)})`,
    )
    await enqueueUpdate({
      queuedBy: session.email,
      entity: 'candidate',
      operation: 'update',
      payload: {
        id: candidate.id,
        operation: 'candidate.set-resume',
        before: { resumeFilePath: candidate.resumeFilePath ?? null },
        after: { resumeFilePath: repoPath },
        notes: `Resume uploaded by ${session.email} (${file.name}, ${(file.size / 1024).toFixed(0)} KB).`,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upload failed.'
    return NextResponse.json({ message }, { status: 503 })
  }

  return NextResponse.json({ ok: true, resumeFilePath: repoPath })
}
