import Link from 'next/link'
import {
  loadApplications,
  loadCandidates,
  loadOffers,
  loadRoles,
} from '@/lib/data'
import { requireRoles } from '@/lib/guards'
import { formatDate, formatRs } from '@/lib/format'

export const dynamic = 'force-dynamic'

const OFFER_READY_STAGES = new Set(['HRRoundDone', 'Offered', 'OfferAccepted'])

export default async function OffersPage() {
  await requireRoles(['Admin', 'HR'])
  const applications = loadApplications()
  const candidates = loadCandidates()
  const roles = loadRoles()
  const offers = loadOffers()

  const candidateById = new Map(candidates.map((c) => [c.id, c] as const))
  const roleById = new Map(roles.map((r) => [r.id, r] as const))

  const eligible = applications.filter((a) => OFFER_READY_STAGES.has(a.currentStage as string))

  return (
    <div className="container-page py-8">
      <div className="mb-6">
        <h1 className="font-display text-2xl text-ink">Offers</h1>
        <p className="mt-1 text-sm text-ink-2">
          Candidates at the offer stage. Draft, generate the letter, track response.
        </p>
      </div>

      <section aria-labelledby="existing-heading" className="mb-10">
        <h2 id="existing-heading" className="mb-3 font-display text-lg text-ink">
          Existing offers ({offers.length})
        </h2>
        {offers.length === 0 ? (
          <div className="rounded-lg border border-dashed border-line-strong bg-card p-6 text-center text-sm text-ink-2">
            No offers drafted yet.
          </div>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-card">
            {offers.map((o) => {
              const candidate = candidateById.get(o.candidateId)
              const role = roleById.get(o.roleId)
              return (
                <li key={o.id}>
                  <Link
                    href={`/offers/${o.id}`}
                    className="flex items-center justify-between gap-4 px-5 py-4 text-sm hover:bg-surface focus-visible:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-inset"
                  >
                    <span>
                      <span className="block font-medium text-ink">
                        {candidate?.name ?? '(candidate removed)'}
                      </span>
                      <span className="block text-xs text-ink-2">
                        {role?.title ?? '(role removed)'} ·{' '}
                        {formatRs(o.compensation.ctcAnnual, { compact: true })} CTC · Created{' '}
                        {formatDate(o.createdAt)}
                      </span>
                    </span>
                    <span
                      className={
                        o.status === 'Accepted' || o.status === 'Sent'
                          ? 'inline-flex items-center rounded bg-teal-light px-2 py-1 text-xs font-medium text-teal-dark'
                          : 'inline-flex items-center rounded bg-surface px-2 py-1 text-xs text-ink-2'
                      }
                    >
                      {o.status}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="ready-heading">
        <h2 id="ready-heading" className="mb-3 font-display text-lg text-ink">
          Candidates ready for an offer ({eligible.length})
        </h2>
        {eligible.length === 0 ? (
          <div className="rounded-lg border border-dashed border-line-strong bg-card p-6 text-center text-sm text-ink-2">
            No candidates at the HR round or beyond yet.
          </div>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-card">
            {eligible.map((app) => {
              const candidate = candidateById.get(app.candidateId)
              const role = roleById.get(app.roleId)
              return (
                <li key={app.id}>
                  <Link
                    href={`/offers/new?applicationId=${app.id}`}
                    className="flex items-center justify-between gap-4 px-5 py-4 text-sm hover:bg-surface focus-visible:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-inset"
                  >
                    <span>
                      <span className="block font-medium text-ink">{candidate?.name ?? '(unknown)'}</span>
                      <span className="block text-xs text-ink-2">
                        {role?.title ?? '(role removed)'} · Stage: {app.currentStage}
                      </span>
                    </span>
                    <span className="text-xs font-medium text-navy">Draft offer →</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
