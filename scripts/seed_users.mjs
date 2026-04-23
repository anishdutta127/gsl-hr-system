/*
 * One-time seed script. Generates bcrypt hashes + writes src/data/users.json.
 * Re-run to add a new user; it merges into the existing file.
 *
 * Usage:
 *   node scripts/seed_users.mjs
 *
 * All initial passwords = "ChangeMeOnFirstLogin" — users change on first login
 * (password-change flow ships when HR reports they've used the system).
 */

import bcrypt from 'bcryptjs'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const INITIAL_PASSWORD = 'ChangeMeOnFirstLogin'
const COST = 12

const seedUsers = [
  {
    email: 'anish@gsl.edu.in',
    name: 'Anish Dutta',
    role: 'Admin',
  },
  {
    email: 'shruti@gsl.edu.in',
    name: 'Shruti',
    role: 'HR',
  },
  {
    email: 'riddhi@gsl.edu.in',
    name: 'Riddhi',
    role: 'HR',
  },
  {
    email: 'manali@gsl.edu.in',
    name: 'Manali',
    role: 'HOD',
  },
  {
    email: 'shashank@gsl.edu.in',
    name: 'Shashank',
    role: 'HOD',
  },
  {
    email: 'vishwanath@gsl.edu.in',
    name: 'Vishwanath',
    role: 'HOD',
  },
  {
    email: 'ritu@gsl.edu.in',
    name: 'Ritu',
    role: 'Leadership',
  },
  {
    email: 'ameet@gsl.edu.in',
    name: 'Ameet',
    role: 'Leadership',
  },
  {
    email: 'jesal@gsl.edu.in',
    name: 'Jesal',
    role: 'Leadership',
  },
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

  const existingEmails = new Set(existing.map((u) => u.email.toLowerCase()))
  const now = new Date().toISOString()
  const hash = await bcrypt.hash(INITIAL_PASSWORD, COST)

  const added = []
  for (const u of seedUsers) {
    if (existingEmails.has(u.email.toLowerCase())) continue
    existing.push({
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
          notes: 'Seeded with initial password. User must change on first login.',
        },
      ],
    })
    added.push(u.email)
  }

  fs.writeFileSync(usersFile, JSON.stringify(existing, null, 2) + '\n', 'utf-8')
  console.log(`Wrote ${existing.length} users to ${usersFile}`)
  console.log(`Added ${added.length} new user(s): ${added.join(', ') || 'none'}`)
  console.log(`Initial password for all seeded users: "${INITIAL_PASSWORD}"`)
  console.log('Communicate this out-of-band. Users should change it immediately.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
