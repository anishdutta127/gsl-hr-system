import { notFound } from 'next/navigation'
import Link from 'next/link'
import { findRoleById } from '@/lib/data'
import { formatRs } from '@/lib/format'
import { RoleApplyForm } from './RoleApplyForm'

export const dynamic = 'force-dynamic'

const TIMELINE_STEPS = [
  { label: 'Apply', description: 'Send us your details.' },
  { label: 'Assessment', description: 'A short take-home relevant to the role.' },
  { label: 'HOD interview', description: 'Meet the team lead.' },
  { label: 'HR round', description: 'Fit, compensation, joining logistics.' },
  { label: 'Offer', description: 'We confirm, you decide.' },
]

export default function CareersRolePage({ params }: { params: { roleId: string } }) {
  const role = findRoleById(params.roleId)
  if (!role || role.status !== 'Open') notFound()

  const salary =
    role.salaryRange && role.salaryRange.disclose
      ? `${formatRs(role.salaryRange.min, { compact: true })} to ${formatRs(role.salaryRange.max, { compact: true })} per ${role.salaryRange.period === 'annual' ? 'year' : 'month'}`
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
        <p className="mb-8 text-base text-ink">{role.description}</p>
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
