# Postgres migration notes

Status as of 2026-08-08. The application still runs entirely on `src/data/*.json`.
Nothing in production has changed.

## Where the database lives

| | |
|---|---|
| Neon project | `gsl-ops-prod` (`restless-tree-12035988`) |
| Branch | `br-dark-lake-ao5s83cr` |
| Database | `gsl_hr` |
| Role | `gsl_hr_owner` |
| Region | `aws-ap-southeast-1` |

The branch matters. `gsl-ops-prod` has three branches and two are named
`production`. The default branch (`br-lively-field-aodf37on`) is **archived**
and is not what the ops app uses. `br-dark-lake-ao5s83cr` is the live one, which
was confirmed by matching its endpoint host against the ops app's own
`DATABASE_URL` rather than trusting the branch name.

`DATABASE_URL` is the pooled endpoint and is what the app runtime uses.
`DIRECT_URL` is unpooled and is what migrations and admin scripts use. Pointing
a migration at the pooled URL fails with `cached plan must not change result
type` after any column type change.

## Accepted risk: no cross-database isolation

**The ops credential can read HR salaries, F&F settlements and exit interviews.
The HR credential can read all 41 ops tables.** This was measured, raised, and
accepted by Anish on 2026-08-08.

It is not a configuration mistake and no grant fixes it:

- `REVOKE CONNECT ON DATABASE gsl_hr FROM PUBLIC` was applied and does hold
  against `PUBLIC`.
- Neon additionally grants `neon_superuser` its own `CONNECT` on every database
  in the project. Both `gsl_hr_owner` and `neondb_owner` are members of
  `neon_superuser`, so both inherit it.
- Both roles also carry `bypassrls`, so row-level security would not help
  either, and `createrole`, so either could re-grant itself anything.
- `has_database_privilege` reports `true` in both directions.

Re-run the evidence at any time:

```
node scripts/db/check_isolation.mjs    # tries the connections for real
node scripts/db/check_membership.mjs   # explains why, from role membership
```

The only construction that satisfies the original requirement is a **separate
Neon project**, which gives isolation by construction with no grants to
maintain. That was offered and declined in favour of staying in one project.
If the position is ever revisited, the schema, migration and parity scripts are
portable: change the two URLs and re-run.

## Scripts

| Script | Purpose |
|---|---|
| `scripts/db/profile_json.mjs` | Profile the real JSON so the schema is derived from data, not only types |
| `scripts/db/migrate_json_to_pg.ts` | Idempotent, transactional migration. Drains the queue first |
| `scripts/db/verify_parity.ts` | The gate. Round-trips every record and deep-compares |
| `scripts/db/check_isolation.mjs` | Attempts the cross-database connections |
| `scripts/db/check_membership.mjs` | Explains the result from role membership |
| `scripts/db/apply_isolation.mjs` | Applies the revokes that do hold |

## What the data said that the types did not

Derived by profiling rather than reading `types.ts`, and each of these would
have shipped silently:

- `exit_processes`, `exit_interviews` and `exit_handovers` carry **no `id`**.
  All three are keyed on `employeeId`, which is unique in each (31, 24, 28).
- `employees.age` is a **float** (49.8, 50.5, 43.3). Modelling it as `Int`
  truncated 82 of 133 records.
- **80 candidates have no `status` field.** Defaulting them to `Active`
  invented data that was never there.
- `roles.closeNotes` is `null` in all 18 records despite being typed `string`.

## Schema shape

Scalars the UI filters, sorts or joins on are real indexed columns. Genuinely
document-shaped sub-structures (`leaveBalance`, the `exit` block, exit step
payloads, `rubric`, `pipelineStages`) stay as `Json` because they are read and
written whole. Every model also carries an `extra` `Json` column holding any
field not modelled explicitly, so nothing can be dropped for tidiness, and the
parity gate proves it by rebuilding the original object.

Inline `auditLog[]` arrays became rows in one append-only `audit_entries` table
keyed on `(entityType, entityId)` with a `seq` column, so ordering survives even
where several entries share a timestamp. Git history was the implicit audit
trail; Postgres has no equivalent, so it is explicit now.

`applied_updates.json` and `failed_updates.json` are preserved in
`queue_archive` so the retired queue's history outlives the queue itself.

## Current verified state

```
907 records compared, 11,417 fields, 1,568 audit entries, 593 archived queue rows
PARITY EXACT, and still exact after a second migration run (idempotency).
```

## What remains

The application has **not** been migrated. `src/lib/data.ts` still reads JSON
synchronously and every write still goes through the queue.

The remaining work, and why it is large: every loader in `src/lib/data.ts` is a
synchronous `readFileSync`. Postgres is asynchronous, so all 19 must become
`async`, and that cascades to every caller. The measured surface is **148 files
importing the loaders, 57 calling `atomicUpdateJson`, 48 calling
`enqueueUpdate`, across 98 route handlers and 58 test files.**

The saving grace is that `tsc` finds every one mechanically: a missed `await`
becomes a type error, so the refactor is compiler-guided rather than a
silent-breakage risk. It is still a large, invasive change to an app HR uses
daily, and it needs its own pass with the gates run at the end.

Do not remove the queue (`apply_queue.py`, `apply-queue.yml`,
`PendingWritesNotice`, the Sync now button) until that refactor lands and the
gates are green. Until then the queue is what makes writes work at all.

`src/data/*.json` stays in git as the rollback path regardless.
