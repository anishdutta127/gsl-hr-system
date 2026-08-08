import { requireRoles } from '@/lib/guards'
import { loadUsers, loadNominationCycles } from '@/lib/data'
import { currentMonth, formatMonthLabel } from '@/lib/recognition'
import { loadCompany } from '@/lib/company'
import { NominationRequestForm } from './NominationRequestForm'

export const dynamic = 'force-dynamic'

/**
 * HR-Admin entry point to seed a monthly nomination cycle. Surfaces a
 * pre-filled email draft to all active HODs asking them to nominate
 * employees for the month. The actual send happens via mailto: in the
 * client component; this server page assembles the addresses, the
 * subject, and the body so the client just opens the user's mail
 * client.
 */
export default async function NewNominationCyclePage() {
  const session = await requireRoles(['Admin', 'HR'])
  const users = await loadUsers()
  const hods = users.filter((u) => u.active && u.role === 'HOD')
  const company = loadCompany()
  const month = currentMonth()
  const cycles = await loadNominationCycles()
  const existingCycle = cycles.find((c) => c.month === month)

  return (
    <div className="container-page py-8">
      <h1 className="font-display text-2xl text-ink">Request recognition nominations</h1>
      <p className="mt-1 text-sm text-ink-2">
        Open a draft email to HODs asking them to nominate an employee for{' '}
        {formatMonthLabel(month)}. The draft opens in your default mail client; you can
        review and send it from there.
      </p>

      {existingCycle && (
        <div
          role="status"
          className="mt-4 rounded border border-warning bg-warning-bg px-3 py-2 text-sm text-ink"
        >
          A nomination request for {formatMonthLabel(month)} was already opened on{' '}
          {existingCycle.requestedAt.slice(0, 10)} by {existingCycle.requestedBy}.
          Re-opening will log a second cycle entry.
        </div>
      )}

      <NominationRequestForm
        month={month}
        monthLabel={formatMonthLabel(month)}
        hods={hods.map((h) => ({ id: h.id, name: h.name, email: h.email }))}
        companyName={company.name}
        recruiterEmail={session.email}
      />
    </div>
  )
}
