'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  PRE_ONBOARDING_TEMPLATE_IDS,
  TEMPLATE_ATTACHMENT_SUGGESTIONS,
  renderEmailTemplate,
  type PreOnboardingTemplateId,
  type TemplateContext,
} from '@/lib/preOnboardingEmails'

interface Props {
  applicationId: string
  /** Display name only - used in the button label and modal heading. */
  candidateName: string
  /** Pre-fill the To: field. HR can edit before firing. */
  candidateEmail: string
  defaults: {
    templateId: PreOnboardingTemplateId
    /** Comma-joined string of default CC addresses (HR-Admin + hiring manager). */
    ccDefault: string[]
    context: TemplateContext
  }
  /** Optional separate hiring manager email surfaced as a hint under the CC
   * field, in case it is not already in ccDefault. */
  hiringManagerEmail?: string
}

const TEMPLATE_TITLE: Record<PreOnboardingTemplateId, string> = {
  'offer-intimation': 'Offer Intimation',
  'offer-followup': 'Follow-up',
  'appointment-letter': 'Appointment Letter',
  'notice-period-checkin': 'Notice Period Check-in',
}

/**
 * Self-contained modal trigger for sending one pre-onboarding email
 * template via mailto:. The button label is "Send <Template Title>";
 * clicking opens a modal pre-filled with the rendered template that HR
 * can edit before firing.
 *
 * mailto: cannot carry attachments and cannot confirm whether the user
 * actually hit Send inside their mail client. We log the act of opening
 * the draft (subject + checklist of attachments HR claimed they would
 * attach) so the unlock chain on the candidate detail page can move
 * forward, and so the audit trail captures the wording.
 */
