'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { StagePill } from '@/components/StagePill'
import { PipelineActions, type CurrentMembership, type OpenRoleOption } from '@/components/PipelineActions'

export interface SidePanelCandidate {
  id: string
  name: string
  email: string
  phone: string
  source: string
  programmes: string[]
  notes: string
  resumeFilePath?: string
}

interface Props {
  open: boolean
  onClose: () => void
  candidate: SidePanelCandidate | null
  applicationId: string
  currentStage: string
  memberships: CurrentMembership[]
  openRoles: OpenRoleOption[]
  canEdit: boolean
}

/**
 * Candidate quick-view that opens when an HR clicks a card in the role Kanban.
 * Surfaces the same primitives the full candidate detail page does — resume
 * View / Upload, contact info, programme tags, and the Move / Add pipeline
 * actions — so HR doesn't have to leave the role pipeline to act on a
 * candidate. The full detail page is one click away via "Open full candidate
 * record" for everything else (audit log, applications history, score
 * interview).
 */
export function CandidateSidePanel({
  open,
  onClose,
  candidate,
  applicationId,
  currentStage,
  memberships,
  openRoles,
  canEdit,
}: Props) {
  const router = useRouter()
  const [uploadBusy, setUploadBusy] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open || !candidate) return null

  async function handleResumeUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!candidate) return
    setUploadError(null)
    const file = e.target.files?.[0]
    if (!file) return
    setUploadBusy(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch(`/api/candidates/${candidate.id}/resume`, {
        method: 'POST',
        body: fd,
      })
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { message?: string }
        setUploadError(b.message ?? 'Upload failed.')
        setUploadBusy(false)
        return
      }
      router.refresh()
      if (inputRef.current) inputRef.current.value = ''
    } catch {
      setUploadError("We couldn't reach our server.")
    } finally {
      setUploadBusy(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="kanban-panel-heading"
      className="fixed inset-0 z-40 flex items-end justify-end bg-ink/40 sm:items-stretch"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex w-full max-h-[90vh] flex-col rounded-t-lg border border-line bg-card shadow-lg sm:h-full sm:max-h-none sm:w-full sm:max-w-md sm:rounded-none sm:border-l"
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 id="kanban-panel-heading" className="font-display text-lg text-ink truncate">
              {candidate.name}
            </h2>
            <p className="mt-0.5 text-xs text-ink-2">
              {candidate.email || 'no email on file'}
              {candidate.phone ? ` · ${candidate.phone}` : ''}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <StagePill stage={currentStage} />
              <span className="text-xs text-ink-3">in this role</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-ink-3 hover:text-ink"
          >
            ×
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <section className="mb-5">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-2">
              Resume
            </h3>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {candidate.resumeFilePath ? (
                <a
                  href={`/api/resumes/${candidate.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-[36px] items-center rounded border border-line-strong bg-card px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
                >
                  View resume
                </a>
              ) : (
                <span className="text-sm text-ink-3">No resume on file.</span>
              )}
              {canEdit && (
                <label className="inline-flex min-h-[36px] cursor-pointer items-center rounded border border-line-strong bg-card px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface focus-within:ring-2 focus-within:ring-teal">
                  {uploadBusy
                    ? 'Uploading…'
                    : candidate.resumeFilePath
                      ? 'Replace resume'
                      : 'Upload resume'}
                  <input
                    ref={inputRef}
                    type="file"
                    accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    onChange={handleResumeUpload}
                    disabled={uploadBusy}
                    className="sr-only"
                  />
                </label>
              )}
            </div>
            {uploadError && (
              <p role="alert" className="mt-2 text-xs text-danger">
                {uploadError}
              </p>
            )}
            {candidate.resumeFilePath && (
              <p className="mt-2 break-all text-[11px] text-ink-3">{candidate.resumeFilePath}</p>
            )}
          </section>

          <section className="mb-5">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-2">
              Source
            </h3>
            <p className="mt-1 text-sm text-ink">{candidate.source}</p>
          </section>

          {candidate.programmes.length > 0 && (
            <section className="mb-5">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-2">
                Programme tags
              </h3>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {candidate.programmes.map((p) => (
                  <span
                    key={p}
                    className="inline-flex items-center rounded bg-surface px-2 py-0.5 text-xs text-ink-2"
                  >
                    {p}
                  </span>
                ))}
              </div>
            </section>
          )}

          {candidate.notes && (
            <section className="mb-5">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-2">
                Notes
              </h3>
              <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{candidate.notes}</p>
            </section>
          )}

          {canEdit && (
            <section className="mb-5">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-2">
                Pipeline actions
              </h3>
              <div className="mt-2">
                <PipelineActions
                  candidateId={candidate.id}
                  candidateName={candidate.name}
                  memberships={memberships}
                  openRoles={openRoles}
                  defaultMoveSourceApplicationId={applicationId}
                  variant="compact"
                />
              </div>
            </section>
          )}
        </div>

        <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-line bg-surface px-5 py-3">
          <Link
            href={`/candidates/${candidate.id}`}
            className="inline-flex min-h-[36px] items-center rounded border border-line-strong bg-card px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface"
          >
            Open full candidate record
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-[36px] items-center rounded px-3 py-1.5 text-sm font-medium text-ink-2 hover:text-ink"
          >
            Close
          </button>
        </footer>
      </div>
    </div>
  )
}
