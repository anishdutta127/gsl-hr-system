import { redirect } from 'next/navigation'
import { getCurrentSession } from '@/lib/identity'
import { loadAlertLog, loadAlertPreferences } from '@/lib/alerts'
import { loadSystemSettings } from '@/lib/systemSettings'
import { ALERT_CATEGORIES } from '@/lib/types'
import { LeaveFlowToggle } from './LeaveFlowToggle'
import { PreferencesEditor } from './PreferencesEditor'

export const dynamic = 'force-dynamic'

export default async function AlertPreferencesPage() {
  const session = await getCurrentSession()
  if (!session) redirect('/login')
  if (session.role !== 'Admin' && session.role !== 'HR') redirect('/')

  const prefs = loadAlertPreferences()
  const settings = loadSystemSettings()
  const log = loadAlertLog().slice(-25).reverse()
  const isAdmin = session.role === 'Admin'

  return (
    <div className="container-page py-8">
      <div className="mb-6">
        <h1 className="font-display text-2xl text-ink">System preferences</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-2">
          Daily 9am IST cron triggers alerts for document expiry, probation review, overdue
          onboarding tasks, approaching last working days, pending leave applications, and an HR
          digest. Only Admin can edit; HR reads.
        </p>
      </div>

      <section className="mb-6">
        <h2 className="mb-2 font-display text-lg text-ink">Leave flow</h2>
        <LeaveFlowToggle
          canEdit={isAdmin}
          initial={settings.leaveFlow}
          updatedAt={settings.updatedAt}
          updatedBy={settings.updatedBy}
        />
      </section>

      <h2 className="mb-2 font-display text-lg text-ink">Alert preferences</h2>
      <PreferencesEditor
        canEdit={isAdmin}
        initial={{
          globalEnabled: prefs.globalEnabled,
          enabled: Object.fromEntries(
            ALERT_CATEGORIES.map((c) => [c, prefs.enabled[c] !== false]),
          ) as Record<string, boolean>,
          extraRecipients: prefs.extraRecipients,
        }}
      />

      <section className="mt-8 rounded-lg border border-line bg-card">
        <header className="border-b border-line px-5 py-3">
          <h2 className="font-display text-lg text-ink">Recent alerts (last 25)</h2>
          <p className="mt-1 text-xs text-ink-3">
            Each entry is one fired alert. Same triggerKey never fires twice — prevents duplicate
            spam if the cron runs more than once.
          </p>
        </header>
        {log.length === 0 ? (
          <p className="px-5 py-6 text-sm text-ink-3">No alerts logged yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-ink-3">
                  <th className="px-5 py-2">Fired</th>
                  <th className="px-3 py-2">Category</th>
                  <th className="px-3 py-2">Recipients</th>
                  <th className="px-3 py-2">Trigger key</th>
                </tr>
              </thead>
              <tbody>
                {log.map((entry) => (
                  <tr key={entry.id} className="border-b border-line/50">
                    <td className="px-5 py-2 tabular text-xs text-ink-2">{entry.firedAt.slice(0, 19).replace('T', ' ')}</td>
                    <td className="px-3 py-2 text-ink">{entry.category}</td>
                    <td className="px-3 py-2 text-xs text-ink-3">
                      {entry.recipients.length === 1
                        ? entry.recipients[0]
                        : `${entry.recipients.length} recipients`}
                    </td>
                    <td className="px-3 py-2 text-xs text-ink-3 truncate max-w-[280px]">
                      {entry.triggerKey}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
