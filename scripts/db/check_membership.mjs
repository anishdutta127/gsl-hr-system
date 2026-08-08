/*
 * Does the ops role inherit CONNECT on gsl_hr through neon_superuser?
 *
 * REVOKE CONNECT ... FROM PUBLIC removes the membership route, but the
 * database ACL also carries an explicit neon_superuser=CTc grant that Neon
 * adds. If the ops role is a member of neon_superuser, that grant defeats the
 * revoke and same-project isolation is not achievable.
 *
 * Answers this from inside gsl_hr, so it needs no ops credential.
 */

import fs from 'node:fs'
import pg from 'pg'

const env = {}
for (const line of fs.readFileSync('.env.local', 'utf-8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
  if (m) env[m[1]] = (m[2] ?? '').replace(/^["']|["']$/g, '')
}

const client = new pg.Client({ connectionString: env.DIRECT_URL, connectionTimeoutMillis: 15000 })
await client.connect()

const members = await client.query(`
  select r.rolname as member, g.rolname as granted_role
  from pg_auth_members m
  join pg_roles r on r.oid = m.member
  join pg_roles g on g.oid = m.roleid
  where g.rolname = 'neon_superuser'
  order by r.rolname
`)

console.log('members of neon_superuser:')
for (const row of members.rows) console.log(`  ${row.member}`)

const opsIsMember = members.rows.some((r) => r.member === 'neondb_owner')

const attrs = await client.query(`
  select rolname, rolsuper, rolcreaterole, rolcreatedb, rolbypassrls
  from pg_roles where rolname in ('gsl_hr_owner','neondb_owner','neon_superuser')
  order by rolname
`)
console.log('\nrole attributes:')
for (const r of attrs.rows) {
  console.log(
    `  ${r.rolname.padEnd(16)} super=${r.rolsuper} createrole=${r.rolcreaterole} createdb=${r.rolcreatedb} bypassrls=${r.rolbypassrls}`,
  )
}

// has_database_privilege answers the actual question the ACL only hints at.
const eff = await client.query(`
  select
    has_database_privilege('neondb_owner','gsl_hr','CONNECT') as ops_can_connect_to_hr,
    has_database_privilege('gsl_hr_owner','neondb','CONNECT') as hr_can_connect_to_ops
`)
console.log('\neffective privilege (the decisive answer):')
console.log(`  ops role can CONNECT to gsl_hr : ${eff.rows[0].ops_can_connect_to_hr}`)
console.log(`  HR role  can CONNECT to neondb : ${eff.rows[0].hr_can_connect_to_ops}`)

await client.end()

console.log('')
if (eff.rows[0].ops_can_connect_to_hr || eff.rows[0].hr_can_connect_to_ops) {
  console.log('VERDICT: same-project isolation is NOT achievable by grants alone.')
  if (opsIsMember) {
    console.log('  Reason: the ops role is a member of neon_superuser, which holds an')
    console.log('  explicit CONNECT grant on every database in the project.')
  }
  process.exit(1)
}
console.log('VERDICT: isolation holds in both directions.')
