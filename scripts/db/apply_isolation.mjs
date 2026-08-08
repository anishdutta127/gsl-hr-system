/*
 * Lock the gsl_hr database down so only its own role can reach it.
 *
 * Runs as gsl_hr_owner, which owns gsl_hr, so it needs no privilege on the
 * ops database and makes no change to it. Postgres grants CONNECT to PUBLIC
 * on every new database, and every role is a member of PUBLIC, so without
 * this the ops role can open the HR database.
 *
 * Idempotent. Safe to re-run.
 *
 *   node scripts/db/apply_isolation.mjs
 */

import fs from 'node:fs'
import pg from 'pg'

function loadEnv() {
  const out = {}
  for (const line of fs.readFileSync('.env.local', 'utf-8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (m) out[m[1]] = (m[2] ?? '').replace(/^["']|["']$/g, '')
  }
  return out
}

const env = loadEnv()
const client = new pg.Client({ connectionString: env.DIRECT_URL, connectionTimeoutMillis: 15000 })

const STATEMENTS = [
  // Nobody reaches this database by default membership.
  'REVOKE CONNECT ON DATABASE gsl_hr FROM PUBLIC',
  // The owner keeps its access explicitly, so the revoke cannot lock us out.
  'GRANT CONNECT ON DATABASE gsl_hr TO gsl_hr_owner',
  // Same for the schema: PUBLIC gets USAGE/CREATE on public by default in
  // older Postgres, and USAGE in current versions. Neither is wanted here.
  'REVOKE ALL ON SCHEMA public FROM PUBLIC',
  'GRANT ALL ON SCHEMA public TO gsl_hr_owner',
]

await client.connect()
console.log('connected as gsl_hr_owner to gsl_hr\n')

for (const sql of STATEMENTS) {
  try {
    await client.query(sql)
    console.log(`  ok   ${sql}`)
  } catch (err) {
    console.log(`  FAIL ${sql}`)
    console.log(`       ${String(err.message).split('\n')[0]}`)
    await client.end()
    process.exit(1)
  }
}

// Read the resulting ACL back rather than trusting that the statements did
// what their names suggest.
const acl = await client.query(
  "select datname, datacl::text from pg_database where datname in ('gsl_hr','neondb') order by datname",
)
console.log('\nresulting database ACLs:')
for (const row of acl.rows) {
  console.log(`  ${row.datname}: ${row.datacl ?? '(default - PUBLIC can connect)'}`)
}

await client.end()
console.log('\ndone. Re-run check_isolation.mjs to verify from the outside.')
