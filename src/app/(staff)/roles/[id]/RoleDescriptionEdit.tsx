'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { RichTextEditor } from '@/components/RichTextEditor'

interface Props {
  roleId: string
  initialDescription: string
}

export function RoleDescriptionEdit({ roleId, initialDescription }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [html, setHtml] = useState(initialDescription)

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  async function handleSave() {
    setError(null)
    setBusy(true)
    try {
      const res = await fetch(`/api/roles/${roleId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: html }),
      })
      if (!res.ok) {
        const b = await res.json().catch(() => ({ message: 'Save failed.' }))
        setError(b.message ?? 'Save failed.')
        setBusy(false)
        return
      }
      setOpen(false)
      router.refresh()
    } catch {
      setError("We couldn't reach our server.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setHtml(initialDescription)
          setError(null)
          setOpen(true)
        }}
        className="inline-flex min-h-[36px] items-center rounded border border-line-strong bg-card px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
      >
        Edit description
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="role-desc-edit-heading"
          className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-ink/40 p-4 sm:items-center"
        >
          <div className="w-full max-w-3xl rounded-lg border border-line bg-card p-6 shadow-lg">
            <div className="mb-4 flex items-start justify-between gap-3">
              <h2 id="role-desc-edit-heading" className="font-display text-lg text-ink">
                Edit role description
              </h2>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setOpen(false)}
                className="text-ink-3 hover:text-ink"
              >
                ×
              </button>
            </div>

            {error && (
              <div role="alert" className="mb-3 rounded border border-danger-bg bg-danger-bg px-3 py-2 text-sm text-danger">
                {error}
              </div>
            )}

            <RichTextEditor ariaLabel="Role description" value={html} onChange={setHtml} />

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded border border-line-strong bg-card px-4 py-2 text-sm text-ink-2 hover:bg-surface"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={busy}
                className="rounded bg-navy px-4 py-2 text-sm font-medium text-white hover:bg-navy-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-offset-2 disabled:opacity-60"
              >
                {busy ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
