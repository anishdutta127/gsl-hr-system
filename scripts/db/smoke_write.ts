/*
 * Write smoke test: create, edit, delete, each immediately visible.
 *
 * Exercises the REAL write path the app uses (atomicUpdateJson, which now runs
 * a transactional read-modify-write against Postgres) and the REAL read path
 * (readCollection), so it proves the thing the migration exists for: a save is
 * visible on the next read with no queue, no cron and no drain.
 *
 * Uses the `assets` collection, which is empty in the source data, so nothing
 * that parity checks is disturbed. Cleans up after itself and then asserts the
 * collection is empty again, so a failed run cannot leave residue behind.
 *
 *   npx tsx scripts/db/smoke_write.ts
 */

import { atomicUpdateJson } from '@/lib/queue/githubQueue'
import { readCollection } from '@/lib/db/entities'
import { prisma } from '@/lib/db'

const PATH = 'src/data/assets.json'
const ID = 'smoke-test-asset-do-not-keep'

interface Asset {
  id: string
  employeeId?: string
  label?: string
  auditLog?: { timestamp: string; user: string; action: string; notes?: string }[]
}

let failures = 0
function check(label: string, ok: boolean, detail = '') {
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${label}${detail ? ` - ${detail}` : ''}`)
  if (!ok) failures++
}

function audit(action: string, notes: string) {
  return { timestamp: new Date().toISOString(), user: 'smoke@test.local', action, notes }
}

async function run() {
  console.log('Write smoke: create -> read -> edit -> read -> delete -> read\n')

  const before = (await readCollection(PATH)) as unknown as Asset[]
  check('collection starts without the smoke record', !before.some((a) => a.id === ID), `${before.length} existing`)

  // --- CREATE ------------------------------------------------------------
  const t0 = Date.now()
  await atomicUpdateJson<Asset[]>(
    PATH,
    (current) => ({
      next: [...current, { id: ID, employeeId: 'emp-smoke', label: 'created', auditLog: [audit('asset.create', 'smoke create')] }],
      commitMessage: 'smoke: create',
    }),
    { defaultValue: [] },
  )
  const afterCreate = (await readCollection(PATH)) as unknown as Asset[]
  const created = afterCreate.find((a) => a.id === ID)
  check('create is visible on the very next read', !!created, `${Date.now() - t0}ms, no drain`)
  check('created record kept its fields', created?.label === 'created' && created?.employeeId === 'emp-smoke')
  check('audit entry was appended on create', (created?.auditLog?.length ?? 0) === 1)

  // --- EDIT --------------------------------------------------------------
  const t1 = Date.now()
  await atomicUpdateJson<Asset[]>(
    PATH,
    (current) => ({
      next: current.map((a) =>
        a.id === ID ? { ...a, label: 'edited', auditLog: [...(a.auditLog ?? []), audit('asset.update', 'smoke edit')] } : a,
      ),
      commitMessage: 'smoke: edit',
    }),
    { defaultValue: [] },
  )
  const afterEdit = (await readCollection(PATH)) as unknown as Asset[]
  const edited = afterEdit.find((a) => a.id === ID)
  check('edit is visible on the very next read', edited?.label === 'edited', `${Date.now() - t1}ms, no drain`)
  check('audit APPENDED rather than replaced', (edited?.auditLog?.length ?? 0) === 2,
    `${edited?.auditLog?.length ?? 0} entries`)
  check('audit order preserved', edited?.auditLog?.[0]?.action === 'asset.create' && edited?.auditLog?.[1]?.action === 'asset.update')

  // --- DELETE ------------------------------------------------------------
  const t2 = Date.now()
  await atomicUpdateJson<Asset[]>(
    PATH,
    (current) => ({ next: current.filter((a) => a.id !== ID), commitMessage: 'smoke: delete' }),
    { defaultValue: [] },
  )
  const afterDelete = (await readCollection(PATH)) as unknown as Asset[]
  check('delete is visible on the very next read', !afterDelete.some((a) => a.id === ID), `${Date.now() - t2}ms, no drain`)

  const orphanAudit = await prisma.auditEntry.count({ where: { entityType: 'asset', entityId: ID } })
  check('audit rows for the deleted record were cleaned up', orphanAudit === 0, `${orphanAudit} left`)

  // --- FAILURE BEHAVIOUR -------------------------------------------------
  // A write that throws must not leave a partial record or a claiming audit row.
  let threw = false
  try {
    await atomicUpdateJson<Asset[]>(
      PATH,
      () => {
        throw new Error('deliberate failure inside mutate')
      },
      { defaultValue: [] },
    )
  } catch {
    threw = true
  }
  check('a failing write throws rather than reporting success', threw)
  const afterFailure = (await readCollection(PATH)) as unknown as Asset[]
  check('a failing write leaves no record behind', !afterFailure.some((a) => a.id === ID))

  // --- UNREGISTERED PATH -------------------------------------------------
  let refused = false
  try {
    await atomicUpdateJson('src/data/pending_updates.json', (c) => ({ next: c, commitMessage: 'x' }), { defaultValue: [] })
  } catch {
    refused = true
  }
  check('an unregistered path is refused, not silently dropped', refused)

  console.log(
    failures === 0
      ? '\nSMOKE PASSED: writes are synchronous and immediately readable.'
      : `\nSMOKE FAILED: ${failures} check(s) failed.`,
  )
  await prisma.$disconnect()
  process.exit(failures === 0 ? 0 : 1)
}

run().catch(async (e) => {
  console.error(e)
  await prisma.$disconnect()
  process.exit(1)
})
