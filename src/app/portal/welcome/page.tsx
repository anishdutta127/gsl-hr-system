/*
 * Keystone moment (phase-1-design.md Pass 2): Fraunces greeting, first-name
 * personalisation, current-stage plain-English summary, recruiter contact,
 * single primary CTA. Nothing else on screen. Designed for the 5-second
 * visceral test: "they treated me like a human."
 */

import Link from 'next/link'
import { redirect } from 'next/navigation'
import {
  findCandidateById,
  loadApplications,
  loadRoles,
} from '@/lib/data'
import { getCurrentCandidateId } from '@/lib/candidateIdentity'
import { loadCompany } from '@/lib/company'
import { stagePlainEnglish, nextCandidateAction } from '@/lib/portalCopy'

export const dynamic = 'force-dynamic'

export default async function PortalWelcomePage() {
  const candidateId = await getCurrentCandidateId()
  if (!candidateId) redirect('/portal/request-new-link')

  const candidate = findCandidateById(candidateId)
  if (!candidate) redirect('/portal/request-new-link?reason=notfound')

  const apps = loadApplications()
    .filter((a) => a.candidateId === candidateId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const current = apps[0]

  const roles = loadRoles()
  const roleById = new Map(roles.map((r) => [r.id, r] as const))
  const role = current ? roleById.get(current.roleId) : undefined
  const company = loadCompany()

  const firstName = candidate.name.split(' ')[0]
  const stageSummary = current ? stagePlainEnglish(current.currentStage) : null
  const action = current ? nextCandidateAction(current) : null

  return (
    <div className="container-page py-16">
      <div className="mx-auto max-w-xl rounded-xl bg-teal-light p-8 sm:p-12">
        <p className="font-serif text-3xl leading-tight text-ink sm:text-4xl">
          Hello, {firstName}.
        </p>
        {current && role ? (
          <p className="mt-4 text-base text-ink">
            You're applying for <span className="font-medium">{role.title}</span>.{' '}
            {stageSummary}
          </p>
        ) : (
          <p className="mt-4 text-base text-ink">Welcome to your portal.</p>
        )}
      </div>

      {action && current && (
        <div className="mx-auto mt-8 max-w-xl rounded-lg border border-line bg-card p-6">
          <h2 className="font-display text-lg text-ink">Next step</h2>
          <p className="mt-2 text-sm text-ink-2">{action.description}</p>
          {action.href && (
            <Link
              href={action.href}
              className="mt-4 inline-flex min-h-[44px] items-center rounded bg-navy px-4 py-2.5 text-base font-medium text-white transition-colors hover:bg-navy-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-offset-2"
            >
              {action.cta}
            </Link>
          )}
        </div>
      )}

      <div className="mx-auto mt-8 max-w-xl rounded-lg border border-line bg-card p-6">
        <h2 className="font-display text-lg text-ink">Your contact at {company.name}</h2>
        <p className="mt-2 text-sm text-ink">
          {company.hrContact.name}, {company.hrContact.title}
        </p>
        <p className="mt-1 text-sm text-ink-2">
          <a href={`mailto:${company.hrContact.email}`} className="underline">
            {company.hrContact.email}
          </a>
        </p>
      </div>

      <div className="mt-8 text-center text-xs text-ink-3">
        <Link href="/portal/me" className="underline">
          See all application details →
        </Link>
      </div>
    </div>
  )
}
