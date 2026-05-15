'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Share2, Sparkles, User } from 'lucide-react'

interface RecentEntry {
  id: string
  name: string
  monthLabel: string
  photoUrl: string | null
}

interface Props {
  id: string
  employeeName: string
  employeeDesignation: string
  department: string
  category: string
  monthLabel: string
  writeup: string
  photoUrl: string | null
  voucherAmount: number
  voucherProvider: string
  voucherDelivered: boolean
  companyName: string
  parentGroupName: string
  recent: RecentEntry[]
  stats: {
    totalThisYear: number
    uniqueEmployees: number
    uniqueDepartments: number
  }
}

export function CelebrationView(props: Props) {
  const initial = props.employeeName.trim().charAt(0).toUpperCase() || '?'
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [shareStatus, setShareStatus] = useState<string | null>(null)

  useEffect(() => {
    // Track a view (deduplicated server-side within a 1h window).
    void fetch(`/api/public/recognition/${encodeURIComponent(props.id)}/track`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'view' }),
    }).catch(() => {})
  }, [props.id])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReducedMotion) return

    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    function resize() {
      canvas!.width = window.innerWidth * dpr
      canvas!.height = window.innerHeight * dpr
    }
    resize()
    window.addEventListener('resize', resize)

    const COLOURS = ['#073393', '#2DBFBC', '#F39C50', '#F6E5C9', '#FFD56B']
    interface Particle {
      x: number
      y: number
      vx: number
      vy: number
      size: number
      colour: string
      rotation: number
      vr: number
      life: number
    }
    const particles: Particle[] = []
    const PARTICLE_COUNT = 120
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      particles.push({
        x: canvas.width / 2 + (Math.random() - 0.5) * canvas.width * 0.3,
        y: -20 - Math.random() * 80,
        vx: (Math.random() - 0.5) * 6,
        vy: 2 + Math.random() * 5,
        size: 4 + Math.random() * 6,
        colour: COLOURS[Math.floor(Math.random() * COLOURS.length)]!,
        rotation: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 0.2,
        life: 0,
      })
    }
    const DURATION_MS = 4500
    let start: number | null = null
    let raf = 0
    function frame(t: number) {
      if (start === null) start = t
      const elapsed = t - start
      ctx!.clearRect(0, 0, canvas!.width, canvas!.height)
      for (const p of particles) {
        p.x += p.vx * dpr
        p.y += p.vy * dpr
        p.vy += 0.08 * dpr
        p.rotation += p.vr
        p.life = elapsed
        ctx!.save()
        ctx!.translate(p.x, p.y)
        ctx!.rotate(p.rotation)
        ctx!.fillStyle = p.colour
        ctx!.globalAlpha = Math.max(0, 1 - elapsed / DURATION_MS)
        ctx!.fillRect(-p.size * dpr / 2, -p.size * dpr / 2, p.size * dpr, p.size * dpr)
        ctx!.restore()
      }
      if (elapsed < DURATION_MS) raf = requestAnimationFrame(frame)
      else {
        ctx!.clearRect(0, 0, canvas!.width, canvas!.height)
      }
    }
    raf = requestAnimationFrame(frame)
    return () => {
      window.removeEventListener('resize', resize)
      cancelAnimationFrame(raf)
    }
  }, [])

  async function share() {
    const url = typeof window !== 'undefined' ? window.location.href : `/celebrate/${props.id}`
    const title = `Celebrating ${props.employeeName} - Recognition by ${props.companyName}`
    // Increment share counter (fire-and-forget).
    void fetch(`/api/public/recognition/${encodeURIComponent(props.id)}/track`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'share' }),
    }).catch(() => {})

    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      try {
        await (navigator as Navigator & { share: (data: ShareData) => Promise<void> }).share({
          title,
          text: title,
          url,
        })
        setShareStatus('Shared.')
        return
      } catch {
        // user cancelled or share unsupported
      }
    }
    try {
      await navigator.clipboard.writeText(url)
      setShareStatus('URL copied to clipboard. Paste it anywhere to share.')
    } catch {
      setShareStatus(`Copy this URL: ${url}`)
    }
  }

  return (
    <div className="min-h-screen bg-surface text-ink">
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0 motion-reduce:hidden"
        style={{ width: '100vw', height: '100vh' }}
      />

      <header className="relative z-10 mx-auto flex max-w-5xl items-center justify-between px-4 py-4 text-xs uppercase tracking-wider text-ink-2">
        <span className="font-semibold">{props.parentGroupName}</span>
        <span className="font-display text-navy">{props.companyName}</span>
      </header>

      {/* Above the fold: focal recognition card */}
      <main className="relative z-10 mx-auto max-w-3xl px-4 pb-12 pt-6 sm:pt-10">
        <section
          aria-labelledby="celebration-h"
          className="celebrate-card animate-card-enter rounded-2xl border border-line bg-card p-6 shadow-lg sm:p-10"
        >
          <div className="flex flex-col items-center text-center">
            <div className="celebrate-photo animate-photo-enter h-28 w-28 overflow-hidden rounded-full border-4 border-teal bg-surface shadow-md sm:h-36 sm:w-36">
              {props.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={props.photoUrl}
                  alt={`${props.employeeName} celebrated`}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center font-display text-5xl font-bold text-teal">
                  {props.employeeName.trim().charAt(0).toUpperCase() || (
                    <User aria-hidden="true" className="h-12 w-12" />
                  )}
                </div>
              )}
            </div>

            <p className="mt-4 inline-flex items-center gap-1 rounded-full bg-teal-light px-3 py-1 text-xs font-semibold uppercase tracking-wider text-teal-dark">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              {props.category}
            </p>

            <h1
              id="celebration-h"
              className="mt-3 font-display text-3xl font-bold text-navy sm:text-5xl"
              style={{ fontFamily: 'var(--font-serif)' }}
            >
              {props.employeeName}
            </h1>
            {props.employeeDesignation && (
              <p className="mt-1 text-sm text-ink-2 sm:text-base">{props.employeeDesignation}</p>
            )}
            <p className="mt-1 text-sm text-ink-3">
              {props.department} · {props.monthLabel}
            </p>

            <p
              className="mt-6 max-w-prose whitespace-pre-wrap text-base leading-relaxed text-ink sm:text-lg"
              style={{ fontFamily: 'var(--font-serif)' }}
            >
              {props.writeup}
            </p>

            {props.voucherDelivered && (
              <p className="mt-6 inline-block rounded-full bg-orange-light px-4 py-2 text-sm font-medium text-orange-dark">
                Rs {props.voucherAmount} {props.voucherProvider} voucher has been delivered to{' '}
                {props.employeeName.split(' ')[0]}&apos;s registered email.
              </p>
            )}

            <button
              onClick={share}
              className="mt-6 inline-flex min-h-[44px] items-center gap-2 rounded-full bg-navy px-5 py-2.5 text-sm font-medium text-white shadow hover:bg-navy-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
            >
              <Share2 className="h-4 w-4" aria-hidden="true" />
              Share this celebration
            </button>
            {shareStatus && (
              <p className="mt-2 text-xs text-ink-2" role="status" aria-live="polite">
                {shareStatus}
              </p>
            )}
          </div>
        </section>

        {/* Stats panel */}
        <section
          aria-labelledby="stats-h"
          className="mt-10 rounded-xl border border-line bg-card p-6 text-center"
        >
          <h2 id="stats-h" className="sr-only">
            Celebration stats
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Stat value={props.stats.totalThisYear} label="celebrations this year" />
            <Stat value={props.stats.uniqueEmployees} label="employees recognised" />
            <Stat value={props.stats.uniqueDepartments} label="departments represented" />
          </div>
        </section>

        {/* Recent celebrations leaderboard */}
        {props.recent.length > 0 && (
          <section aria-labelledby="recent-h" className="mt-10">
            <h2 id="recent-h" className="mb-3 text-center font-display text-lg text-ink">
              Recent celebrations
            </h2>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {props.recent.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/celebrate/${r.id}`}
                    className="block rounded-lg border border-line bg-card p-4 text-center transition hover:border-teal hover:shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
                  >
                    <div className="mx-auto h-14 w-14 overflow-hidden rounded-full border border-line bg-surface">
                      {r.photoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={r.photoUrl}
                          alt={`${r.name} celebrated`}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center font-display text-lg text-teal">
                          {r.name.trim().charAt(0).toUpperCase() || '?'}
                        </div>
                      )}
                    </div>
                    <p className="mt-2 truncate text-sm font-medium text-ink">{r.name}</p>
                    <p className="text-xs text-ink-3">{r.monthLabel}</p>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <footer className="mt-12 text-center text-xs text-ink-3">
          {props.companyName} · {props.parentGroupName}
        </footer>
      </main>

      <style jsx>{`
        .celebrate-card {
          background-image: radial-gradient(circle at top right, rgba(45, 191, 188, 0.06), transparent 60%);
        }
        .animate-card-enter {
          animation: card-enter 600ms ease-out both;
        }
        .animate-photo-enter {
          animation: photo-bounce 700ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
          animation-delay: 200ms;
        }
        @keyframes card-enter {
          0% {
            opacity: 0;
            transform: translateY(8px) scale(0.985);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        @keyframes photo-bounce {
          0% {
            opacity: 0;
            transform: scale(0.6);
          }
          70% {
            opacity: 1;
            transform: scale(1.05);
          }
          100% {
            opacity: 1;
            transform: scale(1);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .animate-card-enter,
          .animate-photo-enter {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  )
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <CountUp value={value} />
      <p className="mt-1 text-xs uppercase tracking-wider text-ink-3">{label}</p>
    </div>
  )
}

function CountUp({ value }: { value: number }) {
  const [display, setDisplay] = useState(0)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReducedMotion || value <= 0) {
      setDisplay(value)
      return
    }
    const node = ref.current
    if (!node) return
    let raf = 0
    let started = false
    const obs = new IntersectionObserver(
      (entries) => {
        if (started) return
        for (const e of entries) {
          if (e.isIntersecting) {
            started = true
            const startTs = performance.now()
            const DURATION = 1500
            function step(t: number) {
              const elapsed = t - startTs
              const ratio = Math.min(elapsed / DURATION, 1)
              setDisplay(Math.round(value * easeOutCubic(ratio)))
              if (ratio < 1) raf = requestAnimationFrame(step)
            }
            raf = requestAnimationFrame(step)
            obs.disconnect()
          }
        }
      },
      { threshold: 0.4 },
    )
    obs.observe(node)
    return () => {
      obs.disconnect()
      cancelAnimationFrame(raf)
    }
  }, [value])

  return (
    <div ref={ref} className="font-display text-4xl font-bold tabular text-navy">
      {display}
    </div>
  )
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}
