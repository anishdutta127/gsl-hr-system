/*
 * Default onboarding checklist for new joiners.
 * HR can toggle items via /employees/[id]; each toggle enqueues an audit entry.
 */

import crypto from 'node:crypto'
import type { OnboardingItem } from './types'

const DEFAULT_ITEMS: Array<Omit<OnboardingItem, 'id' | 'done' | 'doneAt' | 'doneBy'>> = [
  { label: 'Offer letter signed + filed' },
  { label: 'Joining documents collected (PAN, Aadhaar, educational)' },
  { label: 'Previous-employer relieving letter received' },
  { label: 'Employee code assigned' },
  { label: 'Email + laptop handed over' },
  { label: 'Access to Drive, Slack, internal tools granted' },
  { label: 'Day-1 induction scheduled' },
  { label: 'Reporting manager introduced' },
  { label: 'Policy handbook acknowledged' },
  { label: 'Background verification initiated' },
]

export function defaultOnboardingChecklist(): OnboardingItem[] {
  return DEFAULT_ITEMS.map((item) => ({
    id: `ob-${crypto.randomBytes(4).toString('hex')}`,
    label: item.label,
    done: false,
  }))
}
