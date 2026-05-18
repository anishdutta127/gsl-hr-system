/*
 * Pure helpers for the bulk-action stage transition + reopen toasts.
 *
 * Lifted out of useStageTransitions so the summary logic is unit-testable
 * without mounting React. The hook composes the visible message string from
 * these primitives.
 */

interface FailureDetail {
  message?: string
}

/**
 * Compact "<top-reason> (and N other reasons)" summary used in the toast
 * tail. Sorts unique failure messages by frequency, leads with the top
 * one, mentions the residual count when more than one reason landed in
 * the batch.
 *
 * Empty / whitespace-only messages are dropped so we don't leak a
 * blank "0 of 4 failed:" with no explanation - that was the exact
 * UX collapse Shruti hit when bulk forward silent-skipped Gate-3
 * candidates.
 */
export function summariseFailures(failures: readonly FailureDetail[]): string {
  if (failures.length === 0) return ''
  const counts = new Map<string, number>()
  for (const f of failures) {
    const m = (f.message ?? '').trim()
    if (!m) continue
    counts.set(m, (counts.get(m) ?? 0) + 1)
  }
  if (counts.size === 0) return ''
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1])
  const first = sorted[0]
  if (!first) return ''
  const [topMsg, topN] = first
  const accountedFor = topN
  const totalWithMessages = [...counts.values()].reduce((a, b) => a + b, 0)
  const residual = totalWithMessages - accountedFor
  if (residual <= 0) return topMsg
  return `${topMsg} (and ${residual} other reason${residual === 1 ? '' : 's'})`
}

/**
 * Compose the toast head + tail for a bulk transition response.
 *
 * Head examples:
 *   "Moved forward 3 of 4 candidates."
 *   "Moved forward 0 of 2 candidates."
 *
 * Tail examples:
 *   " 1 failed: Hiring manager feedback required."
 *   " 2 failed: Hiring manager feedback required (and 1 other reason)."
 *   "" (when nothing failed)
 */
export function composeBulkToastMessage(args: {
  successLabel: string
  applied: number
  skipped: number
  errors: number
  failures: readonly FailureDetail[]
}): string {
  const failedCount = args.skipped + args.errors
  const total = args.applied + failedCount
  const head = `${args.successLabel} ${args.applied} of ${total} candidate${total === 1 ? '' : 's'}.`
  if (failedCount === 0) return head
  const summary = summariseFailures(args.failures)
  return summary ? `${head} ${failedCount} failed: ${summary}` : `${head} ${failedCount} failed.`
}
