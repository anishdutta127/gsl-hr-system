'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function UnarchiveButton({ candidateId }: { candidateId: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function unarchive() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/candidates/${candidateId}/unarchive`, { method: 'POST' })
      if (!res.ok) {
        const b = await res.json().catch(() => ({ message: 'Failed.' }))
        setError(b.message ?? 'Failed.')
        setBusy(false)
        return
      }
      router.refresh()
    } catch {
      setError("We couldn't reach our server.")
      setBusy(false)
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={unarchive}
        disabled={busy}
        className="inline-flex min-h-[36px] items-center rounded bg-navy px-3 py-1.5 text-sm font-medium text-white hover:bg-navy-dark disabled:opacity-60"
      >
        {busy ? 'Unarchiving…' : 'Unarchive'}
      </button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </span>
  )
}
