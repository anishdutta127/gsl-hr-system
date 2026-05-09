import { redirect } from 'next/navigation'
import { getCurrentSession } from '@/lib/identity'
import { loadAssets } from '@/lib/assets'
import { loadEmployees } from '@/lib/data'
import { AssetsTable } from './AssetsTable'

export const dynamic = 'force-dynamic'

export default async function AssetsPage() {
  const session = await getCurrentSession()
  if (!session) redirect('/login')
  const isHrOrAdmin = session.role === 'Admin' || session.role === 'HR'
  const isLeadership = session.role === 'Leadership'
  if (!isHrOrAdmin && !isLeadership) redirect('/')

  const assets = loadAssets()
  const employees = loadEmployees().map((e) => ({
    id: e.id,
    name: e.name,
    code: e.employeeCode,
    status: e.status,
  }))

  const totals = assets.reduce(
    (acc, a) => {
      acc.total++
      if (a.assignedTo) acc.assigned++
      else if (a.returnedAt) acc.returned++
      else acc.unassigned++
      if (a.condition === 'Lost') acc.lost++
      if (a.condition === 'Damaged') acc.damaged++
      return acc
    },
    { total: 0, assigned: 0, returned: 0, unassigned: 0, lost: 0, damaged: 0 },
  )

  return (
    <div className="container-page py-8">
      <div className="mb-6">
        <h1 className="font-display text-2xl text-ink">Assets</h1>
        <p className="mt-1 text-sm text-ink-2">
          Inventory of laptops, ID cards, SIMs, and email accounts. Assigned per employee;
          returned at exit.
        </p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label="Total" value={totals.total} tone="ok" />
        <Stat label="Assigned" value={totals.assigned} tone="ok" />
        <Stat label="Unassigned" value={totals.unassigned} tone={totals.unassigned > 0 ? 'warning' : 'ok'} />
        <Stat label="Damaged" value={totals.damaged} tone={totals.damaged > 0 ? 'warning' : 'ok'} />
        <Stat label="Lost" value={totals.lost} tone={totals.lost > 0 ? 'danger' : 'ok'} />
      </div>

      <AssetsTable assets={assets} employees={employees} canEdit={isHrOrAdmin} />
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: number; tone: 'ok' | 'warning' | 'danger' }) {
  const colors = tone === 'danger' ? 'text-danger' : tone === 'warning' ? 'text-warning' : 'text-ink'
  return (
    <div className="rounded-lg border border-line bg-card p-4">
      <div className={`font-display text-3xl tabular ${colors}`}>{value}</div>
      <div className="mt-1 text-xs uppercase tracking-wider text-ink-3">{label}</div>
    </div>
  )
}
