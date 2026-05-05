/*
 * Read-side data loaders. Each entity is a flat JSON file at src/data/*.json.
 * Reads happen at request time (server components) or build time (static pages).
 * Writes happen via the queue (lib/queue/pendingUpdates.ts).
 *
 * Fallbacks: if a file doesn't exist yet (fresh deploy), return [].
 */

import fs from 'node:fs'
import path from 'node:path'
import type {
  User,
  Role,
  Candidate,
  Application,
  Interview,
  Offer,
  Employee,
} from './types'

const DATA_DIR = path.join(process.cwd(), 'src', 'data')

function readJson<T>(filename: string, fallback: T): T {
  const filepath = path.join(DATA_DIR, filename)
  try {
    if (!fs.existsSync(filepath)) return fallback
    const text = fs.readFileSync(filepath, 'utf-8')
    if (!text.trim()) return fallback
    return JSON.parse(text) as T
  } catch {
    return fallback
  }
}

export function loadUsers(): User[] {
  return readJson<User[]>('users.json', [])
}

export function loadRoles(): Role[] {
  return readJson<Role[]>('roles.json', [])
}

export function loadCandidates(): Candidate[] {
  const raw = readJson<unknown[]>('candidates.json', [])
  // Boundary filter: drop records that don't satisfy the Candidate shape.
  // Why: the queue applier has historically mis-routed outbound-mail records
  // into candidates.json (entity name collision, fixed in mail.ts). Anything
  // missing id+name would crash downstream consumers like the /emails/[id]
  // sort and the magic-link email lookup.
  return raw.filter((c): c is Candidate => {
    if (!c || typeof c !== 'object') return false
    const r = c as Record<string, unknown>
    return typeof r.id === 'string' && typeof r.name === 'string'
  })
}

export function loadApplications(): Application[] {
  return readJson<Application[]>('applications.json', [])
}

export function loadInterviews(): Interview[] {
  return readJson<Interview[]>('interviews.json', [])
}

export function loadOffers(): Offer[] {
  return readJson<Offer[]>('offers.json', [])
}

export function loadEmployees(): Employee[] {
  return readJson<Employee[]>('employees.json', [])
}

export function findCandidateById(id: string): Candidate | undefined {
  return loadCandidates().find((c) => c.id === id)
}

export function findApplicationById(id: string): Application | undefined {
  return loadApplications().find((a) => a.id === id)
}

export function findOfferById(id: string): Offer | undefined {
  return loadOffers().find((o) => o.id === id)
}

export function findEmployeeById(id: string): Employee | undefined {
  return loadEmployees().find((e) => e.id === id)
}

/** Find a user by email for login. Case-insensitive. */
export function findUserByEmail(email: string): User | undefined {
  const normalized = email.trim().toLowerCase()
  return loadUsers().find((u) => u.email.toLowerCase() === normalized && u.active)
}

/** Find a role by id. */
export function findRoleById(id: string): Role | undefined {
  return loadRoles().find((r) => r.id === id)
}

/** All applications for a given role, with candidate joined in. */
export interface ApplicationWithCandidate extends Application {
  candidate: Candidate | undefined
}

export function loadApplicationsForRole(roleId: string): ApplicationWithCandidate[] {
  const applications = loadApplications().filter((a) => a.roleId === roleId)
  const candidates = loadCandidates()
  const byId = new Map(candidates.map((c) => [c.id, c] as const))
  return applications.map((a) => ({ ...a, candidate: byId.get(a.candidateId) }))
}
