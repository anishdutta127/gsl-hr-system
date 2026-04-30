/*
 * One-time seed script. Generates bcrypt hashes + writes src/data/users.json.
 * Rerun-safe: merges into existing users.json keyed by email (case-insensitive).
 * Does not delete users that aren't in the seed list.
 *
 * Usage:
 *   node scripts/seed_users.mjs
 *
 * Starter password: "GSL#123". Users can change via /account after first login.
 * There is no "force change on first login" gate — pick a strong password at
 * your convenience.
 */

import bcrypt from 'bcryptjs'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const INITIAL_PASSWORD = 'GSL#123'
const COST = 12

const seedUsers = [
  { email: 'anish.d@getsetlearn.info', name: 'Anish Dutta', role: 'Admin' },
  { email: 'Hiring@getsetlearn.info', name: 'Shruti', role: 'HR' },
  { email: 'hr@getsetlearn.info', name: 'Riddhi', role: 'HR' },
  { email: 'manali.b@getsetlearn.info', name: 'Manali', role: 'HOD' },
  { email: 'ritu.u@getsetlearn.info', name: 'Ritu Uppal', role: 'HOD' },
  { email: 'shashank.s@getsetlearn.info', name: 'Shashank', role: 'HOD' },
  { email: 'shubhra.r@getsetlearn.info', name: 'Shubhra Rishi', role: 'HOD' },
  { email: 'vishwanath.g@getsetlearn.info', name: 'Vishwanath', role: 'HOD' },
  { email: 'sumit.m@getsetlearn.info', name: 'Sumit', role: 'HOD' },
  { email: 'pratik.d@getsetlearn.info', name: 'Pratik', role: 'HOD' },
  { email: 'ameet.z@getsetlearn.info', name: 'Ameet', role: 'Admin' },
]

async function main() {
  const dataDir = path.join(process.cwd(), 'src', 'data')
  const usersFile = path.join(dataDir, 'users.json')
  fs.mkdirSync(dataDir, { recursive: true })

  let existing = []
  try {
    if (fs.existsSync(usersFile)) {
      existing = JSON.parse(fs.readFileSync(usersFile, 'utf-8'))
      if (!Array.isArray(existing)) existing = []
    }
  } catch {
    existing = []
  }

  const existingByEmail = new Map(
    existing.map((u) => [u.email.toLowerCase(), u]),
  )
  const now = new Date().toISOString()
  const hash = await bcrypt.hash(INITIAL_PASSWORD, COST)

  const added = []
  const updated = []
  const out = []

  for (const u of seedUsers) {
    const prev = existingByEmail.get(u.email.toLowerCase())
    if (prev) {
      const next = {
        ...prev,
        name: u.name,
        role: u.role,
        email: u.email,
        bcryptHash: hash,
        active: true,
        ownedRoleIds: prev.ownedRoleIds ?? [],
        auditLog: [
          ...(prev.auditLog ?? []),
          {
            timestamp: now,
            user: 'seed-script',
            action: 'user.update',
            after: { email: u.email, name: u.name, role: u.role, active: true },
            notes: `Re-seeded by seed_users.mjs — password reset to starter.`,
          },
        ],
      }
      out.push(next)
      updated.push(u.email)
    } else {
      out.push({
        id: crypto.randomUUID(),
        email: u.email,
        name: u.name,
        role: u.role,
        bcryptHash: hash,
        createdAt: now,
        active: true,
        ownedRoleIds: [],
        auditLog: [
          {
            timestamp: now,
            user: 'seed-script',
            action: 'user.create',
            after: { email: u.email, name: u.name, role: u.role, active: true },
            notes: 'Seeded with starter password.',
          },
        ],
      })
      added.push(u.email)
    }
  }

  // Keep any existing users whose emails don't overlap with the seed list —
  // do NOT delete them. If you want to remove a stale seed, edit users.json
  // or use the admin UI.
  const seedEmails = new Set(seedUsers.map((u) => u.email.toLowerCase()))
  const preserved = existing.filter((u) => !seedEmails.has(u.email.toLowerCase()))

  const finalList = [...out, ...preserved]
  fs.writeFileSync(usersFile, JSON.stringify(finalList, null, 2) + '\n', 'utf-8')
  console.log(`Wrote ${finalList.length} users to ${usersFile}`)
  console.log(`Added: ${added.join(', ') || 'none'}`)
  console.log(`Updated: ${updated.join(', ') || 'none'}`)
  console.log(`Preserved (not in seed): ${preserved.map((u) => u.email).join(', ') || 'none'}`)
  console.log(`Starter password for all seeded users: "${INITIAL_PASSWORD}"`)
  console.log('Users can change via /account at any time.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
