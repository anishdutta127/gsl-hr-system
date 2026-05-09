import fs from 'node:fs'
import path from 'node:path'
import { NextResponse } from 'next/server'
import { getCurrentSession } from '@/lib/identity'
import {
  assertInsideHrDocumentsRoot,
  canViewEmployeeDocuments,
  loadEmployeeDocuments,
} from '@/lib/documents'

export const runtime = 'nodejs'

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const session = await getCurrentSession()
  if (!canViewEmployeeDocuments(session)) {
    return NextResponse.json({ message: 'Forbidden.' }, { status: 403 })
  }

  const doc = loadEmployeeDocuments().find((d) => d.id === params.id)
  if (!doc) return NextResponse.json({ message: 'Document not found.' }, { status: 404 })

  if (path.isAbsolute(doc.filePath) || doc.filePath.includes('..')) {
    return NextResponse.json({ message: 'Stored path is malformed.' }, { status: 400 })
  }

  const absolute = path.resolve(process.cwd(), doc.filePath)
  try {
    assertInsideHrDocumentsRoot(absolute)
  } catch {
    return NextResponse.json({ message: 'Path escapes document root.' }, { status: 403 })
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
      : ext === '.png'
        ? 'image/png'
        : ext === '.jpg' || ext === '.jpeg'
          ? 'image/jpeg'
          : ext === '.docx'
            ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            : ext === '.xlsx'
              ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
              : 'application/octet-stream'
  const inline = ext === '.pdf' || ext === '.png' || ext === '.jpg' || ext === '.jpeg'
  const safeName = doc.originalFileName.replace(/"/g, '')

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${safeName}"`,
      'Cache-Control': 'private, max-age=300',
    },
  })
}
