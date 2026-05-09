'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function TaskGenerator({ employeeId }: { employeeId: string }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const router = useRouter()

  async function generate() {
    setBusy(true)
    setError(null)
    setStatus(null)
    try {
      const res = await fetch('/api/admin/onboarding/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        message?: string
        note?: string
        generated?: number
      }
      if (!res.ok) {
        throw new Error(data.message ?? `Generate failed: ${res.status}`)
      }
      setStatus(data.note ?? `${data.generated ?? 0} tasks generated.`)
      setTimeout(() => setStatus(null), 12000)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generate failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <button
        onClick={generate}
        disabled={busy}
        className="inline-flex min-h-[44px] items-center rounded bg-navy px-4 py-2 text-sm font-medium text-white hover:bg-navy-dark disabled:opacity-50"
      >
        {busy ? 'Generating...' : 'Generate onboarding tasks'}
      </button>
      {status && (
        <p role="status" aria-live="polite" className="mt-2 text-xs text-ink-2">
          {status}
        </p>
      )}
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </div>
  )
}
