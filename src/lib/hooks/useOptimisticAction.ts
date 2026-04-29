'use client'

/*
 * Shared optimistic-action hook.
 *
 * Wraps any queue-backed action with: immediate visual flip, busy guard while
 * the request is in flight, automatic revert on failure, error capture. Each
 * surface keeps its own toast UI - the hook handles state, not presentation.
 *
 * Why: queue writes hop through GitHub Contents API (500ms-2s). Without
 * optimism, every Pause/Close/Resume click feels stuck. Shruti reported this
 * verbatim in Phase 3 round 2 feedback.
 */

import { useState } from 'react'

export interface OptimisticActionRunOptions<T, R> {
  /** Value to flip the visible state to immediately on click. */
  optimistic: T
  /** Async work (typically a fetch). Throw or return rejected to trigger revert. */
  perform: () => Promise<R>
  /** Called after a successful perform; receives the resolved result. */
  onSuccess?: (result: R) => void
  /** Called after revert; receives the human-readable failure message. */
  onError?: (message: string) => void
}

export interface OptimisticActionApi<T> {
  /** The value to display - optimistic during in-flight, real otherwise. */
  current: T
  /** True while a request is in flight; bind to button `disabled`. */
  busy: boolean
  /** Latest error; cleared at the start of each run. */
  error: string | null
  /** Run an action. Resolves with `{ ok: true }` on success, `{ ok: false, message }` on revert. */
  run: <R>(opts: OptimisticActionRunOptions<T, R>) => Promise<{ ok: true; result: R } | { ok: false; message: string }>
  /** Force the visible value (e.g., when the server returns a value different from the optimistic guess). */
  reset: (value: T) => void
  /** Manually clear the error state. */
  clearError: () => void
}

export function useOptimisticAction<T>(initial: T): OptimisticActionApi<T> {
  const [current, setCurrent] = useState<T>(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run<R>(
    opts: OptimisticActionRunOptions<T, R>,
  ): Promise<{ ok: true; result: R } | { ok: false; message: string }> {
    if (busy) return { ok: false, message: 'Already in flight.' }
    const previous = current
    setError(null)
    setBusy(true)
    setCurrent(opts.optimistic)
    try {
      const result = await opts.perform()
      opts.onSuccess?.(result)
      return { ok: true, result }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'We could not complete that action.'
      setCurrent(previous)
      setError(msg)
      opts.onError?.(msg)
      return { ok: false, message: msg }
    } finally {
      setBusy(false)
    }
  }

  return {
    current,
    busy,
    error,
    run,
    reset: setCurrent,
    clearError: () => setError(null),
  }
}