export function SendPreOnboardingEmail(props: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const templateId = props.defaults.templateId
  const templateTitle = TEMPLATE_TITLE[templateId]

  // Stable JSON key over the context so the memo only recomputes when
  // the actual values change. props.defaults.context is rebuilt on every
  // parent render, so identity-based memoisation would never hit.
  const contextKey = JSON.stringify(props.defaults.context)
  const ccKey = (props.defaults.ccDefault ?? []).join('|')

  const rendered = useMemo(() => {
    try {
      return renderEmailTemplate(templateId, props.defaults.context)
    } catch (err) {
      return {
        subject: '',
        body: '',
        attachmentSuggestions: TEMPLATE_ATTACHMENT_SUGGESTIONS[templateId],
        error: err instanceof Error ? err.message : 'Template render failed.',
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId, contextKey])

  const [to, setTo] = useState(props.candidateEmail ?? '')
  const [cc, setCc] = useState((props.defaults.ccDefault ?? []).join(', '))
  const [subject, setSubject] = useState(rendered.subject)
  const [body, setBody] = useState(rendered.body)
  const [attachmentsClaimed, setAttachmentsClaimed] = useState<Record<string, boolean>>(() => {
    const map: Record<string, boolean> = {}
    for (const s of rendered.attachmentSuggestions) map[s] = true
    return map
  })

  // Reset state when the modal opens so each open starts from the
  // current template render, not whatever the user typed last time.
  useEffect(() => {
    if (!open) return
    setError(null)
    setSuccess(null)
    setTo(props.candidateEmail ?? '')
    setCc((props.defaults.ccDefault ?? []).join(', '))
    setSubject(rendered.subject)
    setBody(rendered.body)
    const map: Record<string, boolean> = {}
    for (const s of rendered.attachmentSuggestions) map[s] = true
    setAttachmentsClaimed(map)
    // We intentionally re-key on contextKey/ccKey rather than the
    // unstable props references.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, props.candidateEmail, ccKey, contextKey])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  function toggleAttachment(name: string) {
    setAttachmentsClaimed((prev) => ({ ...prev, [name]: !prev[name] }))
  }

  function buildMailto(): string {
    const ccList = cc
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    const params = new URLSearchParams()
    if (ccList.length > 0) params.set('cc', ccList.join(','))
    params.set('subject', subject)
    params.set('body', body)
    // URLSearchParams encodes spaces as +, but mail clients want %20. Swap.
    const qs = params.toString().replace(/\+/g, '%20')
    return `mailto:${encodeURIComponent(to)}?${qs}`
  }

  async function onSend() {
    setError(null)
    setSuccess(null)
    if (!to.trim()) {
      setError('Recipient is required.')
      return
    }
    if (!subject.trim()) {
      setError('Subject is required.')
      return
    }
    if (!body.trim()) {
      setError('Body is required.')
      return
    }
    const claimed = Object.entries(attachmentsClaimed)
      .filter(([, v]) => v)
      .map(([k]) => k)
    startTransition(async () => {
      try {
        const res = await fetch(
          `/api/applications/${props.applicationId}/pre-onboarding/email`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              templateId,
              subject,
              body,
              attachmentsClaimed: claimed,
            }),
          },
        )
        if (!res.ok) {
          const payload = (await res.json().catch(() => ({}))) as { message?: string }
          setError(payload.message ?? 'We could not log the draft. Try again.')
          return
        }
        // API recorded the send. Open the mail client.
        window.location.href = buildMailto()
        setSuccess('Draft opened in your mail client. Attach the listed files before sending.')
        setOpen(false)
        router.refresh()
      } catch {
        setError('We could not reach our server. Try again.')
      }
    })
  }

  const headingId = `send-${templateId}-${props.applicationId}-heading`
  const renderError = 'error' in rendered ? (rendered as { error: string }).error : null

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-[36px] items-center rounded border border-line-strong bg-card px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal disabled:cursor-not-allowed disabled:opacity-60"
      >
        Send {templateTitle}
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={headingId}
          className="fixed inset-0 z-[70] flex items-end justify-center overflow-y-auto bg-ink/40 p-2 sm:items-center sm:p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="my-4 w-full max-w-2xl rounded-lg border border-line bg-card p-5 shadow-lg sm:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="mb-3">
              <h2 id={headingId} className="font-display text-lg text-ink">
                Send {templateTitle} to {props.candidateName}
              </h2>
              <p className="mt-1 text-xs text-ink-2">
                This opens a draft in your default mail client. Review the body, attach
                the listed files manually (mailto: drafts cannot carry attachments), then
                hit Send in Outlook. We log what you saw here for the audit trail.
              </p>
            </header>

            <div
              role="status"
              className="mb-3 rounded border border-warning bg-warning-bg px-3 py-2 text-xs text-ink"
            >
              Attachments cannot be carried by a mailto: draft. The checklist below is a
              reminder to attach those files inside Outlook before you press Send.
            </div>

            {renderError && (
              <div role="alert" className="mb-3 rounded border border-danger bg-danger-bg px-3 py-2 text-xs text-danger">
                Template could not be rendered: {renderError}
              </div>
            )}

            <div className="space-y-3 text-xs">
              <label className="block">
                <span className="text-ink-2">To</span>
                <input
                  type="email"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="mt-1 block w-full rounded border border-line-strong bg-card px-2 py-1.5 text-xs text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
                  aria-label="Recipient email"
                />
              </label>
              <label className="block">
                <span className="text-ink-2">CC (comma-separated)</span>
                <input
                  type="text"
                  value={cc}
                  onChange={(e) => setCc(e.target.value)}
                  className="mt-1 block w-full rounded border border-line-strong bg-card px-2 py-1.5 text-xs text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
                  aria-label="CC list"
                  placeholder="hr@gsl, hiring-manager@gsl"
                />
                {props.hiringManagerEmail && !(props.defaults.ccDefault ?? []).includes(props.hiringManagerEmail) && (
                  <span className="mt-1 block text-ink-3">
                    Hiring manager: {props.hiringManagerEmail}
                  </span>
                )}
              </label>
              <label className="block">
                <span className="text-ink-2">Subject</span>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="mt-1 block w-full rounded border border-line-strong bg-card px-2 py-1.5 text-xs text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
                  aria-label="Email subject"
                />
              </label>
              <label className="block">
                <span className="text-ink-2">Body</span>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={16}
                  className="mt-1 block w-full rounded border border-line-strong bg-card px-2 py-1.5 font-mono text-xs text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
                  aria-label="Email body"
                />
              </label>

              {rendered.attachmentSuggestions.length > 0 && (
                <fieldset>
                  <legend className="text-ink-2">Attachments to attach in Outlook</legend>
                  <div className="mt-2 space-y-1.5">
                    {rendered.attachmentSuggestions.map((name) => (
                      <label
                        key={name}
                        className="flex min-h-[36px] cursor-pointer items-center gap-2 rounded border border-line px-3 py-1.5 hover:bg-surface"
                      >
                        <input
                          type="checkbox"
                          checked={attachmentsClaimed[name] ?? false}
                          onChange={() => toggleAttachment(name)}
                          className="h-4 w-4 rounded border-line-strong text-navy focus-visible:ring-2 focus-visible:ring-teal"
                        />
                        <span className="text-ink">{name}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}
            </div>

            {error && (
              <div role="alert" className="mt-3 rounded border border-danger bg-danger-bg px-3 py-2 text-xs text-danger">
                {error}
              </div>
            )}
            {success && (
              <div role="status" className="mt-3 rounded border border-success bg-success-bg px-3 py-2 text-xs text-success">
                {success}
              </div>
            )}

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={busy}
                className="inline-flex min-h-[44px] items-center rounded border border-line-strong bg-card px-4 py-2 text-sm font-medium text-ink-2 hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onSend}
                disabled={busy || !!renderError}
                className="inline-flex min-h-[44px] items-center rounded bg-navy px-4 py-2 text-sm font-medium text-white hover:bg-navy-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busy ? 'Opening draft…' : 'Send via Outlook'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

/** Exported for the candidate detail page so it can map a templateId to
 * the same label used inside the modal heading. Kept in this module to
 * avoid duplicating the mapping in two places. */
export function preOnboardingTemplateTitle(id: PreOnboardingTemplateId): string {
  return TEMPLATE_TITLE[id]
}

// Re-export the template id constant for consumers that want to iterate
// the full set without importing both files.
export { PRE_ONBOARDING_TEMPLATE_IDS }
