/*
 * Bulk employee upload - TEMPLATE download.
 *
 *   GET /api/admin/employees/bulk-upload/template  ->  .xlsx with the header row
 *
 * The template is the main defence against malformed uploads. Admin + HR only.
 */

import { NextResponse } from 'next/server'
import { getCurrentSession } from '@/lib/identity'
import { buildTemplateXlsx } from '@/lib/employees/parseUpload'

export const runtime = 'nodejs'

export async function GET() {
  const session = await getCurrentSession()
  if (!session) return NextResponse.json({ message: 'Not signed in.' }, { status: 401 })
  if (session.role !== 'Admin' && session.role !== 'HR') {
    return NextResponse.json({ message: 'Only Admin or HR can access the template.' }, { status: 403 })
  }
  const buf = buildTemplateXlsx()
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="employee-upload-template.xlsx"',
      'Cache-Control': 'no-store',
    },
  })
}
