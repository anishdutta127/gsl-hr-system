'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  HANDOVER_TEMPLATE_KINDS,
  type ExitHandover,
  type HandoverAccessItem,
  type HandoverKeyContact,
  type HandoverKnowledgeSession,
  type HandoverPendingTask,
  type HandoverTemplateKind,
} from '@/lib/types'

interface ITAssetOption {
  id: string
  label: string
  currentlyAssigned: boolean
}

interface Props {
  employeeId: string
  employeeName: string
  initialHandover: ExitHandover
  canEdit: boolean
  canReview: boolean
  itAssetOptions: ITAssetOption[]
}

export function HandoverEditor(props: Props) {
  const router = useRouter()
  const [template, setTemplate] = useState<HandoverTemplateKind | null>(
    props.initialHandover.templateUsed,
  )
  const [pendingTasks, setPendingTasks] = useState<HandoverPendingTask[]>(
    props.initialHandover.checklist.pendingTasks,
  )
  const [keyContacts, setKeyContacts] = useState<HandoverKeyContact[]>(
    props.initialHandover.checklist.keyContacts,
  )
  const [accessRevocation, setAccessRevocation] = useState<HandoverAccessItem[]>(
    props.initialHandover.checklist.accessRevocation,
  )
  const [itAssetsReturned, setItAssetsReturned] = useState<Set<string>>(
    new Set(props.initialHandover.checklist.itAssetsReturned),
  )
  const [knowledgeTransfer, setKnowledgeTransfer] = useState<HandoverKnowledgeSession[]>(
    props.initialHandover.checklist.knowledgeTransfer,
  )
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reviewNotes, setReviewNotes] = useState(props.initialHandover.reviewNotes ?? '')

  async function save() {
    setBusy(true)
    setError(null)
    setStatus(null)
    try {
      const res = await fetch(`/api/admin/exit-handover/${encodeURIComponent(props.employeeId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateUsed: template,
          checklist: {
            pendingTasks,
            keyContacts,
            accessRevocation,
            itAssetsReturned: Array.from(itAssetsReturned),
            knowledgeTransfer,
          },
        }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string }
        throw new Error(data.message ?? `Save failed: ${res.status}`)
      }
      setStatus('Saved.')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.')
    } finally {
      setBusy(false)
    }
  }

  async function uploadDoc(file: File) {
    setBusy(true)
    setError(null)
    setStatus(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch(
        `/api/admin/exit-handover/${encodeURIComponent(props.employeeId)}/document`,
        { method: 'POST', body: fd },
      )
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string }
        throw new Error(data.message ?? `Upload failed: ${res.status}`)
      }
      setStatus('Document uploaded. Reflects once Vercel rebuilds (~2 minutes).')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.')
    } finally {
      setBusy(false)
    }
  }

  async function markReviewed() {
    setBusy(true)
    setError(null)
    setStatus(null)
    try {
      const res = await fetch(
        `/api/admin/exit-handover/${encodeURIComponent(props.employeeId)}?action=review`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reviewNotes }),
        },
      )
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string }
        throw new Error(data.message ?? `Review failed: ${res.status}`)
      }
      setStatus('Marked reviewed.')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Review failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      {!props.canEdit && (
        <p className="rounded border border-warning bg-warning-bg px-3 py-2 text-xs text-ink">
          Read-only view. Edits restricted to HR, Admin, and the reporting manager.
        </p>
      )}

      <section className="rounded-lg border border-line bg-card p-5" aria-labelledby="tpl-h">
        <h2 id="tpl-h" className="font-display text-base text-ink">Handover template</h2>
        <p className="mt-1 text-xs text-ink-2">
          Pick a template, download the markdown skeleton, fill it in, then upload the
          completed document below.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select
            value={template ?? ''}
            onChange={(e) =>
              setTemplate((e.target.value as HandoverTemplateKind) || null)
            }
            disabled={busy || !props.canEdit}
            className="min-h-[36px] rounded border border-line-strong bg-card px-2 py-1.5 text-sm"
          >
            <option value="">- pick a template -</option>
            {HANDOVER_TEMPLATE_KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
          {template && template !== 'Custom' && (
            <a
              href={`/api/admin/exit-handover/${encodeURIComponent(props.employeeId)}/template?kind=${template}`}
              className="inline-flex min-h-[44px] items-center rounded border border-line-strong bg-card px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface"
            >
              Download {template} template
            </a>
          )}
        </div>
      </section>

      <section className="rounded-lg border border-line bg-card p-5" aria-labelledby="doc-h">
        <h2 id="doc-h" className="font-display text-base text-ink">Handover document</h2>
        {props.initialHandover.document ? (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <a
              href={`/api/admin/exit-handover/${encodeURIComponent(props.employeeId)}/document/${encodeURIComponent(extractFileId(props.initialHandover.document.storageRef))}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-[44px] items-center rounded border border-line-strong bg-card px-3 py-1.5 text-sm font-medium text-navy hover:bg-surface"
            >
              View uploaded document
            </a>
            <span className="text-xs text-ink-3">
              {props.initialHandover.document.filename} ·{' '}
              {(props.initialHandover.document.fileSize / 1024).toFixed(1)} KB · uploaded{' '}
              {props.initialHandover.document.uploadedAt.slice(0, 10)} by{' '}
              {props.initialHandover.document.uploadedBy}
            </span>
          </div>
        ) : (
          <p className="mt-3 text-sm text-ink-2">No document uploaded yet.</p>
        )}
        {props.canEdit && (
          <div className="mt-3">
            <label htmlFor="handover-file" className="block text-xs font-semibold uppercase tracking-wider text-ink-3">
              Upload completed handover (PDF, DOCX, or MD)
            </label>
            <input
              id="handover-file"
              type="file"
              accept=".pdf,.docx,.doc,.md"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void uploadDoc(f)
                e.target.value = ''
              }}
              className="mt-1 block w-full text-sm"
            />
          </div>
        )}
      </section>

      <section className="rounded-lg border border-line bg-card p-5" aria-labelledby="tasks-h">
        <h2 id="tasks-h" className="font-display text-base text-ink">Pending tasks</h2>
        <ItemList
          items={pendingTasks}
          setItems={props.canEdit ? setPendingTasks : undefined}
          renderRow={(t, onChange) => (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <input
                value={t.description}
                onChange={(e) => onChange({ ...t, description: e.target.value })}
                placeholder="Task description"
                className="rounded border border-line-strong bg-card px-2 py-1.5 text-sm"
                disabled={!props.canEdit || busy}
              />
              <input
                value={t.owner}
                onChange={(e) => onChange({ ...t, owner: e.target.value })}
                placeholder="New owner"
                className="rounded border border-line-strong bg-card px-2 py-1.5 text-sm"
                disabled={!props.canEdit || busy}
              />
              <input
                type="date"
                value={t.dueDate ?? ''}
                onChange={(e) => onChange({ ...t, dueDate: e.target.value || null })}
                className="rounded border border-line-strong bg-card px-2 py-1.5 text-sm"
                disabled={!props.canEdit || busy}
              />
            </div>
          )}
          newRow={() => ({ description: '', owner: '', dueDate: null })}
          addLabel="+ Add task"
          canEdit={props.canEdit}
        />
      </section>

      <section className="rounded-lg border border-line bg-card p-5" aria-labelledby="contacts-h">
        <h2 id="contacts-h" className="font-display text-base text-ink">Key contacts</h2>
        <ItemList
          items={keyContacts}
          setItems={props.canEdit ? setKeyContacts : undefined}
          renderRow={(c, onChange) => (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <input
                value={c.name}
                onChange={(e) => onChange({ ...c, name: e.target.value })}
                placeholder="Name"
                className="rounded border border-line-strong bg-card px-2 py-1.5 text-sm"
                disabled={!props.canEdit || busy}
              />
              <input
                value={c.role}
                onChange={(e) => onChange({ ...c, role: e.target.value })}
                placeholder="Role / organisation"
                className="rounded border border-line-strong bg-card px-2 py-1.5 text-sm"
                disabled={!props.canEdit || busy}
              />
              <input
                value={c.context}
                onChange={(e) => onChange({ ...c, context: e.target.value })}
                placeholder="Why they matter"
                className="rounded border border-line-strong bg-card px-2 py-1.5 text-sm"
                disabled={!props.canEdit || busy}
              />
            </div>
          )}
          newRow={() => ({ name: '', role: '', context: '' })}
          addLabel="+ Add contact"
          canEdit={props.canEdit}
        />
      </section>

      <section className="rounded-lg border border-line bg-card p-5" aria-labelledby="access-h">
        <h2 id="access-h" className="font-display text-base text-ink">System access revocation</h2>
        <ItemList
          items={accessRevocation}
          setItems={props.canEdit ? setAccessRevocation : undefined}
          renderRow={(a, onChange) => (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <input
                value={a.system}
                onChange={(e) => onChange({ ...a, system: e.target.value })}
                placeholder="System (email, CRM, GitHub)"
                className="sm:col-span-2 rounded border border-line-strong bg-card px-2 py-1.5 text-sm"
                disabled={!props.canEdit || busy}
              />
              <select
                value={a.status}
                onChange={(e) => onChange({ ...a, status: e.target.value as 'Pending' | 'Revoked' })}
                className="rounded border border-line-strong bg-card px-2 py-1.5 text-sm"
                disabled={!props.canEdit || busy}
              >
                <option value="Pending">Pending</option>
                <option value="Revoked">Revoked</option>
              </select>
            </div>
          )}
          newRow={() => ({ system: '', status: 'Pending' as const })}
          addLabel="+ Add system"
          canEdit={props.canEdit}
        />
      </section>

      <section className="rounded-lg border border-line bg-card p-5" aria-labelledby="assets-h">
        <h2 id="assets-h" className="font-display text-base text-ink">IT assets returned</h2>
        {props.itAssetOptions.length === 0 ? (
          <p className="mt-3 text-sm text-ink-3">
            No IT assets associated with this employee in the inventory.
          </p>
        ) : (
          <ul className="mt-3 space-y-1">
            {props.itAssetOptions.map((opt) => (
              <li key={opt.id}>
                <label className="flex items-center gap-2 rounded px-1 py-1 text-sm hover:bg-surface">
                  <input
                    type="checkbox"
                    checked={itAssetsReturned.has(opt.id)}
                    onChange={() =>
                      setItAssetsReturned((prev) => {
                        const next = new Set(prev)
                        if (next.has(opt.id)) next.delete(opt.id)
                        else next.add(opt.id)
                        return next
                      })
                    }
                    disabled={!props.canEdit || busy}
                    className="min-h-[20px] min-w-[20px]"
                  />
                  <span>{opt.label}</span>
                  {opt.currentlyAssigned && (
                    <span className="ml-auto rounded bg-warning-bg px-2 py-0.5 text-[10px] font-medium text-warning">
                      Still assigned in IT inventory
                    </span>
                  )}
                </label>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-ink-3">
          Ticking here is the handover record. To formally return an asset in the
          IT-assets inventory (so it becomes Available for the next hire), open the
          asset detail at /admin/it-assets and use the &apos;Return&apos; action there.
        </p>
      </section>

      <section className="rounded-lg border border-line bg-card p-5" aria-labelledby="kt-h">
        <h2 id="kt-h" className="font-display text-base text-ink">Knowledge transfer sessions</h2>
        <ItemList
          items={knowledgeTransfer}
          setItems={props.canEdit ? setKnowledgeTransfer : undefined}
          renderRow={(k, onChange) => (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <input
                value={k.withWhom}
                onChange={(e) => onChange({ ...k, withWhom: e.target.value })}
                placeholder="With whom"
                className="rounded border border-line-strong bg-card px-2 py-1.5 text-sm"
                disabled={!props.canEdit || busy}
              />
              <input
                type="date"
                value={k.completedAt}
                onChange={(e) => onChange({ ...k, completedAt: e.target.value })}
                className="rounded border border-line-strong bg-card px-2 py-1.5 text-sm"
                disabled={!props.canEdit || busy}
              />
              <input
                value={k.notes}
                onChange={(e) => onChange({ ...k, notes: e.target.value })}
                placeholder="Topic / outcome"
                className="rounded border border-line-strong bg-card px-2 py-1.5 text-sm"
                disabled={!props.canEdit || busy}
              />
            </div>
          )}
          newRow={() => ({ withWhom: '', completedAt: '', notes: '' })}
          addLabel="+ Add session"
          canEdit={props.canEdit}
        />
      </section>

      {props.canEdit && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={save}
            disabled={busy}
            className="inline-flex min-h-[44px] items-center rounded bg-navy px-4 py-2 text-sm font-medium text-white hover:bg-navy-dark disabled:opacity-50"
          >
            {busy ? 'Saving...' : 'Save handover'}
          </button>
          {status && <span className="text-xs text-success" role="status" aria-live="polite">{status}</span>}
          {error && <span className="text-xs text-danger">{error}</span>}
        </div>
      )}

      {props.canReview && props.initialHandover.document && !props.initialHandover.reviewedAt && (
        <section className="rounded-lg border border-line bg-card p-5" aria-labelledby="review-h">
          <h2 id="review-h" className="font-display text-base text-ink">HR review</h2>
          <textarea
            value={reviewNotes}
            onChange={(e) => setReviewNotes(e.target.value)}
            rows={3}
            placeholder="Review notes (optional)"
            disabled={busy}
            className="mt-2 w-full rounded border border-line-strong bg-card px-2 py-1.5 text-sm"
          />
          <button
            onClick={markReviewed}
            disabled={busy}
            className="mt-2 inline-flex min-h-[44px] items-center rounded bg-success px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            Mark reviewed
          </button>
        </section>
      )}
    </div>
  )
}

interface ItemListProps<T> {
  items: T[]
  setItems?: (items: T[]) => void
  renderRow: (item: T, onChange: (next: T) => void) => React.ReactNode
  newRow: () => T
  addLabel: string
  canEdit: boolean
}

function ItemList<T>(props: ItemListProps<T>) {
  return (
    <div className="mt-3 space-y-2">
      {props.items.length === 0 && (
        <p className="text-xs text-ink-3">None added yet.</p>
      )}
      {props.items.map((it, idx) => (
        <div key={idx} className="flex flex-wrap items-start gap-2">
          <div className="flex-1">
            {props.renderRow(it, (next) => {
              if (!props.setItems) return
              const list = [...props.items]
              list[idx] = next
              props.setItems(list)
            })}
          </div>
          {props.canEdit && (
            <button
              type="button"
              onClick={() => props.setItems?.(props.items.filter((_, i) => i !== idx))}
              className="inline-flex min-h-[36px] items-center rounded border border-danger px-2 py-1 text-xs text-danger hover:bg-danger-bg"
            >
              Remove
            </button>
          )}
        </div>
      ))}
      {props.canEdit && (
        <button
          type="button"
          onClick={() => props.setItems?.([...props.items, props.newRow()])}
          className="inline-flex min-h-[36px] items-center rounded border border-line-strong bg-card px-2 py-1 text-xs font-medium text-ink hover:bg-surface"
        >
          {props.addLabel}
        </button>
      )}
    </div>
  )
}

function extractFileId(storageRef: string): string {
  // storageRef shape: data/exit-handovers/{employeeId}/{fileId}.{ext}
  // Pull the bare basename minus extension for the URL param.
  const base = storageRef.split('/').pop() ?? ''
  const dot = base.lastIndexOf('.')
  return dot > 0 ? base.slice(0, dot) : base
}
