import fs from 'node:fs'
import path from 'node:path'
import { NextResponse } from 'next/server'
import { getCurrentSession } from '@/lib/identity'
import { findEmployeeById } from '@/lib/data'
import { assertInsideHandoverRoot, loadExitHandovers } from '@/lib/exitHandover'

export const runtime = 'nodejs'

export async function GET(
  _request: Request,
  { params }: { params: { employeeId: string; fileId: string } },
) {
  const session = await getCurrentSession()
  if (!session) return NextResponse.json({ message: 'Unauthorised.' }, { status: 401 })

  // All staff roles can view their respective handover docs through the
  // page-level guard; we permit read at the API too because review work
  // benefits Leadership and HR alike.
  const employee = findEmployeeById(params.employeeId)
  if (!employee) return NextResponse.json({ message: 'Employee not found.' }, { status: 404 })

  const handover = loadExitHandovers().find((h) => h.employeeId === params.employeeId)
  if (!handover?.document) {
    return NextResponse.json({ message: 'No handover document.' }, { status: 404 })
  }
  // Validate fileId matches the stored storageRef (prevents tampering).
  if (!handover.document.storageRef.includes(params.fileId)) {
    return NextResponse.json({ message: 'File reference mismatch.' }, { status: 404 })
  }

  if (path.isAbsolute(handover.document.storageRef) || handover.document.storageRef.includes('..')) {
    return NextResponse.json({ message: 'Stored path is malformed.' }, { status: 400 })
  }
  const absolute = path.resolve(process.cwd(), handover.document.storageRef)
  try {
    assertInsideHandoverRoot(absolute)
  } catch {
    return NextResponse.json({ message: 'Path escapes handover root.' }, { status: 403 })
  }
  if (!fs.existsSync(absolute)) {
    return NextResponse.json(
      { message: 'File missing on disk. Storage and record have drifted.' },
      { status: 404 },
    )
  }

  const buffer = fs.readFileSync(absolute)
  const ext = path.extname(absolute).toLowerCase()
  const contentType =
    ext === '.pdf'
      ? 'application/pdf'
      : ext === '.docx'
        ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        : ext === '.doc'
          ? 'application/msword'
          : ext === '.md'
            ? 'text/markdown; charset=utf-8'
            : 'application/octet-stream'
  const inline = ext === '.pdf'
  const safeName = handover.document.filename.replace(/"/g, '')
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${safeName}"`,
      'Cache-Control': 'private, max-age=300',
    },
  })
}
