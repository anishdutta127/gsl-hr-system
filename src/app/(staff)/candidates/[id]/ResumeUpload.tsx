'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

export function ResumeUpload({ candidateId }: { candidateId: string }) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [queuedNote, setQueuedNote] = useState<string | null>(null)

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null)
    setQueuedNote(null)
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch(`/api/candidates/${candidateId}/resume`, {
        method: 'POST',
        body: fd,
      })
      if (!res.ok) {
        const b = await res.json().catch(() => ({ message: 'Upload failed.' }))
        setError(b.message ?? 'Upload failed.')
        setBusy(false)
        return
      }
      // The file commits immediately, but the candidate record's
      // resumeFilePath update goes through the queue — the page will keep
      // showing "no resume" until the apply runner picks up. Be honest.
      setQueuedNote(
        'Resume saved. Click Sync now (top right) to force immediate sync, or wait for the next auto-sync.',
      )
      router.refresh()
      if (inputRef.current) inputRef.current.value = ''
    } catch {
      setError("We couldn't reach our server.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <label className="inline-flex min-h-[36px] cursor-pointer items-center rounded border border-line-strong bg-card px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface focus-within:ring-2 focus-within:ring-teal">
        {busy ? 'Uploading…' : 'Upload resume'}
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={handleChange}
          disabled={busy}
          className="sr-only"
        />
      </label>
      {error && <span className="text-xs text-danger">{error}</span>}
      {queuedNote && (
        <span role="status" aria-live="polite" className="max-w-xs text-right text-xs text-ink-2">
          {queuedNote}
        </span>
      )}
    </span>
  )
}
