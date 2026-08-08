import Link from 'next/link'
import { requireRoles } from '@/lib/guards'
import { loadRecognitions, loadUsers, loadEmployees } from '@/lib/data'
import { formatMonthLabel, groupByMonth, matchesQuery } from '@/lib/recognition'

export const dynamic = 'force-dynamic'

/**
 * Public history of approved/published recognitions. Every signed-in
 * staff member can browse. Draft + Nominated are hidden - those are
 * not yet a public artefact.
 *
 * Filter via ?q=<term>. The search is a substring match across
 * department, category, write-up, and id (see matchesQuery in
 * src/lib/recognition.ts).
 */
export default async function RecognitionHistoryPage({
  searchParams,
}: {
  searchParams: { q?: string }
}) {
  await requireRoles(['Admin', 'HR', 'HOD', 'Leadership'])
  const q = (searchParams.q ?? '').trim()

  const all = (await loadRecognitions()).filter(
    (r) => r.status === 'Approved' || r.status === 'Published',
  )
  const matched = all.filter((r) => matchesQuery(r, q))

  const employeesById = new Map((await loadEmployees()).map((e) => [e.id, e] as const))
  const usersById = new Map((await loadUsers()).map((u) => [u.id, u] as const))

  const byMonth = groupByMonth(matched)
  const monthsDesc = [...byMonth.keys()].sort((a, b) => b.localeCompare(a))

  return (
    <div className="container-page py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl text-ink">Recognition</h1>
          <p className="mt-1 text-sm text-ink-2">
            Every approved and published recognition from across Get Set Learn.
          </p>
        </div>
        <form className="flex flex-wrap items-end gap-2" role="search">
          <label htmlFor="r-q" className="sr-only">
            Search recognitions
          </label>
          <input
            id="r-q"
            name="q"
            type="search"
            defaultValue={q}
            placeholder="Search by name, department, write-up"
            className="min-h-[36px] rounded border border-line-strong bg-card px-3 py-1.5 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
          />
          <button
            type="submit"
            className="inline-flex min-h-[36px] items-center rounded bg-navy px-3 py-1.5 text-sm font-medium text-white hover:bg-navy-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-offset-2"
          >
            Search
          </button>
          {q && (
            <Link href="/recognition" className="text-xs font-medium text-ink-2 hover:text-ink">
              Clear
            </Link>
          )}
        </form>
      </header>

      {matched.length === 0 ? (
        <div className="rounded-lg border border-dashed border-line-strong bg-card p-8 text-center text-sm text-ink-2">
          {q ? `No recognitions match "${q}".` : 'No recognitions published yet.'}
        </div>
      ) : (
        monthsDesc.map((month) => {
          const list = byMonth.get(month) ?? []
          return (
            <section key={month} className="mb-8" aria-labelledby={`month-${month}`}>
              <h2
                id={`month-${month}`}
                className="mb-3 font-display text-lg text-ink"
              >
                {formatMonthLabel(month)}{' '}
                <span className="text-sm font-normal text-ink-3">
                  ({list.length})
                </span>
              </h2>
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {list.map((r) => {
                  const employee = employeesById.get(r.employeeId)
                  const employeeName =
                    employee?.name ??
                    usersById.get(r.employeeId)?.name ??
                    '(employee removed)'
                  const initial = employeeName.charAt(0).toUpperCase() || '?'
                  return (
                    <li key={r.id}>
                      <Link
                        href={`/recognition/${r.id}/card`}
                        className="block rounded-lg border border-line bg-card p-4 transition hover:border-teal hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
                      >
                        <div className="flex items-start gap-3">
                          <div
                            aria-hidden="true"
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-teal text-base font-display text-white"
                          >
                            {initial}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="font-medium text-ink">
                              {employeeName}
                            </div>
                            <div className="mt-0.5 text-xs text-ink-2">
                              {r.department} · {r.category}
                            </div>
                            <p className="mt-2 line-clamp-3 text-xs text-ink-2">
                              {r.writeup}
                            </p>
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-ink-3">
                          <span>{r.id}</span>
                          <span>
                            {r.status === 'Published' ? 'Published' : 'Approved'}
                          </span>
                        </div>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </section>
          )
        })
      )}
    </div>
  )
}
