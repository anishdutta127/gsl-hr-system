'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { RichTextEditor } from '@/components/RichTextEditor'

interface Props {
  roleId: string
  initialDescription: string
}

/**
 * Modal for editing a role JD.
 *
 * Layout: fixed-height shell with three rows — header / scrolling body /
 * footer. The body is the dialog's own scroll container (not the page, not
 * the outer overlay), so:
 *   1. The sticky toolbar inside RichTextEditor pins to the top of the
 *      *body*, not the viewport. With long JDs (3000+ words), the toolbar
 *      stays in reach even after scrolling several screens of content.
 *   2. The Save / Cancel footer stays visible regardless of content height.
 *      Round 3's outer-overflow approach pushed the footer below the fold
 *      with long content; this is the proper modal-with-scrollable-body
 *      pattern that doesn't.
 *   3. Mobile (375px) gets the same behaviour — the dialog is bottom-anchored
 *      with a 92vh max-height so the footer is always tappable.
 *
 * Background scroll lock is applied while the dialog is open so iOS Safari
 * doesn't bleed page-level scroll into the dialog body.
 */
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
    // Lock background scroll while modal is open. Restoring on unmount
    // prevents the lock leaking if the user closes via Escape mid-typing.
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previousOverflow
    }
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
          className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40 sm:items-center sm:p-4"
        >
          <div
            className="flex h-[92vh] w-full max-w-3xl flex-col rounded-t-lg border border-line bg-card shadow-lg sm:h-[min(85vh,720px)] sm:rounded-lg"
          >
            <header className="flex shrink-0 items-start justify-between gap-3 border-b border-line px-4 py-3 sm:px-6">
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
            </header>

            <div className="flex flex-1 min-h-0 flex-col overflow-y-auto px-4 py-3 sm:px-6">
              {error && (
                <div role="alert" className="mb-3 rounded border border-danger-bg bg-danger-bg px-3 py-2 text-sm text-danger">
                  {error}
                </div>
              )}
              <RichTextEditor ariaLabel="Role description" value={html} onChange={setHtml} />
            </div>

            <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-line bg-surface px-4 py-3 sm:px-6">
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
            </footer>
          </div>
        </div>
      )}
    </>
  )
}
