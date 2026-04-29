import type { Metadata } from 'next'
import { loadRoles } from '@/lib/data'
import { loadCompany } from '@/lib/company'
import { isPubliclyVisible } from '@/lib/roleStatus'
import { CareersBrowser } from './CareersBrowser'

export const dynamic = 'force-dynamic'

const PAGE_INTRO =
  'GSL builds learning products that reach students across India. Teachers, designers, engineers, and ops leads who want the work to matter: we would like to hear from you.'

export const metadata: Metadata = {
  title: 'Work with GSL',
  description: PAGE_INTRO,
  alternates: { canonical: '/careers' },
  openGraph: {
    title: 'Work with GSL',
    description: PAGE_INTRO,
    url: '/careers',
    siteName: 'GSL · Get Set Learn',
    type: 'website',
    // og:image asset lives at /brand/gsl-og.png once Anish drops it in;
    // platforms fall back to no preview-image gracefully if missing.
    images: ['/brand/gsl-og.png'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Work with GSL',
    description: PAGE_INTRO,
    images: ['/brand/gsl-og.png'],
  },
}

export default function CareersIndexPage() {
  const company = loadCompany()
  const roles = loadRoles().filter(isPubliclyVisible)

  return (
    <div className="container-page pb-16 pt-12">
      <div className="mb-10 max-w-2xl">
        <h1 className="font-display text-3xl text-ink">Work with us</h1>
        <p className="mt-3 text-base text-ink-2">{PAGE_INTRO}</p>
      </div>

      {roles.length === 0 ? (
        <div className="rounded-lg border border-dashed border-line-strong bg-card p-10">
          <h2 className="font-display text-lg text-ink">No open roles right now</h2>
          <p className="mt-3 text-sm text-ink-2">
            We are not actively hiring at the moment, but we are always interested in great
            people. Drop your CV at{' '}
            <a
              href="mailto:careers@getsetlearn.info"
              className="font-medium text-navy underline hover:text-navy-dark"
            >
              careers@getsetlearn.info
            </a>{' '}
            and we will reach out when something opens up.
          </p>
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
