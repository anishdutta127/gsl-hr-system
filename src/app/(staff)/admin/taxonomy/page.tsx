import { redirect } from 'next/navigation'
import { getCurrentSession } from '@/lib/identity'
import { loadEmployees } from '@/lib/data'
import {
  buildDepartmentViews,
  buildLocationViews,
  loadTaxonomy,
} from '@/lib/taxonomy'
import { TaxonomyEditor } from './TaxonomyEditor'

export const dynamic = 'force-dynamic'

export default async function TaxonomyPage() {
  const session = await getCurrentSession()
  if (!session) redirect('/login')
  if (session.role !== 'Admin' && session.role !== 'HR') redirect('/')

  const employees = await loadEmployees()
  const taxonomy = loadTaxonomy()
  const locations = buildLocationViews(employees, taxonomy)
  const departments = buildDepartmentViews(employees, taxonomy)

  return (
    <div className="container-page py-8">
      <div className="mb-6">
        <h1 className="font-display text-2xl text-ink">Locations and departments</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-2">
          Source of truth for the city + department vocabulary used across employee records.
          Renaming a value here cascades to every employee with that location or department.
          Merging is a rename to a name that already exists.
        </p>
      </div>

      <TaxonomyEditor locations={locations} departments={departments} />
    </div>
  )
}
