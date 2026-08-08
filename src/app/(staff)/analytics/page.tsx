import { redirect } from 'next/navigation'
import { getCurrentSession } from '@/lib/identity'
import { loadEmployees } from '@/lib/data'
import { loadAttendanceExceptions } from '@/lib/attendance'
import { loadLeaveApplications } from '@/lib/leave'
import {
  loadOnboardingTasks,
  loadOnboardingTemplates,
} from '@/lib/onboardingTasks'
import {
  loadExitInterviews,
  loadOffboardingTasks,
} from '@/lib/offboardingTasks'
import {
  loadDocumentTemplates,
  loadEmployeeDocuments,
} from '@/lib/documents'
import {
  buildAttendanceWidget,
  buildAttritionWidget,
  buildHeadcountWidget,
  buildHrOpsMetricsWidget,
  buildLeaveUtilisationWidget,
} from '@/lib/analytics'
import { AnalyticsView } from './AnalyticsView'

export const dynamic = 'force-dynamic'

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams?: Promise<{ from?: string; to?: string; department?: string; location?: string }>
}) {
  const session = await getCurrentSession()
  if (!session) redirect('/login')
  if (session.role === 'HOD') redirect('/')

  const params = (await searchParams) ?? {}
  const now = new Date()
  const today = now.toISOString().slice(0, 10)
  const yearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const filter = {
    rangeStart: params.from ?? yearAgo,
    rangeEnd: params.to ?? today,
    department: params.department,
    location: params.location,
  }

  const employees = await loadEmployees()
  const headcount = buildHeadcountWidget({ employees, filter, now })
  const attrition = buildAttritionWidget({
    employees,
    exitInterviews: loadExitInterviews(),
    filter,
    now,
  })
  const attendance = buildAttendanceWidget({
    employees,
    exceptions: loadAttendanceExceptions(),
    filter,
  })
  const leaveUtil = buildLeaveUtilisationWidget({
    employees,
    applications: loadLeaveApplications(),
    filter,
    now,
  })
  const hrOps = buildHrOpsMetricsWidget({
    employees,
    onboardingTasks: loadOnboardingTasks(),
    onboardingTemplates: loadOnboardingTemplates(),
    offboardingTasks: loadOffboardingTasks(),
    documents: loadEmployeeDocuments(),
    documentTemplates: loadDocumentTemplates(),
    filter,
    now,
  })

  const departments = Array.from(new Set(employees.map((e) => e.department).filter(Boolean))).sort()
  const locations = Array.from(new Set(employees.map((e) => e.location).filter(Boolean))).sort()

  return (
    <div className="container-page py-8">
      <div className="mb-6">
        <h1 className="font-display text-2xl text-ink">Analytics</h1>
        <p className="mt-1 text-sm text-ink-2">
          Range {filter.rangeStart} to {filter.rangeEnd}.
          {filter.department && ` Department: ${filter.department}.`}
          {filter.location && ` Location: ${filter.location}.`}
        </p>
      </div>

      <AnalyticsView
        headcount={headcount}
        attrition={attrition}
        attendance={attendance}
        leaveUtil={leaveUtil}
        hrOps={hrOps}
        filter={filter}
        departments={departments}
        locations={locations}
      />
    </div>
  )
}
