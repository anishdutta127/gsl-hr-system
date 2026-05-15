'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Laptop } from 'lucide-react'
import { IT_ASSET_CATEGORIES, type ITAsset, type ITAssetCategory } from '@/lib/types'

/** Starter kit categories suggested when HR opens the picker. HR can
 *  still pick anything; this just biases the pre-check. */
const STARTER_KIT: ITAssetCategory[] = ['Laptop', 'Charger', 'Headset']

interface Props {
  employeeId: string
  employeeName: string
  availableAssets: Pick<ITAsset, 'id' | 'category' | 'make' | 'model' | 'serialNumber' | 'status'>[]
}

export function AssignITAssetsButton({ employeeId, employeeName, availableAssets }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [picked, setPicked] = useState<Set<string>>(
    () => new Set(availableAssets
      .filter((a) => STARTER_KIT.includes(a.category) && a.status === 'Available')
      .slice(0, 3)
      .map((a) => a.id),
    ),
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  function toggle(id: string) {
    setPicked((p) => {
      const next = new Set(p)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function assignAll() {
    setBusy(true)
    setError(null)
    setSuccess(null)
    try {
      const ids = Array.from(picked)
      let failures = 0
      for (const id of ids) {
        const res = await fetch(`/api/admin/it-assets/${encodeURIComponent(id)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'assign', employeeId }),
        })
        if (!res.ok) failures++
      }
      if (failures > 0) {
        setError(`${failures} of ${ids.length} assets failed to assign. Check the asset detail pages.`)
      } else {
        setSuccess(`Assigned ${ids.length} assets to ${employeeName}. Reflects once Vercel rebuilds.`)
      }
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Assign failed.')
    } finally {
      setBusy(false)
    }
  }

  const groupedByCategory = new Map<ITAssetCategory, typeof availableAssets>()
  for (const cat of IT_ASSET_CATEGORIES) groupedByCategory.set(cat, [])
  for (const a of availableAssets) {
    if (a.status !== 'Available') continue
    groupedByCategory.get(a.category)?.push(a)
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex min-h-[44px] items-center gap-1.5 rounded border border-line-strong bg-card px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface"
      >
        <Laptop className="h-4 w-4" aria-hidden="true" />
        Assign IT assets
      </button>
    )
  }

  return (
    <div className="mt-3 rounded border border-line bg-surface p-4">
      <h3 className="font-display text-sm text-ink">Assign IT asset starter kit to {employeeName}</h3>
      <p className="mt-1 text-xs text-ink-2">
        Pick from available inventory. Items in Laptop, Charger, Headset are pre-checked
        as a starter kit; uncheck what you do not need. For new hardware, add it under{' '}
        <a href="/admin/it-assets" className="text-navy hover:underline">/admin/it-assets</a> first.
      </p>
      {availableAssets.filter((a) => a.status === 'Available').length === 0 ? (
        <p className="mt-3 text-sm text-ink-3">
          No available IT assets in inventory.{' '}
          <a href="/admin/it-assets" className="text-navy hover:underline">Add some →</a>
        </p>
      ) : (
        <div className="mt-3 max-h-64 overflow-y-auto rounded border border-line bg-card">
          {IT_ASSET_CATEGORIES.map((cat) => {
            const items = groupedByCategory.get(cat) ?? []
            if (items.length === 0) return null
            return (
              <fieldset key={cat} className="border-b border-line p-2 text-sm">
                <legend className="px-1 text-xs font-semibold uppercase tracking-wider text-ink-3">
                  {cat} ({items.length})
                </legend>
                <ul className="space-y-1">
                  {items.map((a) => (
                    <li key={a.id}>
                      <label className="flex items-center gap-2 rounded px-1 py-1 hover:bg-surface">
                        <input
                          type="checkbox"
                          checked={picked.has(a.id)}
                          onChange={() => toggle(a.id)}
                          disabled={busy}
                          className="min-h-[20px] min-w-[20px]"
                        />
                        <span className="tabular text-xs text-navy">{a.id}</span>
                        <span className="text-ink">{a.make} {a.model}</span>
                        <span className="ml-auto text-xs text-ink-3 tabular">{a.serialNumber}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </fieldset>
            )
          })}
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          onClick={assignAll}
          disabled={busy || picked.size === 0}
          className="inline-flex min-h-[44px] items-center rounded bg-navy px-3 py-1.5 text-sm font-medium text-white hover:bg-navy-dark disabled:opacity-50"
        >
          {busy ? 'Assigning...' : `Assign ${picked.size} asset${picked.size === 1 ? '' : 's'}`}
        </button>
        <button
          onClick={() => setOpen(false)}
          disabled={busy}
          className="inline-flex min-h-[44px] items-center rounded border border-line-strong bg-card px-3 py-1.5 text-sm text-ink-2 hover:bg-surface"
        >
          Close
        </button>
        {error && <span className="text-xs text-danger">{error}</span>}
        {success && <span className="text-xs text-success" role="status" aria-live="polite">{success}</span>}
      </div>
    </div>
  )
}
