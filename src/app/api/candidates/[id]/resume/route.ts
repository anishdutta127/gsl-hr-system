import { NextResponse } from 'next/server'
import { findCandidateById } from '@/lib/data'
import { getCurrentSession } from '@/lib/identity'
import { enqueueUpdate } from '@/lib/queue/pendingUpdates'
import {
  deleteBinaryFile,
  putBinaryFile,
  QueueUpstreamError,
} from '@/lib/queue/githubQueue'
import { buildResumeRepoPath } from '@/lib/resumePath'
import { HR_UPLOAD_PROFILE, validateUploadedResume } from '@/lib/resumeUpload'

export const runtime = 'nodejs'

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
  const check = validateUploadedResume(file, HR_UPLOAD_PROFILE)
  if (!check.ok) {
    return NextResponse.json({ message: check.message }, { status: check.status })
  }

  // Year/month subfoldering avoids the GitHub "too many files in one folder"
  // performance ceiling at scale. Path lives under data/ (a real tree) — NOT
  // under the onedrive-data symlink, which would 409 on every Contents API
  // write because GitHub sees the first segment as a blob (the symlink) not
  // a tree. See docs/RUNBOOK.md "Resume upload 409" for the full root cause.
  const repoPath = buildResumeRepoPath(candidate.id, check.ext)
  const bytes = Buffer.from(await (file as File).arrayBuffer())
  const fileName = (file as File).name
  const fileSize = (file as File).size

  let fileWritten = false
  // Same-month re-uploads land at the same path as the prior upload, so the
  // PUT overwrites instead of creating a fresh file. In that case the
  // candidate record already points at this path and a cleanup-on-enqueue-
  // failure would *destroy* the candidate's existing resume — far worse than
  // an orphan audit entry. Skip cleanup when the path was already in use.
  const wasOverwrite = candidate.resumeFilePath === repoPath
  try {
    await putBinaryFile(
      repoPath,
      bytes,
      `feat(resumes): upload for ${candidate.name.slice(0, 40)} (${candidate.id.slice(0, 8)})`,
    )
    fileWritten = true
    await enqueueUpdate({
      queuedBy: session.email,
      entity: 'candidate',
      operation: 'update',
      payload: {
        id: candidate.id,
        operation: 'candidate.set-resume',
        before: { resumeFilePath: candidate.resumeFilePath ?? null },
        after: { resumeFilePath: repoPath },
        notes: `Resume uploaded by ${session.email} (${fileName}, ${(fileSize / 1024).toFixed(0)} KB).`,
      },
    })
  } catch (err) {
    if (fileWritten && !wasOverwrite) {
      await deleteBinaryFile(repoPath, 'enqueue failed for candidate.set-resume')
    }
    if (err instanceof QueueUpstreamError && err.status === 409) {
      console.error('[resume-upload] 409 path conflict on', repoPath, err.body)
      return NextResponse.json(
        {
          message:
            'Upload could not be saved due to a path conflict. Please contact support — this is a known fix-on-our-end issue.',
        },
        { status: 503 },
      )
    }
    const message = err instanceof Error ? err.message : 'Upload failed.'
    return NextResponse.json({ message }, { status: 503 })
  }

  return NextResponse.json({
    ok: true,
    resumeFilePath: repoPath,
    queued: true,
    note:
      'Resume saved. The candidate record will reflect within ~10 minutes once the apply runner picks up the queue. Use Sync now (Admin) to force it.',
  })
}
