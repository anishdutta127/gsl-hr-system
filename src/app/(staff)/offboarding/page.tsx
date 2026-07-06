import { redirect } from 'next/navigation'

/**
 * The standalone offboarding-task overview is superseded by the Exits board,
 * which drives the six-step exit process per employee from one page. Kept as a
 * redirect so old bookmarks and the previous nav entry still land correctly.
 */
export default function OffboardingRedirect() {
  redirect('/exits')
}
