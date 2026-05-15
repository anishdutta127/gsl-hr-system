'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Image as ImageIcon, Gift, Globe, Copy } from 'lucide-react'
import type { Recognition } from '@/lib/types'

interface Props {
  recognition: Recognition
  employeeName: string
  companyName: string
  parentGroupName: string
  actorEmail: string
}

export function RecognitionAdminControls(props: Props) {
  const { recognition: rec } = props

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <PhotoCard rec={rec} employeeName={props.employeeName} />
      <VoucherCard rec={rec} />
      <PublicShareCard rec={rec} />
    </div>
  )
}

function PhotoCard({ rec, employeeName }: { rec: Recognition; employeeName: string }) {
  const router = useRouter()
  const fileInput = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)

  async function handleFile(file: File) {
    setError(null)
    setStatus(null)
    if (file.size > 5 * 1024 * 1024) {
      setError('File too large. Max 5 MB.')
      return
    }
    try {
      const cropped = await cropToSquareJpeg(file, 800)
      const localUrl = URL.createObjectURL(cropped)
      setPreview(localUrl)

      setBusy(true)
      const fd = new FormData()
      fd.append('file', cropped, `${rec.id}.jpg`)
      const res = await fetch(`/api/admin/recognition/${encodeURIComponent(rec.id)}/photo`, {
        method: 'POST',
        body: fd,
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string }
        throw new Error(data.message ?? `Upload failed: ${res.status}`)
      }
      setStatus(`Photo of ${employeeName} uploaded. Reflects once Vercel rebuilds (~2 minutes).`)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-lg border border-line bg-card p-5" aria-labelledby="photo-h">
      <h2 id="photo-h" className="font-display text-base text-ink">
        <ImageIcon className="mr-1 inline h-4 w-4" aria-hidden="true" />
        Employee photo
      </h2>
      <p className="mt-1 text-xs text-ink-2">
        Square crop, applied client-side. Replaces the initials placeholder on the public
        celebration page. Recommended: 800x800 minimum, max 5 MB.
      </p>
      <div className="mt-3 flex items-center gap-4">
        <div className="h-24 w-24 overflow-hidden rounded-full border border-line bg-surface">
          {preview || rec.employeePhoto?.storageRef ? (
            // Local preview wins; falls back to server-stored photo.
            <img
              src={preview ?? rec.employeePhoto?.storageRef ?? ''}
              alt={`${employeeName} - recognition photo`}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-2xl font-bold text-teal">
              {employeeName.charAt(0).toUpperCase()}
            </div>
          )}
        </div>
        <div className="flex-1">
          <input
            ref={fileInput}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void handleFile(f)
              e.target.value = ''
            }}
            className="hidden"
            aria-label="Upload employee photo"
          />
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={busy}
            className="inline-flex min-h-[44px] items-center rounded border border-line-strong bg-card px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface disabled:opacity-50"
          >
            {busy ? 'Uploading...' : rec.employeePhoto?.storageRef ? 'Replace photo' : 'Upload photo'}
          </button>
          {rec.employeePhoto?.uploadedAt && (
            <p className="mt-1 text-xs text-ink-3">
              Uploaded {rec.employeePhoto.uploadedAt.slice(0, 10)} by {rec.employeePhoto.uploadedBy}
            </p>
          )}
          {error && <p className="mt-1 text-xs text-danger">{error}</p>}
          {status && (
            <p className="mt-1 text-xs text-success" role="status" aria-live="polite">
              {status}
            </p>
          )}
        </div>
      </div>
    </section>
  )
}

function VoucherCard({ rec }: { rec: Recognition }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [amount, setAmount] = useState<string>(String(rec.voucher?.amount ?? 500))
  const [provider, setProvider] = useState(rec.voucher?.provider ?? 'Amazon')

  async function confirmDelivery() {
    setBusy(true)
    setError(null)
    setStatus(null)
    try {
      const res = await fetch(`/api/admin/recognition/${encodeURIComponent(rec.id)}/voucher`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: Number(amount),
          provider,
          confirmDelivered: true,
        }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string }
        throw new Error(data.message ?? `Voucher save failed: ${res.status}`)
      }
      setStatus('Voucher delivery recorded.')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Voucher save failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-lg border border-line bg-card p-5" aria-labelledby="voucher-h">
      <h2 id="voucher-h" className="font-display text-base text-ink">
        <Gift className="mr-1 inline h-4 w-4" aria-hidden="true" />
        Voucher
      </h2>
      <p className="mt-1 text-xs text-ink-2">
        Confirm the voucher has been delivered to the recipient&apos;s registered email.
        Default Rs 500 Amazon voucher per HR policy.
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <label className="text-xs">
          Amount (Rs)
          <input
            type="number"
            min={0}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={busy}
            className="mt-1 w-full rounded border border-line-strong bg-card px-2 py-1.5 text-sm"
          />
        </label>
        <label className="text-xs">
          Provider
          <input
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            disabled={busy}
            className="mt-1 w-full rounded border border-line-strong bg-card px-2 py-1.5 text-sm"
          />
        </label>
      </div>
      {rec.voucher?.deliveredAt ? (
        <p className="mt-3 rounded bg-success-bg px-2 py-1 text-xs text-success">
          Delivered {rec.voucher.deliveredAt.slice(0, 10)} by {rec.voucher.deliveryConfirmedBy}.
        </p>
      ) : (
        <button
          onClick={confirmDelivery}
          disabled={busy}
          className="mt-3 inline-flex min-h-[44px] items-center rounded bg-success px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {busy ? 'Saving...' : 'Confirm voucher delivered'}
        </button>
      )}
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
      {status && (
        <p className="mt-2 text-xs text-success" role="status" aria-live="polite">
          {status}
        </p>
      )}
    </section>
  )
}

