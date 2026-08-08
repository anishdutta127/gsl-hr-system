import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { findRoleById } from '@/lib/data'
import { formatRs } from '@/lib/format'
import { isPubliclyVisible } from '@/lib/roleStatus'
import { toPublicRole } from '@/lib/roles/publicRole'
import { plainTextToHtml, sanitiseRoleHtml } from '@/lib/sanitiseHtml'
import { RoleApplyForm } from './RoleApplyForm'

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: { roleId: string }
}): Promise<Metadata> {
  const role = findRoleById(params.roleId)
  if (!role) return { title: 'Role · GSL Careers' }
  const title = `${role.title} · GSL Careers`
  // Strip HTML tags for the meta description so OG previews are plain text.
  const plainDescription = (role.description ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  const description =
    plainDescription.slice(0, 200) || `Open role at GSL: ${role.title}, ${role.department}.`
  return {
    title,
    description,
    alternates: { canonical: `/careers/${role.id}` },
    openGraph: {
      title,
      description,
      url: `/careers/${role.id}`,
      siteName: 'GSL · Get Set Learn',
      type: 'website',
      images: ['/brand/gsl-og.png'],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: ['/brand/gsl-og.png'],
    },
  }
}

const TIMELINE_STEPS = [
  { label: 'Apply', description: 'Send us your details.' },
  { label: 'Assessment', description: 'A short take-home relevant to the role.' },
  { label: 'HOD interview', description: 'Meet the team lead.' },
  { label: 'HR round', description: 'Fit, compensation, joining logistics.' },
  { label: 'Offer', description: 'We confirm, you decide.' },
]

export default function CareersRolePage({ params }: { params: { roleId: string } }) {
  const record = findRoleById(params.roleId)
  if (!record || !isPubliclyVisible(record)) notFound()

  // Everything below renders from the PROJECTION, never from the record. This
  // page is a server component so only its output ships today, but projecting
  // here means a future prop handed to a client component cannot leak either.
  const role = toPublicRole(record)

  // Undisclosed pay is absent from the projection rather than merely unrendered,
  // so the figures cannot appear in the payload.
  const salary = role.salary
    ? `${formatRs(role.salary.min, { compact: true })} to ${formatRs(role.salary.max, { compact: true })} per ${role.salary.period === 'annual' ? 'year' : 'month'}`
    : 'Shared at first interview.'

  return (
    <div className="container-page pb-16 pt-8">
      <div className="mb-6 text-xs text-ink-3">
        <Link href="/careers" className="hover:text-ink">
          ← All roles
        </Link>
      </div>

      <header className="mb-8">
        <h1 className="font-display text-3xl text-ink">{role.title}</h1>
        <p className="mt-2 text-sm text-ink-2">
          {role.department} · {role.location} · {role.employmentType}
        </p>
      </header>

      {role.description && (
        <div
          className="prose prose-sm mb-8 max-w-none text-ink prose-headings:font-display prose-headings:text-ink prose-h2:text-xl prose-h3:text-lg prose-strong:text-ink prose-a:text-navy prose-a:underline prose-ul:list-disc prose-ol:list-decimal prose-li:text-ink"
          dangerouslySetInnerHTML={{ __html: sanitiseRoleHtml(plainTextToHtml(role.description)) }}
        />
      )}

      <div className="grid gap-10 lg:grid-cols-[1fr_420px]">
        <div>
          {role.responsibilities.length > 0 && (
            <Section title="What you'll do" items={role.responsibilities} />
          )}
          {role.mustHaves.length > 0 && (
            <Section title="Must have" items={role.mustHaves} />
          )}
          {role.niceToHaves.length > 0 && (
            <Section title="Nice to have" items={role.niceToHaves} />
          )}

          <section className="mb-10">
            <h2 className="mb-3 font-display text-xl text-ink">Compensation</h2>
            <p className="text-sm text-ink-2">{salary}</p>
          </section>

          <section className="mb-10">
            <h2 className="mb-3 font-display text-xl text-ink">What happens next</h2>
            <ol className="space-y-3">
              {TIMELINE_STEPS.map((step, i) => (
                <li key={step.label} className="flex gap-4">
                  <span
                    aria-hidden="true"
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal-light text-xs font-medium text-teal-dark tabular"
                  >
                    {i + 1}
                  </span>
                  <span>
                    <span className="block text-sm font-medium text-ink">{step.label}</span>
                    <span className="block text-xs text-ink-2">{step.description}</span>
                  </span>
                </li>
              ))}
            </ol>
            <p className="mt-4 text-xs text-ink-3">Typically 4-6 weeks end-to-end.</p>
          </section>
        </div>

        <aside className="lg:sticky lg:top-8 lg:self-start">
          <div className="rounded-lg border border-line bg-card p-6 shadow-sm">
            <h2 className="mb-1 font-display text-lg text-ink">Apply</h2>
            <p className="mb-5 text-xs text-ink-2">
              Takes about two minutes. You'll get an email back with next steps.
            </p>
            <RoleApplyForm roleId={role.id} roleTitle={role.title} />
          </div>
        </aside>
      </div>
    </div>
  )
}

function Section({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="mb-10">
      <h2 className="mb-3 font-display text-xl text-ink">{title}</h2>
      <ul className="list-disc space-y-2 pl-5 text-sm text-ink">
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </section>
  )
}
