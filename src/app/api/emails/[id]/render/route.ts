import { NextResponse } from 'next/server'
import { findEmailTemplateById, renderTokens, type EmailVariable } from '@/lib/emailTemplates'
import {
  findCandidateById,
  loadApplications,
  loadRoles,
  loadUsers,
} from '@/lib/data'
import { loadCompany } from '@/lib/company'
import { getCurrentSession } from '@/lib/identity'

export const runtime = 'nodejs'

function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName
}

function resolveDefault(
  source: EmailVariable['defaultFrom'],
  ctx: {
    candidate?: Awaited<ReturnType<typeof findCandidateById>>
    role?: Awaited<ReturnType<typeof loadRoles>>[number]
    hod?: Awaited<ReturnType<typeof loadUsers>>[number]
    company: Awaited<ReturnType<typeof loadCompany>>
  },
): string {
  if (!source) return ''
  const { candidate, role, hod, company } = ctx
  switch (source) {
    case 'candidate.name': return candidate?.name ?? ''
    case 'candidate.firstName': return candidate ? firstName(candidate.name) : ''
    case 'candidate.email': return candidate?.email ?? ''
    case 'role.title': return role?.title ?? ''
    case 'role.department': return role?.department ?? ''
    case 'role.location': return role?.location ?? ''
    case 'company.name': return company.name
    case 'company.hrContact.name': return company.hrContact.name
    case 'company.hrContact.email': return company.hrContact.email
    case 'company.hrContact.whatsapp': return company.hrContact.whatsapp
    case 'company.website': return company.website
    case 'today': {
      const d = new Date()
      const day = d.getDate()
      const month = d.toLocaleString('en-GB', { month: 'long' })
      const year = d.getFullYear()
      const suffix =
        day % 10 === 1 && day !== 11
          ? 'st'
          : day % 10 === 2 && day !== 12
            ? 'nd'
            : day % 10 === 3 && day !== 13
              ? 'rd'
              : 'th'
      return `${day}${suffix} ${month} ${year}`
    }
    case 'hod.name': return hod?.name ?? ''
    default: return ''
  }
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  const session = await getCurrentSession()
  if (!session) return NextResponse.json({ message: 'Not signed in.' }, { status: 401 })
  if (session.role !== 'Admin' && session.role !== 'HR') {
    return NextResponse.json({ message: 'Only Admin or HR can render emails.' }, { status: 403 })
  }

  const template = findEmailTemplateById(params.id)
  if (!template) return NextResponse.json({ message: 'Template not found.' }, { status: 404 })

  let body: { candidateId?: unknown; roleId?: unknown; values?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ message: 'Invalid request.' }, { status: 400 })
  }

  const candidateId = typeof body.candidateId === 'string' ? body.candidateId : ''
  const roleIdOverride = typeof body.roleId === 'string' ? body.roleId : ''
  const provided = body.values && typeof body.values === 'object' ? (body.values as Record<string, unknown>) : {}

  const candidate = candidateId ? await findCandidateById(candidateId) : undefined

  // If roleId not given, guess via the candidate's most-recent application.
  let role: Awaited<ReturnType<typeof loadRoles>>[number] | undefined
  if (roleIdOverride) {
    role = (await loadRoles()).find((r) => r.id === roleIdOverride)
  } else if (candidate) {
    const apps = (await loadApplications()).filter((a) => a.candidateId === candidate.id)
    const latest = apps.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
    if (latest) role = (await loadRoles()).find((r) => r.id === latest.roleId)
  }

  let hod: Awaited<ReturnType<typeof loadUsers>>[number] | undefined
  if (role?.hodUserId) hod = (await loadUsers()).find((u) => u.id === role!.hodUserId)

  const company = loadCompany()

  // Seed defaults
  const values: Record<string, string> = {}
  for (const v of template.variables) {
    values[v.token] = resolveDefault(v.defaultFrom, { candidate, role, hod, company })
  }
  // Overlay provided values
  for (const [k, val] of Object.entries(provided)) {
    if (typeof val === 'string') values[k] = val
  }

  const subject = renderTokens(template.subject, values)
  const renderedBody = renderTokens(template.body, values)

  // Enumerate unresolved tokens (anything still `{foo}` in the output)
  const unresolved = new Set<string>()
  const re = /\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g
  for (const src of [subject, renderedBody]) {
    let m: RegExpExecArray | null
    while ((m = re.exec(src))) unresolved.add(m[1] ?? '')
  }

  return NextResponse.json({
    subject,
    body: renderedBody,
    to: candidate?.email ?? '',
    values,
    unresolved: Array.from(unresolved),
  })
}