function PublicShareCard({ rec }: { rec: Recognition }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const publicUrl = typeof window !== 'undefined' ? `${window.location.origin}/celebrate/${rec.id}` : `/celebrate/${rec.id}`

  async function togglePublic(enabled: boolean) {
    setBusy(true)
    setError(null)
    setStatus(null)
    try {
      const res = await fetch(
        `/api/admin/recognition/${encodeURIComponent(rec.id)}/share-toggle`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled }),
        },
      )
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string }
        throw new Error(data.message ?? `Toggle failed: ${res.status}`)
      }
      setStatus(enabled ? 'Public celebration page enabled.' : 'Public celebration page disabled.')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Toggle failed.')
    } finally {
      setBusy(false)
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(publicUrl)
      setStatus('Public URL copied to clipboard.')
    } catch {
      setError('Could not copy. Select and copy manually.')
    }
  }

  const isPublic = rec.publicShareEnabled === true
  const requirements = []
  if (!rec.employeePhoto) requirements.push('upload an employee photo')
  if (!rec.voucher?.deliveredAt) requirements.push('confirm voucher delivery')
  if (rec.status !== 'Published') requirements.push('publish the recognition')

  return (
    <section className="rounded-lg border border-line bg-card p-5 lg:col-span-2" aria-labelledby="public-h">
      <h2 id="public-h" className="font-display text-base text-ink">
        <Globe className="mr-1 inline h-4 w-4" aria-hidden="true" />
        Public celebration page
      </h2>
      <p className="mt-1 text-xs text-ink-2">
        When enabled, anyone with the URL can view a celebration page showing the
        write-up, photo, and confetti. Share it via WhatsApp group, email, or post-it.
      </p>

      {requirements.length > 0 && (
        <ul className="mt-3 list-inside list-disc rounded border border-warning bg-warning-bg p-3 text-xs text-ink">
          <strong className="font-semibold">Recommended before going public:</strong>
          {requirements.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {isPublic ? (
          <button
            onClick={() => togglePublic(false)}
            disabled={busy}
            className="inline-flex min-h-[44px] items-center rounded border border-line-strong bg-card px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface disabled:opacity-50"
          >
            Make private
          </button>
        ) : (
          <button
            onClick={() => togglePublic(true)}
            disabled={busy}
            className="inline-flex min-h-[44px] items-center rounded bg-navy px-3 py-1.5 text-sm font-medium text-white hover:bg-navy-dark disabled:opacity-50"
          >
            Make public
          </button>
        )}
        {isPublic && (
          <>
            <a
              href={`/celebrate/${rec.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-[44px] items-center rounded border border-line-strong bg-card px-3 py-1.5 text-sm font-medium text-navy hover:bg-surface"
            >
              View public page
            </a>
            <button
              onClick={copy}
              className="inline-flex min-h-[44px] items-center gap-1 rounded border border-line-strong bg-card px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface"
            >
              <Copy className="h-4 w-4" aria-hidden="true" />
              Copy URL
            </button>
            <code className="rounded bg-surface px-2 py-1 text-xs tabular text-ink-2">
              {publicUrl}
            </code>
          </>
        )}
      </div>

      <p className="mt-3 text-xs text-ink-3">
        Views: {rec.viewCount ?? 0} · Shares: {rec.shareCount ?? 0}
      </p>

      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
      {status && (
        <p className="mt-2 text-xs text-success" role="status" aria-live="polite">
          {status}
        </p>
      )}
    </section>
  )
}

async function cropToSquareJpeg(file: File, maxDim: number): Promise<File> {
  // Load the image, center-crop to a square, resize to maxDim, return JPEG.
  // Plain canvas - no third-party dep.
  const bitmap = await loadImage(file)
  const side = Math.min(bitmap.width, bitmap.height)
  const dim = Math.min(side, maxDim)
  const offsetX = (bitmap.width - side) / 2
  const offsetY = (bitmap.height - side) / 2

  const canvas = document.createElement('canvas')
  canvas.width = dim
  canvas.height = dim
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas context unavailable.')
  ctx.drawImage(bitmap, offsetX, offsetY, side, side, 0, 0, dim, dim)
  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('toBlob returned null'))),
      'image/jpeg',
      0.9,
    )
  })
  return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' })
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Image could not be loaded.'))
    }
    img.src = url
  })
}
