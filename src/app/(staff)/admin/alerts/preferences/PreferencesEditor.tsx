'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ALERT_CATEGORIES, type AlertCategory } from '@/lib/types'

const LABEL: Record<AlertCategory, string> = {
  'document-expiry': 'Document expiry (30/14/7 days)',
  'probation-review': 'Probation review (7 days before)',
  'onboarding-overdue': 'Onboarding tasks overdue 3+ days',
  'offboarding-lwd': 'Offboarding LWD approaching (14 days)',
  'leave-pending-24h': 'Leave waiting > 24h',
  'daily-hr-digest': 'Daily HR digest (9am IST)',
}

interface Initial {
  globalEnabled: boolean
  enabled: Record<string, boolean>
  extraRecipients: string[]
}

export function PreferencesEditor({
  canEdit,
  initial,
}: {
  canEdit: boolean
  initial: Initial
}) {
  const [globalEnabled, setGlobalEnabled] = useState(initial.globalEnabled)
  const [enabled, setEnabled] = useState<Record<string, boolean>>(initial.enabled)
  const [extras, setExtras] = useState(initial.extraRecipients.join(', '))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [statusMsg, setStatusMsg] = useState<string | null>(null)
  const router = useRouter()

  async function save() {
    setBusy(true)
    setError(null)
    setStatusMsg(null)
    try {
      const res = await fetch('/api/admin/alerts/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          globalEnabled,
          enabled,
          extraRecipients: extras
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
        }),
      })
      const data = (await res.json().catch(() => ({}))) as { message?: string; note?: string }
      if (!res.ok) throw new Error(data.message ?? `Save failed: ${res.status}`)
      setStatusMsg(data.note ?? 'Saved.')
      setTimeout(() => setStatusMsg(null), 12000)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-lg border border-line bg-card p-5">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-sm text-ink">Global kill switch</span>
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={globalEnabled}
            onChange={(e) => setGlobalEnabled(e.target.checked)}
            disabled={!canEdit || busy}
            className="h-5 w-5 accent-orange"
          />
          {globalEnabled ? 'Enabled' : 'Disabled'}
        </label>
      </div>

      <div className="space-y-2 border-t border-line pt-4">
        {ALERT_CATEGORIES.map((c) => (
          <label key={c} className="flex items-center justify-between gap-3 text-sm">
            <span className="text-ink">{LABEL[c]}</span>
            <input
              type="checkbox"
              checked={enabled[c] ?? true}
              onChange={(e) => setEnabled((prev) => ({ ...prev, [c]: e.target.checked }))}
              disabled={!canEdit || busy || !globalEnabled}
              className="h-5 w-5 accent-orange"
            />
          </label>
        ))}
      </div>

      <div className="mt-5 border-t border-line pt-4">
        <label className="block text-xs font-medium uppercase tracking-wider text-ink-3">
          Additional recipients (comma-separated)
        </label>
        <input
          value={extras}
          onChange={(e) => setExtras(e.target.value)}
          disabled={!canEdit || busy}
          placeholder="ameet@..., riddhi@..."
          className="mt-1 w-full rounded border border-line-strong bg-card px-2 py-1.5 text-sm"
        />
        <p className="mt-1 text-xs text-ink-3">
          These get every alert in addition to the default routing per category.
        </p>
      </div>

      {canEdit && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            onClick={save}
            disabled={busy}
            className="inline-flex min-h-[44px] items-center rounded bg-navy px-4 py-2 text-sm font-medium text-white hover:bg-navy-dark disabled:opacity-50"
          >
            {busy ? 'Saving...' : 'Save preferences'}
          </button>
          {statusMsg && (
            <span role="status" aria-live="polite" className="text-xs text-ink-2">
              {statusMsg}
            </span>
          )}
          {error && <span className="text-xs text-danger">{error}</span>}
        </div>
      )}
    </section>
  )
}
