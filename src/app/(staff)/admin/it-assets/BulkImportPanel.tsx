'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { IT_ASSET_CATEGORIES, type ITAssetCategory } from '@/lib/types'

const HEADER_HINT = [
  'category',
  'make',
  'model',
  'serialNumber',
  'assetTag',
  'purchaseDate',
  'purchaseCost',
  'warrantyEndDate',
  'condition',
  'location',
  'notes',
].join(',')

export function BulkImportPanel({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const [csv, setCsv] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  async function importCsv() {
    setBusy(true)
    setError(null)
    setSuccess(null)
    try {
      const rows = parseCsv(csv)
      if (rows.length === 0) throw new Error('No rows to import.')

      const res = await fetch('/api/admin/it-assets?bulk=1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string }
        throw new Error(data.message ?? `Import failed: ${res.status}`)
      }
      const data = (await res.json()) as { createdCount: number }
      setSuccess(`Imported ${data.createdCount} assets. Reflects once Vercel rebuilds (~2 minutes).`)
      setCsv('')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="border-b border-line bg-surface p-4">
      <h2 className="font-display text-base text-ink">Bulk import IT assets</h2>
      <p className="mt-1 text-xs text-ink-2">
        Paste CSV with a header row. Required columns: category, make, model, serialNumber.
        Optional columns: assetTag, purchaseDate (YYYY-MM-DD), purchaseCost (rupees),
        warrantyEndDate, condition, location, notes. Valid categories:{' '}
        {IT_ASSET_CATEGORIES.join(', ')}.
      </p>
      <details className="mt-2 text-xs text-ink-3">
        <summary className="cursor-pointer">Header template (click to expand)</summary>
        <pre className="mt-1 rounded border border-line bg-card p-2 tabular text-[11px]">
          {HEADER_HINT}
        </pre>
      </details>
      <textarea
        value={csv}
        onChange={(e) => setCsv(e.target.value)}
        rows={8}
        placeholder={`category,make,model,serialNumber\nLaptop,Dell,Latitude 5420,SN-0001\n`}
        disabled={busy}
        className="mt-3 w-full rounded border border-line-strong bg-card px-2 py-1.5 font-mono text-xs tabular"
      />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          onClick={importCsv}
          disabled={busy || !csv.trim()}
          className="inline-flex min-h-[44px] items-center rounded bg-navy px-4 py-2 text-sm font-medium text-white hover:bg-navy-dark disabled:opacity-50"
        >
          {busy ? 'Importing...' : 'Import'}
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

interface ParsedRow {
  category: ITAssetCategory
  make: string
  model: string
  serialNumber: string
  assetTag?: string
  purchaseDate?: string | null
  purchaseCost?: number | null
  warrantyEndDate?: string | null
  condition?: string
  location?: string
  notes?: string
}

function parseCsv(csv: string): ParsedRow[] {
  const lines = csv
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  if (lines.length < 2) return []
  const headers = parseCsvLine(lines[0]!).map((h) => h.trim())

  const rows: ParsedRow[] = []
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]!)
    const obj: Record<string, string> = {}
    headers.forEach((h, idx) => {
      obj[h] = cells[idx] ?? ''
    })
    const row: ParsedRow = {
      category: (obj['category'] ?? 'Other') as ITAssetCategory,
      make: obj['make'] ?? '',
      model: obj['model'] ?? '',
      serialNumber: obj['serialNumber'] ?? '',
      assetTag: obj['assetTag'] ?? '',
      purchaseDate: obj['purchaseDate'] || null,
      purchaseCost: obj['purchaseCost'] ? Number(obj['purchaseCost']) : null,
      warrantyEndDate: obj['warrantyEndDate'] || null,
      condition: obj['condition'] ?? undefined,
      location: obj['location'] ?? '',
      notes: obj['notes'] ?? '',
    }
    rows.push(row)
  }
  return rows
}

function parseCsvLine(line: string): string[] {
  // Minimal CSV-with-quotes parser. Handles "a,b", and ""escaped"".
  const out: string[] = []
  let cur = ''
  let inQuote = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!
    if (inQuote) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"'
        i++
      } else if (ch === '"') {
        inQuote = false
      } else {
        cur += ch
      }
    } else {
      if (ch === '"') inQuote = true
      else if (ch === ',') {
        out.push(cur)
        cur = ''
      } else cur += ch
    }
  }
  out.push(cur)
  return out
}
