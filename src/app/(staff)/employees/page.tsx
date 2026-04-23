export default function EmployeesPage() {
  return (
    <div className="container-page py-8">
      <h1 className="font-display text-2xl text-ink">Employees</h1>
      <div className="mt-6 rounded-lg border border-dashed border-line-strong bg-card p-8 text-center">
        <p className="text-sm text-ink-2">
          Employee records land next week alongside the onboarding checklist and exit
          workflow. For now, candidates who reach the{' '}
          <span className="font-medium text-ink">Joined</span> stage sit in the Kanban
          as terminal entries.
        </p>
      </div>
    </div>
  )
}
