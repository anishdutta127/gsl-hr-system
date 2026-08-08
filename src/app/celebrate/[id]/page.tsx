import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import {
  findRecognitionById,
  loadEmployees,
  loadUsers,
} from '@/lib/data'
import { loadCompany } from '@/lib/company'
import { formatMonthLabel } from '@/lib/recognition'
import { statsCachedFor1h } from '@/lib/recognitionStats'
import { CelebrationView } from './CelebrationView'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: { id: string }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const rec = await findRecognitionById(params.id)
  if (!rec || !rec.publicShareEnabled || rec.status !== 'Published') {
    return { title: 'Celebration not found' }
  }
  const users = await loadUsers()
  const employees = await loadEmployees()
  const user = users.find((u) => u.id === rec.employeeId)
  const employee = user
    ? employees.find((e) => e.email.toLowerCase() === user.email.toLowerCase())
    : employees.find((e) => e.id === rec.employeeId)
  const employeeName = employee?.name ?? user?.name ?? 'Get Set Learn team member'

  const description = rec.writeup.slice(0, 200) + (rec.writeup.length > 200 ? '...' : '')
  const ogImage = rec.employeePhoto?.storageRef ?? null

  return {
    title: `Celebrating ${employeeName} - Recognition by Get Set Learn`,
    description,
    openGraph: {
      title: `Celebrating ${employeeName} - Recognition by Get Set Learn`,
      description,
      type: 'article',
      ...(ogImage ? { images: [{ url: ogImage }] } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title: `Celebrating ${employeeName}`,
      description,
      ...(ogImage ? { images: [ogImage] } : {}),
    },
  }
}

export default async function CelebratePage({ params }: PageProps) {
  const rec = await findRecognitionById(params.id)
  if (!rec || !rec.publicShareEnabled || rec.status !== 'Published') {
    notFound()
  }

  const company = loadCompany()
  const users = await loadUsers()
  const employees = await loadEmployees()
  const user = users.find((u) => u.id === rec.employeeId)
  const employee = user
    ? employees.find((e) => e.email.toLowerCase() === user.email.toLowerCase())
    : employees.find((e) => e.id === rec.employeeId)
  const employeeName = employee?.name ?? user?.name ?? 'Get Set Learn team member'
  const employeeDesignation = employee?.designation ?? ''

  const stats = await statsCachedFor1h()
  // Drop the focal recognition from the leaderboard so we don't show the
  // same card twice. Cap at 6 for the small grid.
  const recentForLeaderboard = stats.recent
    .filter((r) => r.id !== rec.id)
    .slice(0, 6)
    .map((r) => {
      const u = users.find((u) => u.id === r.employeeId)
      const e = u
        ? employees.find((emp) => emp.email.toLowerCase() === u.email.toLowerCase())
        : employees.find((emp) => emp.id === r.employeeId)
      return {
        id: r.id,
        name: e?.name ?? u?.name ?? 'Recognised employee',
        monthLabel: formatMonthLabel(r.month),
        photoUrl: r.employeePhoto?.storageRef ?? null,
      }
    })

  return (
    <CelebrationView
      id={rec.id}
      employeeName={employeeName}
      employeeDesignation={employeeDesignation}
      department={rec.department}
      category={rec.category}
      monthLabel={formatMonthLabel(rec.month)}
      writeup={rec.writeup}
      photoUrl={rec.employeePhoto?.storageRef ?? null}
      voucherAmount={rec.voucher?.amount ?? 500}
      voucherProvider={rec.voucher?.provider ?? 'Amazon'}
      voucherDelivered={Boolean(rec.voucher?.deliveredAt)}
      companyName={company.name}
      parentGroupName={company.parentGroup}
      recent={recentForLeaderboard}
      stats={{
        totalThisYear: stats.totalThisYear,
        uniqueEmployees: stats.uniqueEmployees,
        uniqueDepartments: stats.uniqueDepartments,
      }}
    />
  )
}
