import type { Stage } from '@/lib/types'

/** Functional colour by stage cluster.
 * Pastels with WCAG AA contrast ratios > 4.5:1 against the body text colour. */
function classFor(stage: string): string {
  if (stage === 'Joined') return 'bg-success-bg text-ink border border-success'
  if (stage === 'Rejected') return 'bg-danger-bg text-danger border border-danger'
  if (stage === 'Withdrawn' || stage === 'NotInterested')
    return 'bg-surface text-ink-2 border border-line-strong'
  if (stage === 'OnHold') return 'bg-warning-bg text-ink border border-warning'
  if (stage === 'Sourced') return 'bg-navy-light text-navy-dark border border-navy/30'
  if (stage === 'Shortlisted')
    return 'bg-teal-light text-teal-dark border border-teal/30'
  if (stage.startsWith('Assessment'))
    return 'bg-warning-bg text-ink border border-warning'
  if (stage.startsWith('Video')) return 'bg-warning-bg text-ink border border-warning'
  if (stage.includes('Round')) return 'bg-teal-light text-teal-dark border border-teal/30'
  if (stage === 'Offered' || stage === 'OfferAccepted')
    return 'bg-success-bg text-ink border border-success'
  if (stage === 'DocsCollected') return 'bg-success-bg text-ink border border-success'
  return 'bg-surface text-ink-2 border border-line-strong'
}

export function StagePill({
  stage,
  size = 'sm',
}: {
  stage: Stage
  size?: 'sm' | 'xs'
}) {
  const padding = size === 'xs' ? 'px-1.5 py-0.5 text-[11px]' : 'px-2 py-0.5 text-xs'
  return (
    <span
      className={`inline-flex items-center rounded font-medium ${padding} ${classFor(stage as string)}`}
    >
      {String(stage)}
    </span>
  )
}
