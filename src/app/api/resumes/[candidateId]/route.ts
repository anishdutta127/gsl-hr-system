import fs from 'node:fs'
import path from 'node:path'
import { NextResponse } from 'next/server'
import { findCandidateById } from '@/lib/data'
import { requireRoles } from '@/lib/guards'
import { assertInsideResumeRoot } from '@/lib/resumePath'

export const runtime = 'nodejs'

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

  const check = assertInsideResumeRoot(candidate.resumeFilePath)
  if (!check.ok) {
    return NextResponse.json({ message: check.message }, { status: check.status })
  }

  const absolute = check.absolute
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
