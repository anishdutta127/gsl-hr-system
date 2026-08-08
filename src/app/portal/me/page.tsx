import Link from 'next/link'
import { redirect } from 'next/navigation'
import {
  findCandidateById,
  loadApplications,
  loadRoles,
} from '@/lib/data'
import { getCurrentCandidateId } from '@/lib/candidateIdentity'
import { loadCompany } from '@/lib/company'
import { nextCandidateAction, stagePlainEnglish } from '@/lib/portalCopy'
import { isTerminal } from '@/lib/pipeline'
import { formatDate, formatRelative } from '@/lib/format'
import { PortalResumeUpload } from './PortalResumeUpload'

export const dynamic = 'force-dynamic'

export default async function PortalMePage() {
  const candidateId = await getCurrentCandidateId()
  if (!candidateId) redirect('/portal/request-new-link')

  const candidate = await findCandidateById(candidateId)
  if (!candidate) redirect('/portal/request-new-link?reason=notfound')

  const company = loadCompany()
  const apps = (await loadApplications())
    .filter((a) => a.candidateId === candidateId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const roles = await loadRoles()
  const roleById = new Map(roles.map((r) => [r.id, r] as const))

  return (
    <div className="container-page py-10">
      <header className="mb-8">
        <h1 className="font-display text-2xl text-ink">Your applications</h1>
        <p className="mt-1 text-sm text-ink-2">
          {candidate.name} · {candidate.email}
        </p>
      </header>

      <div className="mb-8">
        <PortalResumeUpload hasExistingResume={Boolean(candidate.resumeFilePath)} />
      </div>

      {apps.length === 0 ? (
        <div className="rounded-lg border border-dashed border-line-strong bg-card p-8 text-center">
          <p className="text-sm text-ink-2">You have no applications on file.</p>
          <Link
            href="/careers"
            className="mt-4 inline-flex items-center rounded bg-navy px-4 py-2 text-sm font-medium text-white hover:bg-navy-dark"
          >
            Browse open roles
          </Link>
        </div>
      ) : (
        <ul className="space-y-4">
          {apps.map((app) => {
            const role = roleById.get(app.roleId)
            const terminal = isTerminal(app.currentStage)
            const action = nextCandidateAction(app)
            return (
              <li
                key={app.id}
                className="rounded-lg border border-line bg-card p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-display text-lg text-ink">
                      {role?.title ?? 'Role'}
                    </div>
                    <div className="mt-1 text-xs text-ink-2">
                      Applied {formatDate(app.createdAt)}
                    </div>
                  </div>
                  <span
                    className={
                      terminal
                        ? 'inline-flex items-center rounded bg-surface px-2 py-1 text-xs text-ink-2'
                        : 'inline-flex items-center rounded bg-teal-light px-2 py-1 text-xs font-medium text-teal-dark'
                    }
                  >
                    {app.currentStage}
                  </span>
                </div>
                <p className="mt-3 text-sm text-ink">{stagePlainEnglish(app.currentStage)}</p>

                {action?.href && !terminal && (
                  <div className="mt-4">
                    <Link
                      href={action.href}
                      className="inline-flex min-h-[44px] items-center rounded bg-navy px-4 py-2.5 text-base font-medium text-white transition-colors hover:bg-navy-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-offset-2"
                    >
                      {action.cta}
                    </Link>
                  </div>
                )}

                {!terminal && (
                  <div className="mt-4 border-t border-line pt-3 text-xs text-ink-3">
                    <span>In this stage for {formatRelative(app.stageEnteredAt, { addSuffix: false })}</span>
                    <span className="mx-2">·</span>
                    <Link
                      href={`/portal/withdraw/${app.id}`}
                      className="text-ink-2 underline hover:text-ink"
                    >
                      Withdraw
                    </Link>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <div className="mt-10 rounded-lg border border-line bg-card p-5 text-sm text-ink-2">
        <p>
          Stuck? Write to{' '}
          <a href={`mailto:${company.hrContact.email}`} className="underline">
            {company.hrContact.email}
          </a>
          . Your contact is {company.hrContact.name}, {company.hrContact.title}.
        </p>
      </div>
    </div>
  )
}
