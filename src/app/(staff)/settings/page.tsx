import { redirect } from 'next/navigation'
import { getCurrentSession } from '@/lib/identity'
import { loadCompany } from '@/lib/company'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const session = await getCurrentSession()
  if (!session) redirect('/login')
  if (session.role !== 'Admin') redirect('/')

  const company = loadCompany()

  return (
    <div className="container-page py-8">
      <div className="mb-6">
        <h1 className="font-display text-2xl text-ink">Settings</h1>
        <p className="mt-1 text-sm text-ink-2">
          Company identity and environment. Edits committed via <code className="rounded bg-surface px-1 py-0.5 text-xs">config/company.json</code>.
        </p>
      </div>

      <section className="mb-6 rounded-lg border border-line bg-card p-5">
        <h2 className="font-display text-lg text-ink">Company</h2>
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <Term label="Name">{company.name}</Term>
          <Term label="Legal name">{company.legalName}</Term>
          <Term label="GSTIN">{company.gstin}</Term>
          <Term label="CIN">{company.cin}</Term>
          <Term label="PAN">{company.pan}</Term>
          <Term label="Website">{company.website}</Term>
          <Term label="Registered address">
            {company.registeredAddress.line1}, {company.registeredAddress.city},{' '}
            {company.registeredAddress.state} {company.registeredAddress.pincode}
          </Term>
          <Term label="Signatory">
            {company.signatory.name} ({company.signatory.title})
          </Term>
          <Term label="HR contact">
            {company.hrContact.name} / {company.hrContact.email}
          </Term>
        </dl>
        <p className="mt-4 text-xs text-ink-3">
          To edit, update <code className="rounded bg-surface px-1 py-0.5">config/company.json</code> and redeploy.
          This file is committed configuration, not runtime-editable.
        </p>
      </section>

      <section className="rounded-lg border border-line bg-card p-5">
        <h2 className="font-display text-lg text-ink">Environment</h2>
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <Term label="Queue token">
            {process.env.GSL_QUEUE_GITHUB_TOKEN ? 'Configured' : 'Missing'}
          </Term>
          <Term label="Signing key">
            {process.env.GSL_SNAPSHOT_SIGNING_KEY ? 'Configured' : 'Missing'}
          </Term>
          <Term label="JWT secret">
            {process.env.GSL_JWT_SECRET ? 'Configured' : 'Missing'}
          </Term>
        </dl>
      </section>
    </div>
  )
}

function Term({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-xs font-medium uppercase tracking-wider text-ink-3">{label}</dt>
      <dd className="text-sm text-ink">{children}</dd>
    </>
  )
}
