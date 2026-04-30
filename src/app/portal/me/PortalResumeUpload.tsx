'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  hasExistingResume: boolean
}

export function PortalResumeUpload({ hasExistingResume }: Props) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null)
    setSuccess(false)
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setError('Please upload a PDF.')
      if (inputRef.current) inputRef.current.value = ''
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('That file is over 5 MB. Please trim or compress it.')
      if (inputRef.current) inputRef.current.value = ''
      return
    }

    setBusy(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/portal/resume', { method: 'POST', body: fd })
      if (res.status === 401) {
        // Session expired mid-upload — bounce them to the magic link refresh.
        window.location.href = '/portal/request-new-link?reason=expired'
        return
      }
      if (!res.ok) {
        const b = await res.json().catch(() => ({ message: 'Upload failed.' }))
        setError(b.message ?? 'Upload failed.')
        setBusy(false)
        if (inputRef.current) inputRef.current.value = ''
        return
      }
      setSuccess(true)
      if (inputRef.current) inputRef.current.value = ''
      router.refresh()
    } catch {
      setError("We couldn't reach our server. Please try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-lg border border-line bg-card p-5">
      <h2 className="font-display text-lg text-ink">
        {hasExistingResume ? 'Resume on file' : 'Add your resume'}
      </h2>
      <p className="mt-1 text-sm text-ink-2">
        {hasExistingResume
          ? "Send us a fresh copy whenever you'd like — we keep the latest."
          : 'A PDF helps the team move faster on your application.'}
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label className="inline-flex min-h-[44px] cursor-pointer items-center rounded bg-navy px-4 py-2 text-sm font-medium text-white hover:bg-navy-dark focus-within:outline-none focus-within:ring-2 focus-within:ring-teal focus-within:ring-offset-2">
          {busy ? 'Uploading…' : hasExistingResume ? 'Upload new copy' : 'Upload PDF'}
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,application/pdf"
            onChange={handleChange}
            disabled={busy}
            className="sr-only"
          />
        </label>
        <span className="text-xs text-ink-3">PDF only, up to 5 MB.</span>
      </div>
      {success && (
        <p role="status" className="mt-3 text-sm text-success">
          Thanks, your resume is uploaded. Our team will review.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  )
}
