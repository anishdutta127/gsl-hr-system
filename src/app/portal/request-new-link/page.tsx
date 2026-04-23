import Link from 'next/link'
import { RequestLinkForm } from './RequestLinkForm'

export const dynamic = 'force-dynamic'

const REASON_COPY: Record<string, string> = {
  expired: 'Your previous link expired — here is a fresh one.',
  invalid: "That link isn't recognised. Let's send you a new one.",
  missing: 'No link found in that URL. Drop your email and we will send a fresh one.',
  notfound: 'We could not find that application. Try again with the email you used to apply.',
}

export default function RequestNewLinkPage({
  searchParams,
}: {
  searchParams: { reason?: string }
}) {
  const explain = searchParams.reason ? REASON_COPY[searchParams.reason] : null
  return (
    <div className="container-page py-12">
      <div className="mx-auto max-w-xl">
        <h1 className="font-display text-2xl text-ink">Send me a fresh link</h1>
        {explain && (
          <p className="mt-2 text-sm text-ink-2">{explain}</p>
        )}
        <RequestLinkForm />
        <p className="mt-6 text-xs text-ink-3">
          Not applied yet?{' '}
          <Link href="/careers" className="underline">
            See open roles →
          </Link>
        </p>
      </div>
    </div>
  )
}
