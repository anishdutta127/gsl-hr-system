import { redirect } from 'next/navigation'

/**
 * The per-employee offboarding page (tasks + exit interview + F&F across one
 * scroll) is superseded by the exit cockpit at /exits/[id], which drives all
 * six steps inline. Redirect so old links resolve. The exit interview + F&F
 * now live inside the cockpit with the same role gates.
 */
export default function EmployeeOffboardingRedirect({ params }: { params: { id: string } }) {
  redirect(`/exits/${params.id}`)
}
