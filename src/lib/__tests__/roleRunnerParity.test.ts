/*
 * Parity guard between the role edit API and the apply runner.
 *
 * THE DEFECT THIS EXISTS FOR (production, 2026-08-07):
 * Role writes are queue-mediated. `scripts/apply_queue.py`'s `role.*` branch
 * copies an explicit tuple of keys onto the record. Before this guard, that
 * tuple held neither `title` nor `department` nor `location` nor
 * `employmentType` - so a title edit would have been enqueued, reported as
 * saved by the UI, appended to the audit log, and then silently dropped by
 * the runner. No error anywhere.
 *
 * This test derives the runner's real capability from the Python SOURCE and
 * asserts it equals the TypeScript declaration, so the two cannot drift.
 * Adding a field to one side without the other fails the build.
 */

import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  ROLE_RUNNER_WRITABLE_FIELDS,
  ROLE_DETAIL_EDITABLE_FIELDS,
  ROLE_LIFECYCLE_FIELDS,
  ROLE_IMMUTABLE_FIELDS,
} from '../roles/editableFields'

const APPLY_QUEUE_PATH = path.join(process.cwd(), 'scripts', 'apply_queue.py')

/**
 * Pull the key tuple out of the runner's `role.*` branch.
 *
 * Normalises CRLF first: on Windows a `$`-anchored or `.`-based pattern
 * silently matches nothing because `.` cannot cross the `\r`.
 */
function readRunnerRoleFields(): string[] {
  const source = fs.readFileSync(APPLY_QUEUE_PATH, 'utf-8').replace(/\r/g, '')

  const branchIndex = source.indexOf('op.startswith("role.")')
  if (branchIndex === -1) {
    throw new Error(
      'Could not find the role.* branch in apply_queue.py. If it was renamed, update this test - do not delete it.',
    )
  }

  const forIndex = source.indexOf('for key in (', branchIndex)
  if (forIndex === -1) {
    throw new Error('Found the role.* branch but no `for key in (` tuple after it.')
  }
  const closeIndex = source.indexOf('):', forIndex)
  if (closeIndex === -1) {
    throw new Error('Found the role.* key tuple opener but no closing paren.')
  }

  const tupleBody = source.slice(forIndex + 'for key in ('.length, closeIndex)
  const fields = [...tupleBody.matchAll(/"([^"]+)"/g)].map((m) => m[1] as string)

  // Positive control: a parser that silently returns [] would make every
  // assertion below vacuously pass. "Clean" and "did not run" must differ.
  if (fields.length === 0) {
    throw new Error('Parsed zero fields from the role.* tuple - the parser is broken, not the runner.')
  }
  return fields
}

describe('role edit API / apply runner parity', () => {
  it('the runner writes exactly the fields TypeScript declares it writes', () => {
    const runnerFields = readRunnerRoleFields()
    expect([...runnerFields].sort()).toEqual([...ROLE_RUNNER_WRITABLE_FIELDS].sort())
  })

  it('every field the details editor accepts is one the runner will actually write', () => {
    const runnerFields = new Set(readRunnerRoleFields())
    const dropped = ROLE_DETAIL_EDITABLE_FIELDS.filter((f) => !runnerFields.has(f))
    expect(dropped, `these fields would be silently dropped by the runner: ${dropped.join(', ')}`).toEqual([])
  })

  it('the regression field itself is covered: title is writable', () => {
    // The literal field HR asked for, and the one whose absence caused the bug.
    expect(readRunnerRoleFields()).toContain('title')
  })

  it('identity fields HR asked for are all writable', () => {
    const runnerFields = new Set(readRunnerRoleFields())
    for (const field of ['title', 'department', 'location', 'employmentType']) {
      expect(runnerFields.has(field), `${field} must be writable by the runner`).toBe(true)
    }
  })

  it('lifecycle fields stay out of the details editor', () => {
    for (const field of ROLE_LIFECYCLE_FIELDS) {
      expect(ROLE_DETAIL_EDITABLE_FIELDS as readonly string[]).not.toContain(field)
    }
  })

  it('every immutable field carries a written reason, and none is also editable', () => {
    for (const [field, reason] of Object.entries(ROLE_IMMUTABLE_FIELDS)) {
      expect(reason.length, `${field} needs a real reason, not a placeholder`).toBeGreaterThan(20)
      expect(ROLE_RUNNER_WRITABLE_FIELDS as readonly string[]).not.toContain(field)
    }
  })
})
