/*
 * Bulk employee upload - PREVIEW (no writes).
 *
 *   POST /api/admin/employees/bulk-upload/preview   (multipart: file)
 *
 * Parses the uploaded xlsx/csv SERVER-SIDE, reconciles every row against live
 * data via the shared service, and returns the classification + flags + diffs.
 * Nothing is written. Admin + HR only.
 */

import { NextResponse } from 'next/server'
import { getCurrentSession } from '@/lib/identity'
import { MAX_BYTES, parseEmployeeUpload } from '@/lib/employees/parseUpload'
import { reconcileEmployeeImport } from '@/lib/employees/reconcileImport'
import { buildReconcileContext } from '@/lib/employees/importContext'
import { tally, toPreviewRow } from '@/lib/employees/bulkUploadPreview'

export const runtime = 'nodejs'

function bad(message: string, status = 400) {
  return NextResponse.json({ message }, { status })
}

export async function POST(request: Request) {
  const session = await getCurrentSession()
  if (!session) return bad('Not signed in.', 401)
  if (session.role !== 'Admin' && session.role !== 'HR') {
    return bad('Only Admin or HR can bulk-upload employees.', 403)
  }

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return bad('Expected a multipart file upload.')
  }
  const file = form.get('file')
  if (!(file instanceof Blob)) return bad('No file provided.')
  const buf = Buffer.from(await file.arrayBuffer())
  if (buf.length === 0) return bad('The file is empty.')
  if (buf.length > MAX_BYTES) return bad(`File too large (max ${Math.round(MAX_BYTES / 1024 / 1024)}MB).`, 413)

  const filename = 'name' in file && typeof file.name === 'string' ? file.name : 'upload'
  const { rows, errors } = parseEmployeeUpload(buf, filename)
  if (errors.length) return NextResponse.json({ message: errors.join(' '), fileErrors: errors }, { status: 422 })
  if (rows.length === 0) return bad('No data rows found in the file.', 422)

  const ctx = await buildReconcileContext({ actor: session.email, now: new Date().toISOString() })
  const results = reconcileEmployeeImport(rows, ctx)

  return NextResponse.json({
    ok: true,
    counts: tally(results),
    rows: results.map(toPreviewRow),
  })
}
