import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getCurrentSession } from '@/lib/identity'
import { canManageITAssets, canViewITAssets, loadITAssets } from '@/lib/itAssets'
import { loadEmployees } from '@/lib/data'
import type { ITAsset, ITAssetStatus } from '@/lib/types'
import { ITAssetsTable } from './ITAssetsTable'

export const dynamic = 'force-dynamic'

const STATUS_TONE: Record<ITAssetStatus, string> = {
  Available: 'bg-success-bg text-success',
  Assigned: 'bg-navy-light text-navy',
  'In Repair': 'bg-warning-bg text-warning',
  Retired: 'bg-surface text-ink-3',
  Lost: 'bg-danger-bg text-danger',
  Stolen: 'bg-danger-bg text-danger',
}

export default async function ITAssetsAdminPage() {
  const session = await getCurrentSession()
  if (!session) redirect('/login')
  if (!canViewITAssets(session)) redirect('/')

  const assets = loadITAssets()
  const employees = loadEmployees().map((e) => ({
    id: e.id,
    name: e.name,
    code: e.employeeCode ?? '',
    status: e.status,
  }))

  const totals = totalsFor(assets)
  const canEdit = canManageITAssets(session)

  return (
    <div className="container-page py-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl text-ink">IT assets</h1>
          <p className="mt-1 text-sm text-ink-2">
            Hardware inventory: laptops, monitors, phones, peripherals. Track serial
            numbers, warranties, assignment history, and condition. For the lightweight
            offboarding return checklist (laptop / ID card / SIM / email account), see{' '}
            <Link href="/admin/assets" className="font-medium text-navy hover:underline">
              Assets
            </Link>
            .
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/it-assets?export=csv"
            className="inline-flex min-h-[44px] items-center rounded border border-line-strong bg-card px-3 py-2 text-sm text-ink hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
          >
            Export CSV
          </Link>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-6">
        <Stat label="Total" value={totals.total} tone="ok" />
        <Stat label="Available" value={totals.available} tone="ok" />
        <Stat label="Assigned" value={totals.assigned} tone="ok" />
        <Stat label="In Repair" value={totals.inRepair} tone={totals.inRepair > 0 ? 'warning' : 'ok'} />
        <Stat label="Retired" value={totals.retired} tone="ok" />
        <Stat label="Lost or Stolen" value={totals.lostOrStolen} tone={totals.lostOrStolen > 0 ? 'danger' : 'ok'} />
      </div>

      <ITAssetsTable
        assets={assets}
        employees={employees}
        canEdit={canEdit}
        statusTone={STATUS_TONE}
      />
    </div>
  )
}

function totalsFor(assets: ITAsset[]) {
  return assets.reduce(
    (acc, a) => {
      acc.total++
      if (a.status === 'Available') acc.available++
      if (a.status === 'Assigned') acc.assigned++
      if (a.status === 'In Repair') acc.inRepair++
      if (a.status === 'Retired') acc.retired++
      if (a.status === 'Lost' || a.status === 'Stolen') acc.lostOrStolen++
      return acc
    },
    { total: 0, available: 0, assigned: 0, inRepair: 0, retired: 0, lostOrStolen: 0 },
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
