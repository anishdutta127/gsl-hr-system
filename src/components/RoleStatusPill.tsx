import type { Role } from '@/lib/types'

const STYLES: Record<Role['status'], string> = {
  Draft: 'bg-surface text-ink-2 border border-line-strong',
  Open: 'bg-success-bg text-ink border border-success',
  Paused: 'bg-warning-bg text-ink border border-warning',
  Closed: 'bg-ink/5 text-ink-2 border border-line-strong',
  Archived: 'bg-line text-ink-3 border border-line-strong',
}

export function RoleStatusPill({ status }: { status: Role['status'] }) {
  return (
    <span
      className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${STYLES[status]}`}
    >
      {status}
    </span>
  )
}
