import path from 'node:path'
import { NextResponse } from 'next/server'
import { findCandidateById } from '@/lib/data'
import { getCurrentCandidateId } from '@/lib/candidateIdentity'
import { enqueueUpdate } from '@/lib/queue/pendingUpdates'
import { putBinaryFile, QueueUpstreamError } from '@/lib/queue/githubQueue'
import { buildResumeRepoPath } from '@/lib/resumePath'

export const runtime = 'nodejs'

const MAX_BYTES = 5 * 1024 * 1024 // 5 MB — tighter than staff upload, candidates send PDFs only.
const ALLOWED_EXTS = new Set(['.pdf'])

export async function POST(request: Request) {
  const candidateId = await getCurrentCandidateId()
  if (!candidateId) {
    return NextResponse.json(
      { message: 'Your session has expired. Request a new link from the portal.' },
      { status: 401 },
    )
  }
  const candidate = findCandidateById(candidateId)
  if (!candidate) {
    return NextResponse.json({ message: 'Candidate record not found.' }, { status: 404 })
  }

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
    return NextResponse.json({ message: 'File exceeds 5 MB limit.' }, { status: 413 })
  }
  if (file.name.includes('..') || file.name.includes('/') || file.name.includes('\\')) {
    return NextResponse.json({ message: 'Filename contains illegal characters.' }, { status: 400 })
  }

  const ext = path.extname(file.name).toLowerCase()
  if (!ALLOWED_EXTS.has(ext)) {
    return NextResponse.json({ message: 'Please upload a PDF.' }, { status: 400 })
  }

  const repoPath = buildResumeRepoPath(candidate.id, ext)
  const bytes = Buffer.from(await file.arrayBuffer())

  try {
    await putBinaryFile(
      repoPath,
      bytes,
      `feat(resumes): self-upload by ${candidate.name.slice(0, 40)} (${candidate.id.slice(0, 8)})`,
    )
    await enqueueUpdate({
      queuedBy: `candidate:${candidate.email}`,
      entity: 'candidate',
      operation: 'update',
      payload: {
        id: candidate.id,
        operation: 'candidate.set-resume',
        before: { resumeFilePath: candidate.resumeFilePath ?? null },
        after: { resumeFilePath: repoPath },
        notes: `Resume self-uploaded via candidate portal (${file.name}, ${(file.size / 1024).toFixed(0)} KB).`,
      },
    })
  } catch (err) {
    if (err instanceof QueueUpstreamError && err.status === 409) {
      console.error('[portal-resume-upload] 409 path conflict on', repoPath, err.body)
      return NextResponse.json(
        { message: 'Upload could not be saved. Please try again in a minute or write to HR.' },
        { status: 503 },
      )
    }
    const message = err instanceof Error ? err.message : 'Upload failed.'
    return NextResponse.json({ message }, { status: 503 })
  }

  return NextResponse.json({ ok: true })
}
