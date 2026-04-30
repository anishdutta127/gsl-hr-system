import fs from 'node:fs'
import path from 'node:path'
import { NextResponse } from 'next/server'
import { findCandidateById } from '@/lib/data'
import { requireRoles } from '@/lib/guards'
import { isAllowedResumePath, RESUME_SEED_ROOT, RESUME_UPLOAD_ROOT } from '@/lib/resumePath'

export const runtime = 'nodejs'

const ALLOWED_ROOTS = [
  path.resolve(process.cwd(), ...RESUME_SEED_ROOT.split('/')),
  path.resolve(process.cwd(), ...RESUME_UPLOAD_ROOT.split('/')),
]

export async function GET(
  _request: Request,
  { params }: { params: { candidateId: string } },
) {
  // Any authenticated staff can view any candidate's CV per current design.
  // HOD scoping on the detail page already gates which candidates HOD sees;
  // resumes inherit that visibility through the existing UI surfaces.
  await requireRoles(['Admin', 'HR', 'HOD', 'Leadership'])

  const candidate = findCandidateById(params.candidateId)
  if (!candidate || !candidate.resumeFilePath) {
    return NextResponse.json({ message: 'No resume on file.' }, { status: 404 })
  }

  // Defence-in-depth: check the stored repo path is under one of the two
  // sanctioned roots BEFORE filesystem resolution. Then resolve and confirm
  // the absolute path stays within the corresponding root, defeating any
  // ../../ attempt that survived JSON parsing.
  const candidatePath = candidate.resumeFilePath
  if (!isAllowedResumePath(candidatePath)) {
    return NextResponse.json({ message: 'Resume path is outside the resumes root.' }, { status: 400 })
  }
  const absolute = path.resolve(process.cwd(), candidatePath)
  const insideAnyRoot = ALLOWED_ROOTS.some(
    (root) => absolute === root || absolute.startsWith(root + path.sep),
  )
  if (!insideAnyRoot) {
    return NextResponse.json({ message: 'Resume path is outside the resumes root.' }, { status: 400 })
  }
  if (!fs.existsSync(absolute)) {
    return NextResponse.json({ message: 'Resume file is missing on disk.' }, { status: 404 })
  }

  const filename = path.basename(absolute)
  const ext = path.extname(absolute).toLowerCase()
  const buffer = fs.readFileSync(absolute)

  const isPdf = ext === '.pdf'
  const contentType = isPdf
    ? 'application/pdf'
    : ext === '.docx'
      ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      : 'application/octet-stream'
  const disposition = isPdf ? 'inline' : 'attachment'

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `${disposition}; filename="${filename.replace(/"/g, '')}"`,
      'Cache-Control': 'private, max-age=300',
    },
  })
}
