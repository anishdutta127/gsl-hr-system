/*
 * Locale and format helpers - British English, Indian context.
 *
 * Money: Indian comma placement (Rs 1,50,000); compact form (Rs 1.50 L, Rs 7.05 Cr).
 * Dates: DD-MMM-YYYY (15-Apr-2026), never ambiguous MM/DD/YYYY.
 * Relative: "3 days ago", "in 18 days" via date-fns.
 */

import { format, formatDistanceToNowStrict, parseISO } from 'date-fns'

const INDIAN_LOCALE = 'en-IN'

export interface MoneyOptions {
  decimals?: number
  compact?: boolean
  bare?: boolean
}

export function formatRs(amount: number | null | undefined, opts: MoneyOptions = {}): string {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) {
    return opts.bare ? '-' : 'Rs -'
  }
  if (opts.compact) return formatCompactRs(amount, opts.bare ?? false)
  const decimals = opts.decimals ?? 0
  const formatted = amount.toLocaleString(INDIAN_LOCALE, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
  return opts.bare ? formatted : `Rs ${formatted}`
}

function formatCompactRs(amount: number, bare: boolean): string {
  const abs = Math.abs(amount)
  const prefix = bare ? '' : 'Rs '
  if (abs >= 1e7) return `${prefix}${(amount / 1e7).toFixed(2)} Cr`
  if (abs >= 1e5) return `${prefix}${(amount / 1e5).toFixed(2)} L`
  if (abs >= 1e3) return `${prefix}${(amount / 1e3).toFixed(1)}K`
  return formatRs(amount, { bare })
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '-'
  try {
    return format(parseISO(iso), 'dd-MMM-yyyy')
  } catch {
    return iso
  }
}

/** Long-form English date for letters: "1st April 2024". Empty -> ''. */
export function formatLongDate(iso: string | null | undefined): string {
  if (!iso) return ''
  try {
    return format(parseISO(iso), 'do MMMM yyyy')
  } catch {
    return iso
  }
}

export function formatRelative(
  iso: string | null | undefined,
  opts: { addSuffix?: boolean } = {},
): string {
  if (!iso) return '-'
  try {
    return formatDistanceToNowStrict(parseISO(iso), { addSuffix: opts.addSuffix ?? true })
  } catch {
    return iso
  }
}

export function formatCount(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '-'
  return n.toLocaleString(INDIAN_LOCALE)
}

/** Days in stage as "3d" / "12d" for Kanban card display. */
export function formatDaysInStage(enteredAt: string | null | undefined): string {
  if (!enteredAt) return '-'
  try {
    const days = Math.floor((Date.now() - parseISO(enteredAt).getTime()) / 86_400_000)
    return `${days}d`
  } catch {
    return '-'
  }
}
