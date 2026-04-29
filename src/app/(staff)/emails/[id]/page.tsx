import { notFound } from 'next/navigation'
import Link from 'next/link'
import { requireRoles } from '@/lib/guards'
import { findEmailTemplateById } from '@/lib/emailTemplates'
import { loadCandidates, loadApplications, loadRoles } from '@/lib/data'
import { ComposeEmailForm } from './ComposeEmailForm'

export const dynamic = 'force-dynamic'

export default async function ComposeEmailPage({
  params,
  searchParams,
}: {
  params: { id: string }
  searchParams: { candidateId?: string; roleId?: string }
}) {
  await requireRoles(['Admin', 'HR'])
  const template = findEmailTemplateById(params.id)
  if (!template) notFound()

  const candidates = loadCandidates()
  const roles = loadRoles()
  const applications = loadApplications()

  // Candidates in an active stage first, then the rest
  const activeIds = new Set(
    applications
      .filter((a) => !['Rejected', 'Withdrawn', 'NotInterested', 'Joined', 'OnHold'].includes(a.currentStage as string))
      .map((a) => a.candidateId),
  )
  const candidateOptions = [...candidates]
    .sort((a, b) => {
      const aActive = activeIds.has(a.id) ? 0 : 1
      const bActive = activeIds.has(b.id) ? 0 : 1
      if (aActive !== bActive) return aActive - bActive
      return a.name.localeCompare(b.name)
    })
    .map((c) => ({
      id: c.id,
      label: `${c.name}${c.email ? ` <${c.email}>` : ''}${activeIds.has(c.id) ? '' : ' — pool'}`,
    }))

  const roleOptions = roles
    .filter((r) => r.status === 'Open' || r.status === 'Paused' || r.status === 'Draft')
    .map((r) => ({ id: r.id, label: `${r.title} · ${r.department}` }))

  return (
    <div className="container-page py-8">
      <div className="mb-2 text-xs text-ink-3">
        <Link href="/emails" className="hover:text-ink">
          Email templates
        </Link>{' '}
        / {template.title}
      </div>
      <h1 className="font-display text-2xl text-ink">{template.title}</h1>
      <p className="mt-1 text-sm text-ink-2">{template.description}</p>
      <ComposeEmailForm
        template={template}
        candidateOptions={candidateOptions}
        roleOptions={roleOptions}
        initialCandidateId={searchParams.candidateId ?? ''}
        initialRoleId={searchParams.roleId ?? ''}
      />
    </div>
  )
}
