'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  IT_ASSET_CATEGORIES,
  IT_ASSET_CONDITIONS,
  type ITAssetCategory,
  type ITAssetCondition,
} from '@/lib/types'

export function CreateITAssetForm({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const [category, setCategory] = useState<ITAssetCategory>('Laptop')
  const [make, setMake] = useState('')
  const [model, setModel] = useState('')
  const [serialNumber, setSerialNumber] = useState('')
  const [assetTag, setAssetTag] = useState('')
  const [purchaseDate, setPurchaseDate] = useState('')
  const [purchaseCost, setPurchaseCost] = useState('')
  const [warrantyEndDate, setWarrantyEndDate] = useState('')
  const [condition, setCondition] = useState<ITAssetCondition>('New')
  const [location, setLocation] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  async function submit() {
    setBusy(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await fetch('/api/admin/it-assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category,
          make,
          model,
          serialNumber,
          assetTag,
          purchaseDate: purchaseDate || null,
          purchaseCost: purchaseCost ? Number(purchaseCost) : null,
          warrantyEndDate: warrantyEndDate || null,
          condition,
          location,
          notes,
        }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string }
        throw new Error(data.message ?? `Create failed: ${res.status}`)
      }
      const data = (await res.json()) as { asset: { id: string } }
      setSuccess(`Added ${data.asset.id}. Reflects once Vercel rebuilds (~2 minutes).`)
      setMake('')
      setModel('')
      setSerialNumber('')
      setAssetTag('')
      setPurchaseDate('')
      setPurchaseCost('')
      setWarrantyEndDate('')
      setNotes('')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed.')
    } finally {
      setBusy(false)
    }
  }

  const required = make.trim() && model.trim() && serialNumber.trim()

  return (
    <div className="border-b border-line bg-surface p-4">
      <h2 className="font-display text-base text-ink">Add IT asset</h2>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Category">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as ITAssetCategory)}
            disabled={busy}
            className="mt-1 w-full rounded border border-line-strong bg-card px-2 py-1.5 text-sm"
          >
            {IT_ASSET_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Make (required)">
          <input
            value={make}
            onChange={(e) => setMake(e.target.value)}
            placeholder="Dell, Apple, Logitech"
            disabled={busy}
            className="mt-1 w-full rounded border border-line-strong bg-card px-2 py-1.5 text-sm"
          />
        </Field>
        <Field label="Model (required)">
          <input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="Latitude 5420, MacBook Pro 14"
            disabled={busy}
            className="mt-1 w-full rounded border border-line-strong bg-card px-2 py-1.5 text-sm"
          />
        </Field>
        <Field label="Serial number (required)">
          <input
            value={serialNumber}
            onChange={(e) => setSerialNumber(e.target.value)}
            disabled={busy}
            className="mt-1 w-full rounded border border-line-strong bg-card px-2 py-1.5 text-sm tabular"
          />
        </Field>
        <Field label="Asset tag">
          <input
            value={assetTag}
            onChange={(e) => setAssetTag(e.target.value)}
            placeholder="GSL-LAP-001"
            disabled={busy}
            className="mt-1 w-full rounded border border-line-strong bg-card px-2 py-1.5 text-sm tabular"
          />
        </Field>
        <Field label="Condition">
          <select
            value={condition}
            onChange={(e) => setCondition(e.target.value as ITAssetCondition)}
            disabled={busy}
            className="mt-1 w-full rounded border border-line-strong bg-card px-2 py-1.5 text-sm"
          >
            {IT_ASSET_CONDITIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Purchase date">
          <input
            type="date"
            value={purchaseDate}
            onChange={(e) => setPurchaseDate(e.target.value)}
            disabled={busy}
            className="mt-1 w-full rounded border border-line-strong bg-card px-2 py-1.5 text-sm"
          />
        </Field>
        <Field label="Purchase cost (Rs)">
          <input
            type="number"
            min={0}
            value={purchaseCost}
            onChange={(e) => setPurchaseCost(e.target.value)}
            disabled={busy}
            className="mt-1 w-full rounded border border-line-strong bg-card px-2 py-1.5 text-sm"
          />
        </Field>
        <Field label="Warranty end date">
          <input
            type="date"
            value={warrantyEndDate}
            onChange={(e) => setWarrantyEndDate(e.target.value)}
            disabled={busy}
            className="mt-1 w-full rounded border border-line-strong bg-card px-2 py-1.5 text-sm"
          />
        </Field>
        <Field label="Location">
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Mumbai office, WFH-Bengaluru"
            disabled={busy}
            className="mt-1 w-full rounded border border-line-strong bg-card px-2 py-1.5 text-sm"
          />
        </Field>
        <div className="sm:col-span-3">
          <Field label="Notes">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={busy}
              rows={2}
              className="mt-1 w-full rounded border border-line-strong bg-card px-2 py-1.5 text-sm"
            />
          </Field>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          onClick={submit}
          disabled={busy || !required}
          className="inline-flex min-h-[44px] items-center rounded bg-navy px-4 py-2 text-sm font-medium text-white hover:bg-navy-dark disabled:opacity-50"
        >
          {busy ? 'Saving...' : 'Add asset'}
        </button>
        <button
          onClick={onClose}
          disabled={busy}
          className="inline-flex min-h-[44px] items-center rounded border border-line-strong bg-card px-4 py-2 text-sm text-ink-2 hover:bg-surface"
        >
          Close
        </button>
        {error && <span className="text-xs text-danger">{error}</span>}
        {success && <span className="text-xs text-success">{success}</span>}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium uppercase tracking-wider text-ink-3">{label}</span>
      {children}
    </label>
  )
}
