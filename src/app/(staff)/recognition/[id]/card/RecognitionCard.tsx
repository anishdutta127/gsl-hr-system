'use client'

import { Sparkles, User, Printer } from 'lucide-react'
import type { RecognitionStatus } from '@/lib/types'

interface Props {
  id: string
  employeeName: string
  employeeDesignation: string
  department: string
  category: string
  monthLabel: string
  writeup: string
  status: RecognitionStatus
  companyName: string
  parentGroupName: string
}

/**
 * Brand-aligned recognition card. Built off the Canva template at
 * reference-uploads/rewards-recognition-template.jpg: co-branded header
 * (parent group + GSL), navy card with a teal under-frame, orange triangle
 * slashes, teal-on-white avatar with initials, write-up text in white.
 *
 * Print rules live in the page styles below: nav/sidebar hidden, card
 * expands to fit the A4 area. Triggered by the Print button (top-right)
 * which calls window.print().
 *
 * Mobile (375px): the card collapses to full width; the under-frame offset
 * shrinks so it stays visible on a small screen.
 */
export function RecognitionCard(props: Props) {
  const initial = (props.employeeName.trim()[0] ?? '').toUpperCase()

  return (
    <div className="recognition-card-page bg-surface px-4 py-8 print:bg-white">
      <div className="mx-auto max-w-2xl">
        {/* Top toolbar - hidden on print */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-2 print:hidden">
          <p className="text-xs text-ink-3">
            Recognition card - {props.id} - {props.status}
          </p>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded border border-line-strong bg-card px-3 py-2 text-sm font-medium text-ink hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
          >
            <Printer className="h-4 w-4" aria-hidden="true" />
            Print
          </button>
        </div>

        {/* Co-branded header strip */}
        <div className="rounded-t-lg border border-line bg-card px-5 py-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-semibold uppercase tracking-wide text-ink-2">
              {props.parentGroupName}
            </span>
            <span className="font-display text-sm font-bold text-navy">
              {props.companyName}
            </span>
          </div>
        </div>

        {/* The card itself: navy block with teal offset under-frame */}
        <div className="relative mt-2">
          {/* teal under-frame */}
          <div
            aria-hidden="true"
            className="absolute inset-0 translate-x-1.5 translate-y-1.5 rounded-lg bg-teal sm:translate-x-2 sm:translate-y-2 print:translate-x-1 print:translate-y-1"
          />
          {/* main navy card */}
          <div
            className="relative rounded-lg bg-navy p-6 text-white sm:p-8"
            style={{
              backgroundImage:
                'linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)',
              backgroundSize: '24px 24px',
            }}
          >
            {/* Orange triangle slashes top-left */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-3 flex gap-1"
            >
              <span
                className="block h-0 w-0"
                style={{
                  borderLeft: '8px solid transparent',
                  borderBottom: '14px solid #F39C50',
                }}
              />
              <span
                className="block h-0 w-0"
                style={{
                  borderLeft: '8px solid transparent',
                  borderBottom: '14px solid #F39C50',
                  opacity: 0.7,
                }}
              />
              <span
                className="block h-0 w-0"
                style={{
                  borderLeft: '8px solid transparent',
                  borderBottom: '14px solid #F39C50',
                  opacity: 0.4,
                }}
              />
            </div>

            {/* Sparkle icon top-right */}
            <div className="pointer-events-none absolute right-4 top-4 text-teal">
              <Sparkles className="h-8 w-8 opacity-80" aria-hidden="true" />
            </div>

            {/* Avatar + name block */}
            <div className="mt-6 flex items-center gap-4 sm:gap-5">
              <div
                className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-white text-2xl font-bold text-teal shadow"
                aria-hidden="true"
              >
                {initial ? (
                  <span>{initial}</span>
                ) : (
                  <User className="h-7 w-7 text-teal" aria-hidden="true" />
                )}
              </div>
              <div className="min-w-0">
                <h1 className="font-display text-2xl font-bold leading-tight text-white sm:text-3xl">
                  {props.employeeName}
                </h1>
                {props.employeeDesignation && (
                  <p className="mt-0.5 text-sm text-teal-light/90">
                    {props.employeeDesignation}
                  </p>
                )}
                <p className="mt-1 text-sm text-teal-light/90">
                  {props.department} - {props.category} - {props.monthLabel}
                </p>
              </div>
            </div>

            {/* Write-up */}
            <p className="mt-6 whitespace-pre-wrap text-base leading-relaxed text-white sm:text-lg">
              {props.writeup}
            </p>
          </div>
        </div>

        {/* "Rewards & Recognition" headline with orange accent lines */}
        <div className="mt-8 flex items-center justify-center gap-3 px-2">
          <span
            aria-hidden="true"
            className="h-px flex-1"
            style={{ backgroundColor: '#F39C50' }}
          />
          <h2 className="font-display text-xl font-bold text-navy sm:text-2xl">
            Rewards &amp; Recognition
          </h2>
          <span
            aria-hidden="true"
            className="h-px flex-1"
            style={{ backgroundColor: '#F39C50' }}
          />
        </div>

        {/* Footer */}
        <p className="mt-3 text-center text-xs text-ink-2">
          {props.companyName} | {props.parentGroupName}
        </p>
      </div>

      <style jsx>{`
        @media print {
          :global(nav),
          :global(aside),
          :global(header[role='banner']),
          :global(.no-print) {
            display: none !important;
          }
          .recognition-card-page {
            min-height: 0;
            padding: 0;
          }
          :global(body) {
            background: white !important;
          }
        }
      `}</style>
    </div>
  )
}
