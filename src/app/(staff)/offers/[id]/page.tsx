import { notFound } from 'next/navigation'
import Link from 'next/link'
import {
  findCandidateById,
  findOfferById,
  findRoleById,
  findApplicationById,
} from '@/lib/data'
import { requireRoles } from '@/lib/guards'
import { formatDate, formatRs } from '@/lib/format'
import { OfferActions } from './OfferActions'

export const dynamic = 'force-dynamic'

export default async function OfferDetailPage({ params }: { params: { id: string } }) {
  await requireRoles(['Admin', 'HR'])
  const offer = await findOfferById(params.id)
  if (!offer) notFound()
  const candidate = await findCandidateById(offer.candidateId)
  const role = await findRoleById(offer.roleId)
  const application = await findApplicationById(offer.applicationId)
  if (!candidate || !role || !application) notFound()

  return (
    <div className="container-page py-8">
      <div className="mb-2 text-xs text-ink-3">
        <Link href="/offers" className="hover:text-ink">
          Offers
        </Link>{' '}
        /{' '}
        <Link href={`/candidates/${candidate.id}`} className="hover:text-ink">
          {candidate.name}
        </Link>
      </div>
      <h1 className="font-display text-2xl text-ink">Offer: {candidate.name}</h1>
      <p className="mt-1 text-sm text-ink-2">
        {role.title} · Status: <span className="font-medium text-ink">{offer.status}</span>
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
        <section className="rounded-lg border border-line bg-card p-5">
          <h2 className="font-display text-lg text-ink">Terms</h2>
          <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <Term label="Designation">{offer.designation}</Term>
            <Term label="Location">{offer.location}</Term>
            <Term label="Reports to">{offer.reportingTo ?? '-'}</Term>
            <Term label="Annual CTC">{formatRs(offer.compensation.ctcAnnual)}</Term>
            {offer.compensation.fixedMonthly ? (
              <Term label="Fixed monthly">{formatRs(offer.compensation.fixedMonthly)}</Term>
            ) : null}
            {offer.compensation.variableAnnual ? (
              <Term label="Annual variable">{formatRs(offer.compensation.variableAnnual)}</Term>
            ) : null}
            <Term label="Notice period">{offer.compensation.noticePeriodDays} days</Term>
            <Term label="Proposed joining">
              {offer.proposedJoiningDate ? formatDate(offer.proposedJoiningDate) : '-'}
            </Term>
            <Term label="Created">{formatDate(offer.createdAt)} by {offer.createdBy}</Term>
            {offer.approvedAt ? (
              <Term label="Approved">
                {formatDate(offer.approvedAt)} by {offer.approvedBy ?? '-'}
              </Term>
            ) : null}
            {offer.sentAt ? (
              <Term label="Sent">
                {formatDate(offer.sentAt)}
                {offer.resentAt && offer.resentAt.length > 0
                  ? ` (resent ${offer.resentAt.length}x)`
                  : ''}
              </Term>
            ) : null}
            {offer.respondedAt ? <Term label="Responded">{formatDate(offer.respondedAt)}</Term> : null}
            {offer.acceptedOn ? (
              <Term label="Accepted on">{formatDate(offer.acceptedOn)}</Term>
            ) : null}
            {offer.acceptedCtcAnnual &&
            offer.acceptedCtcAnnual !== offer.compensation.ctcAnnual ? (
              <Term label="Accepted CTC (negotiated)">
                {formatRs(offer.acceptedCtcAnnual)}
              </Term>
            ) : null}
            {offer.acceptedJoiningDate ? (
              <Term label="Confirmed joining">
                {formatDate(offer.acceptedJoiningDate)}
              </Term>
            ) : null}
            {offer.declineReason ? (
              <Term label="Decline reason">
                {offer.declineReason}
                {offer.declineNotes ? ` — ${offer.declineNotes}` : ''}
              </Term>
            ) : null}
          </dl>
        </section>

        <OfferActions offer={offer} />
      </div>

      <section className="mt-6">
        <h2 className="mb-3 font-display text-lg text-ink">Audit trail</h2>
        <ol className="space-y-2">
          {[...offer.auditLog].reverse().map((entry, idx) => (
            <li
              key={idx}
              className="rounded border border-line bg-card px-4 py-3 text-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-medium text-ink">{entry.action}</div>
                  {entry.notes && <div className="text-xs text-ink-2">{entry.notes}</div>}
                </div>
                <time className="text-xs text-ink-3 tabular" dateTime={entry.timestamp}>
                  {formatDate(entry.timestamp)}
                </time>
              </div>
              <div className="mt-1 text-xs text-ink-3">by {entry.user}</div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  )
}

function Term({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-xs font-medium uppercase tracking-wider text-ink-3">{label}</dt>
      <dd className="text-sm text-ink">{children}</dd>
    </>
  )
}
