import { NextResponse } from 'next/server'
import { findCandidateById } from '@/lib/data'
import { getCurrentCandidateId } from '@/lib/candidateIdentity'
import { enqueueUpdate } from '@/lib/queue/pendingUpdates'
import {
  deleteBinaryFile,
  putBinaryFile,
  QueueUpstreamError,
} from '@/lib/queue/githubQueue'
import { buildResumeRepoPath } from '@/lib/resumePath'
import {
  CANDIDATE_UPLOAD_PROFILE,
  validateUploadedResume,
} from '@/lib/resumeUpload'

export const runtime = 'nodejs'

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
  const check = validateUploadedResume(file, CANDIDATE_UPLOAD_PROFILE)
  if (!check.ok) {
    return NextResponse.json({ message: check.message }, { status: check.status })
  }

  const repoPath = buildResumeRepoPath(candidate.id, check.ext)
  const bytes = Buffer.from(await (file as File).arrayBuffer())
  const fileName = (file as File).name
  const fileSize = (file as File).size

  let fileWritten = false
  // See HR-side route for the rationale: same-month re-upload reuses the
  // exact path, so cleanup on enqueue failure must skip the overwrite case
  // or it deletes the candidate's existing resume.
  const wasOverwrite = candidate.resumeFilePath === repoPath
  try {
    await putBinaryFile(
      repoPath,
      bytes,
      `feat(resumes): self-upload by ${candidate.name.slice(0, 40)} (${candidate.id.slice(0, 8)})`,
    )
    fileWritten = true
    await enqueueUpdate({
      queuedBy: `candidate:${candidate.email}`,
      entity: 'candidate',
      operation: 'update',
      payload: {
        id: candidate.id,
        operation: 'candidate.set-resume',
        before: { resumeFilePath: candidate.resumeFilePath ?? null },
        after: { resumeFilePath: repoPath },
        notes: `Resume self-uploaded via candidate portal (${fileName}, ${(fileSize / 1024).toFixed(0)} KB).`,
      },
    })
  } catch (err) {
    if (fileWritten && !wasOverwrite) {
      await deleteBinaryFile(repoPath, 'enqueue failed for candidate.set-resume (portal)')
    }
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

  return NextResponse.json({ ok: true, queued: true })
}
