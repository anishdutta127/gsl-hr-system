import { Metadata } from 'next'
import { LoginForm } from './LoginForm'

export const metadata: Metadata = {
  title: 'Sign in · GSL HR System',
}

export default function LoginPage({
  searchParams,
}: {
  searchParams: { next?: string; error?: string }
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-4 py-8">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="font-display text-2xl text-navy">GSL HR System</h1>
          <p className="mt-1 text-sm text-ink-2">Sign in to continue.</p>
        </div>
        <LoginForm next={searchParams.next} initialError={searchParams.error} />
      </div>
    </main>
  )
}
