import { redirect } from 'next/navigation'
import { getCurrentSession } from '@/lib/identity'
import { PasswordChangeForm } from './PasswordChangeForm'

export const dynamic = 'force-dynamic'

export default async function AccountPage() {
  const session = await getCurrentSession()
  if (!session) redirect('/login')

  return (
    <div className="container-page py-8">
      <div className="mb-6">
        <h1 className="font-display text-2xl text-ink">Your account</h1>
        <p className="mt-1 text-sm text-ink-2">
          Signed in as <span className="font-medium text-ink">{session.name}</span> ({session.email})
          · Role: {session.role}
        </p>
      </div>

      <section className="max-w-md rounded-lg border border-line bg-card p-5">
        <h2 className="font-display text-lg text-ink">Change password</h2>
        <p className="mt-1 text-xs text-ink-2">
          Pick something you'll remember. 6 characters minimum.
        </p>
        <PasswordChangeForm />
      </section>
    </div>
  )
}
