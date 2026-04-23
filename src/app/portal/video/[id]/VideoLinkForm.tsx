'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { validateVideoUrl } from '@/lib/videoUrl'

export function VideoLinkForm({ applicationId }: { applicationId: string }) {
  const router = useRouter()
  const [url, setUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const check = validateVideoUrl(url)
    if (!check.valid) {
      setError(check.reason ?? 'That link is not supported.')
      return
    }
    setBusy(true)
    try {
      const res = await fetch(`/api/portal/video/${applicationId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ message: 'Could not save.' }))
        setError(body.message ?? 'Could not save.')
        setBusy(false)
        return
      }
      router.refresh()
    } catch {
      setError("We couldn't reach our server. Try again in a moment.")
      setBusy(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3">
      <label htmlFor="videoUrl" className="block text-sm font-medium text-ink">
        Share link
      </label>
      <input
        id="videoUrl"
        type="url"
        inputMode="url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://drive.google.com/file/d/..."
        required
        className="mt-1 block w-full rounded border border-line-strong bg-card px-3 py-2 text-base text-ink focus-visible:border-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
      />
      {error && (
        <div
          role="alert"
          className="mt-3 rounded border border-danger bg-danger-bg px-3 py-2 text-sm text-danger"
        >
          {error}
        </div>
      )}
      <button
        type="submit"
        disabled={busy}
        className="mt-4 inline-flex min-h-[44px] items-center rounded bg-navy px-4 py-2.5 text-base font-medium text-white hover:bg-navy-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-offset-2 disabled:opacity-60"
      >
        {busy ? 'Submitting…' : 'Submit link'}
      </button>
    </form>
  )
}
