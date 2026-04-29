import fs from 'node:fs'
import path from 'node:path'
import { NextResponse } from 'next/server'
import { findCandidateById } from '@/lib/data'
import { requireRoles } from '@/lib/guards'

export const runtime = 'nodejs'

const ALLOWED_ROOT = path.resolve(process.cwd(), 'onedrive-data', 'seed', 'resumes')

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

  // Defence-in-depth: resolve and confirm the file lives under the resumes
  // dir. Even if a candidate record's resumeFilePath were corrupted to
  // ../../etc/passwd, the resolve+startsWith check rejects the read.
  const candidatePath = candidate.resumeFilePath
  const absolute = path.resolve(process.cwd(), candidatePath)
  if (!absolute.startsWith(ALLOWED_ROOT + path.sep) && absolute !== ALLOWED_ROOT) {
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
