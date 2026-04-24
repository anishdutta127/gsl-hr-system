import { notFound } from 'next/navigation'
import Link from 'next/link'
import { requireRoles } from '@/lib/guards'
import { findTemplateById } from '@/lib/letterTemplates'
import { loadEmployees } from '@/lib/data'
import { GenerateLetterForm } from './GenerateLetterForm'

export const dynamic = 'force-dynamic'

export default async function LetterGenerateePage({ params }: { params: { id: string } }) {
  await requireRoles(['Admin', 'HR'])
  const template = findTemplateById(params.id)
  if (!template) notFound()

  let employees = loadEmployees()
  if (template.audience === 'exited') {
    employees = employees.filter((e) => e.status === 'Exited')
  } else if (template.audience === 'all-employees') {
    employees = employees.filter((e) => e.status === 'Active')
  }
  // 'interns' template doesn't filter; the operator picks any employee or none

  return (
    <div className="container-page py-8">
      <div className="mb-2 text-xs text-ink-3">
        <Link href="/letters" className="hover:text-ink">
          Letters
        </Link>{' '}
        / {template.title}
      </div>
      <h1 className="font-display text-2xl text-ink">{template.title}</h1>
      <p className="mt-1 text-sm text-ink-2">{template.description}</p>

      <GenerateLetterForm
        template={template}
        employees={employees.map((e) => ({
          id: e.id,
          label: `${e.name}${e.employeeCode ? ` (${e.employeeCode})` : ''}`,
        }))}
      />
    </div>
  )
}
