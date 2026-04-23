import Link from 'next/link'
import { loadRoles } from '@/lib/data'
import { loadCompany } from '@/lib/company'
import { CareersBrowser } from './CareersBrowser'

export const dynamic = 'force-dynamic'

export default function CareersIndexPage() {
  const company = loadCompany()
  const roles = loadRoles().filter((r) => r.status === 'Open')

  return (
    <div className="container-page pb-16 pt-12">
      <div className="mb-10 max-w-2xl">
        <h1 className="font-display text-3xl text-ink">Work with us</h1>
        <p className="mt-3 text-base text-ink-2">
          {company.name} builds learning products that reach students across India. Teachers,
          designers, engineers, and ops leads who want the work to matter: we would like to hear
          from you.
        </p>
      </div>

      {roles.length === 0 ? (
        <div className="rounded-lg border border-dashed border-line-strong bg-card p-10 text-center">
          <h2 className="font-display text-lg text-ink">No open roles right now</h2>
          <p className="mt-2 text-sm text-ink-2">Check back soon.</p>
        </div>
      ) : (
        <CareersBrowser roles={roles} />
      )}

      <section className="mt-20 max-w-3xl border-t border-line pt-10">
        <h2 className="font-display text-xl text-ink">About {company.name}</h2>
        <p className="mt-3 text-sm text-ink-2">
          We are {company.legalName}, based in {company.registeredAddress.city}. We design
          learning products for Indian classrooms. Part of the {company.parentGroup}.
        </p>
      </section>
    </div>
  )
}
