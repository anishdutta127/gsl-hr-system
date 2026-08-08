import { notFound } from 'next/navigation'
import { requireRoles } from '@/lib/guards'
import {
  findRecognitionById,
  loadEmployees,
  loadUsers,
} from '@/lib/data'
import { formatMonthLabel } from '@/lib/recognition'
import { loadCompany } from '@/lib/company'
import { RecognitionCard } from './RecognitionCard'

export const dynamic = 'force-dynamic'

interface Props {
  params: { id: string }
}

export default async function RecognitionCardPage({ params }: Props) {
  await requireRoles(['Admin', 'HR', 'HOD', 'Leadership'])

  const rec = await findRecognitionById(params.id)
  if (!rec) notFound()
  // Unreviewed nominations stay private to /admin/recognition. The card
  // view is for Approved + Published + Archived (audit view) only.
  if (rec.status === 'Draft') notFound()

  const company = loadCompany()
  const users = await loadUsers()
  const employees = await loadEmployees()

  // Find the employee for this recognition. employeeId may be a User id
  // (the form maps employees through the User table) or, for legacy
  // records, an Employee id directly.
  const user = users.find((u) => u.id === rec.employeeId)
  const employee = user
    ? employees.find((e) => e.email.toLowerCase() === user.email.toLowerCase())
    : employees.find((e) => e.id === rec.employeeId)

  const employeeName = employee?.name ?? user?.name ?? 'Recognised Employee'
  const employeeDesignation = employee?.designation ?? ''

  return (
    <RecognitionCard
      id={rec.id}
      employeeName={employeeName}
      employeeDesignation={employeeDesignation}
      department={rec.department}
      category={rec.category}
      monthLabel={formatMonthLabel(rec.month)}
      writeup={rec.writeup}
      status={rec.status}
      companyName={company.name}
      parentGroupName={company.parentGroup}
    />
  )
}
