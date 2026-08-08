/*
 * Read-side data loaders, backed by Postgres.
 *
 * These were synchronous fs.readFileSync reads of src/data/*.json. They are
 * now async Prisma reads. Signatures and return shapes are unchanged, so the
 * only change at a call site is `await`.
 *
 * The record shape is produced by src/lib/db/entities.ts, which is the same
 * mapping scripts/db/verify_parity.ts uses to prove all 907 records round-trip
 * from Postgres byte-for-byte. If a loader returns something the old JSON did
 * not, parity fails first.
 *
 * Connection: this runs in the app, so it uses the POOLED DATABASE_URL via
 * src/lib/db.ts. Migrations and admin scripts use DIRECT_URL instead.
 */

import { prisma } from '@/lib/db'
import { readCollection } from '@/lib/db/entities'
import type {
  User,
  Role,
  Candidate,
  Application,
  Interview,
  Offer,
  Employee,
  Recognition,
  NominationCycle,
  ITAsset,
} from './types'

export async function loadUsers(): Promise<User[]> {
  return (await readCollection('src/data/users.json')) as unknown as User[]
}

export async function loadRoles(): Promise<Role[]> {
  return (await readCollection('src/data/roles.json')) as unknown as Role[]
}

export async function loadCandidates(): Promise<Candidate[]> {
  const raw = await readCollection('src/data/candidates.json')
  // Boundary filter kept from the JSON era: the queue applier has historically
  // mis-routed outbound-mail records into candidates (entity name collision,
  // fixed in mail.ts). Anything missing id+name would crash downstream
  // consumers like the /emails/[id] sort and the magic-link email lookup.
  return raw.filter((c) => {
    if (!c || typeof c !== 'object') return false
    const r = c as Record<string, unknown>
    return typeof r.id === 'string' && typeof r.name === 'string'
  }) as unknown as Candidate[]
}

export async function loadApplications(): Promise<Application[]> {
  return (await readCollection('src/data/applications.json')) as unknown as Application[]
}

export async function loadInterviews(): Promise<Interview[]> {
  return (await readCollection('src/data/interviews.json')) as unknown as Interview[]
}

export async function loadOffers(): Promise<Offer[]> {
  return (await readCollection('src/data/offers.json')) as unknown as Offer[]
}

export async function loadEmployees(): Promise<Employee[]> {
  return (await readCollection('src/data/employees.json')) as unknown as Employee[]
}

export async function loadRecognitions(): Promise<Recognition[]> {
  return (await readCollection('src/data/recognitions.json')) as unknown as Recognition[]
}

export async function findRecognitionById(id: string): Promise<Recognition | undefined> {
  return (await loadRecognitions()).find((r) => r.id === id)
}

export async function loadNominationCycles(): Promise<NominationCycle[]> {
  return (await readCollection('src/data/nomination_cycles.json')) as unknown as NominationCycle[]
}

export async function loadITAssets(): Promise<ITAsset[]> {
  return (await readCollection('src/data/it_assets.json')) as unknown as ITAsset[]
}

export async function findITAssetById(id: string): Promise<ITAsset | undefined> {
  return (await loadITAssets()).find((a) => a.id === id)
}

// The find* helpers below query by key rather than loading the whole
// collection. Same contract as before, far less work per call.

export async function findCandidateById(id: string): Promise<Candidate | undefined> {
  return (await loadCandidates()).find((c) => c.id === id)
}

export async function findApplicationById(id: string): Promise<Application | undefined> {
  return (await loadApplications()).find((a) => a.id === id)
}

export async function findOfferById(id: string): Promise<Offer | undefined> {
  return (await loadOffers()).find((o) => o.id === id)
}

export async function findEmployeeById(id: string): Promise<Employee | undefined> {
  return (await loadEmployees()).find((e) => e.id === id)
}

/** Find a user by email for login. Case-insensitive, active users only. */
export async function findUserByEmail(email: string): Promise<User | undefined> {
  const normalized = email.trim().toLowerCase()
  return (await loadUsers()).find((u) => u.email.toLowerCase() === normalized && u.active)
}

/** Find a role by id. */
export async function findRoleById(id: string): Promise<Role | undefined> {
  return (await loadRoles()).find((r) => r.id === id)
}

/** All applications for a given role, with candidate joined in. */
export interface ApplicationWithCandidate extends Application {
  candidate: Candidate | undefined
}

export async function loadApplicationsForRole(roleId: string): Promise<ApplicationWithCandidate[]> {
  const [applications, candidates] = await Promise.all([loadApplications(), loadCandidates()])
  const byId = new Map(candidates.map((c) => [c.id, c] as const))
  return applications
    .filter((a) => a.roleId === roleId)
    .map((a) => ({ ...a, candidate: byId.get(a.candidateId) }))
}

/** Exposed so callers that need a transaction can reuse the same client. */
export { prisma }
