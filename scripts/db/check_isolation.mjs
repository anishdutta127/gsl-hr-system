/*
 * Prove the gsl_hr database and the ops (neondb) database cannot reach each
 * other, using the credentials each app actually uses.
 *
 * WHY THIS IS A SCRIPT AND NOT A README PARAGRAPH: isolation asserted in prose
 * is isolation nobody has tested. HR holds salaries, F&F settlements and exit
 * interviews naming managers, so "the ops role cannot read this" has to be a
 * measurement, re-runnable after any Neon change.
 *
 * Reads DATABASE_URL / DIRECT_URL from .env.local. Never prints a credential.
 *
 *   node scripts/db/check_isolation.mjs
 */

import fs from 'node:fs'
import pg from 'pg'

function loadEnv() {
  const out = {}
  if (!fs.existsSync('.env.local')) return out
  for (const line of fs.readFileSync('.env.local', 'utf-8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (m) out[m[1]] = (m[2] ?? '').replace(/^["']|["']$/g, '')
  }
  return out
}

/** Swap the database name in a Postgres URL, keeping everything else. */
function withDatabase(url, dbName) {
  const u = new URL(url)
  u.pathname = `/${dbName}`
  return u.toString()
}

/** Redact a URL down to role@host/db so it is safe to print. */
function describe(url) {
  const u = new URL(url)
  return `${u.username}@${u.hostname.split('.')[0]}${u.pathname}`
}

async function attempt(label, url, expectation) {
  const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 15000 })
  let verdict
  let detail = ''
  try {
    await client.connect()
    const res = await client.query('select current_database() as db, current_user as who')
    verdict = 'CONNECTED'
    detail = `db=${res.rows[0].db} user=${res.rows[0].who}`
    // If we got in, see what we can actually read.
    const t = await client.query(
      "select count(*)::int as n from information_schema.tables where table_schema='public'",
    )
    detail += ` public_tables_visible=${t.rows[0].n}`
  } catch (err) {
    verdict = 'REFUSED'
    detail = String(err.message).split('\n')[0]
  } finally {
    try {
      await client.end()
    } catch {
      /* already closed */
    }
  }

  const pass = verdict === expectation
  console.log(`  [${pass ? 'PASS' : 'FAIL'}] ${label}`)
  console.log(`         target   : ${describe(url)}`)
  console.log(`         expected : ${expectation}`)
  console.log(`         actual   : ${verdict} (${detail})`)
  return pass
}

const env = loadEnv()
const hrDirect = env.DIRECT_URL
if (!hrDirect) {
  console.error('DIRECT_URL missing from .env.local')
  process.exit(1)
}

const OPS_DB = 'neondb'
const HR_DB = 'gsl_hr'

console.log('Cross-database isolation check (gsl_hr vs ops neondb)\n')

const results = []
// The HR app must be able to use its own database. Positive control: if this
// fails, every other result below is meaningless.
results.push(await attempt('HR role -> HR database (must work)', withDatabase(hrDirect, HR_DB), 'CONNECTED'))
// The isolation requirement itself.
results.push(await attempt('HR role -> ops database (must be refused)', withDatabase(hrDirect, OPS_DB), 'REFUSED'))

console.log('')
if (results.every(Boolean)) {
  console.log('RESULT: isolation holds for the directions tested here.')
  console.log('NOTE: the ops-role-to-HR direction needs the ops credential and is')
  console.log('      checked separately; see scripts/db/README-isolation.md.')
  process.exit(0)
}
console.log('RESULT: ISOLATION NOT SATISFIED. Do not migrate HR data until this passes.')
process.exit(1)
