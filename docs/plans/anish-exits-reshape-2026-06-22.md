# Exit (offboarding) reshape + internal HR task board

Date: 2026-06-22. Author: Anish (via Claude). Track: HR-Ops. Status: building.

Two features in one PR. Both follow existing data-write, role-gate, and DESIGN.md patterns.

---

## Feature A — Exit cockpit

### Problem (from HR)
The exit flow is fragmented across `/exits` (handover board, navy Recruitment), `/offboarding`
(task overview, orange HR-Ops) and `/employees/[id]/offboarding` (tasks + exit interview + F&F).
Shruti: "completing the process on the site is tough" - too much page-hopping. Riddhi's real
process is six ordered steps, not the generic 12-task checklist.

### The six steps (the new default, editable, not a hardcoded enum)
1. Exit initiated - reason, resignation OR termination date, official last working day (LWD).
2. Handover - generate a pre-filled email to the reporting manager (Accounts + HR always CC'd),
   plus a checklist. Manual: copy-to-clipboard + mailto, no Outlook automation (deferred). RM
   confirms "go ahead" -> step complete.
3. No Dues / Notice Certificate - generate from the No Dues template (employee code, F&F figures +
   words Indian format, last drawn salary, pending items; five fixed contractual clauses are
   boilerplate). Signed BY the employee: "mark as signed" + note/attach the signed copy.
4. F&F settlement - record amount + payment confirmation (date / reference).
5. Relieving letter - generate from the Relieving template.
6. Experience letter - generate from the Experience template.

Steps are data-driven from `src/data/exit_step_templates.json` (editable like the existing
offboarding task templates) and instantiated per-employee onto an `ExitProcess` record. Each
template carries a `kind` the cockpit uses to render the right inline action. HR can mark any step
N/A and add a custom free-text step per process - real editability, same spirit as the existing
per-employee task edit.

### Data model
- `ExitStepTemplate` (`exit_step_templates.json`): `{ id, order, name, kind, isMandatory,
  description }`. `kind`: `initiate | handover | letter:NO-DUES-v1 | ff | letter:RELIEVING-v1 |
  letter:EXPERIENCE-v1 | custom`.
- `ExitProcess` (`exit_processes.json`, one per exiting employee): `{ employeeId, exitType,
  reasonForLeaving, resignationDate?, terminationDate?, lastWorkingDay, steps: ExitProcessStep[],
  completedAt, createdAt/By, auditLog[] }`.
- `ExitProcessStep`: `{ templateId, name, kind, status (Not Started|In Progress|N/A|Completed),
  data (kind-specific), notes, completedAt/By }`. `data` holds handover.rmConfirmedAt,
  noDues.{figures,words,lastDrawnSalary,pendingItems,signed,signedAt,signedCopyNote},
  ff.{amount,paymentDate,reference,paidAt}, letter.{issuedAt,issuedBy}.

### Writes / audit (non-negotiable)
All ExitProcess mutations go through `atomicUpdateJson` (NOT the queue) with a per-entity
`auditLog` entry `{timestamp,user,action,before,after,notes}` on every write - mirrors the existing
F&F / exit-interview routes. The employee `status -> Exited` flip stays on the existing
`exit.initiate` queue op (employees.json is queue-managed everywhere else; apply_queue.py already
handles it). No apply_queue.py change.

### Roster lifecycle
- Initiation flips `employee.status = 'Exited'` -> drops off the active `/employees` roster (existing
  behaviour) and onto the `/exits` board as an in-progress exit.
- When all mandatory steps are Completed/NA the process stamps `completedAt` -> the board groups it
  under "Alumni / Completed", out of the in-progress list. No auto-fire of letters; completion is
  derived from explicit per-step actions.

### Letters
Reuse `/api/letters/[id]/generate` (docxtemplater, config-driven signatory). The cockpit calls it
with the right template id + employeeId + values, downloads the .docx, then marks the step issued
via the step PATCH (explicit per-step action, no bulk close-all).
- `RELIEVING-v1.docx` - reused as-is (tokens already match: issueDate=todayLong, employeeName=name,
  designation, employeeCode, dateOfJoining=joiningDateLong, lastWorkingDay=lastWorkingDayLong).
- `NO-DUES-v1.docx` - patched to add a `{date}` placeholder; clauses already boilerplate.
- `EXPERIENCE-v1.docx` - authored fresh (none existed). Tokens: issueDate, salutationName,
  employeeName, designation, employmentFrom, employmentTo, and he/she + him/her + his/her derived
  from `employee.gender` via new `pronoun.*` defaultFrom keys.
- Signatory/legal entity/brand come from `config/company.json` (signatory updated to Amit Zaveri,
  Chief Executive Officer). The three Downloads source files were not present on this machine; the
  in-repo templates already carry GSL's real letter copy, so they are the source of truth and the
  real .docx can be dropped in later without code change.

### UI
- `/exits/[id]` - the cockpit: one page, all six steps inline, progress indicator, optimistic UI
  with honest saving/saved chips + `router.refresh()`. Exit interview kept as a separate
  HR-confidential section (not one of the six steps; HOD never sees it).
- `/exits` - reshaped board: Initiate picker (Admin/HR) + In-progress exits with live step progress
  + Alumni/Completed. Scoped: Admin/HR/Leadership see all (Leadership read-only), HOD only own
  reports. Moved to the HR-Ops orange section.
- Redirects: `/offboarding` -> `/exits`, `/employees/[id]/offboarding` -> `/exits/[id]`.
- Nav: HR-Ops "Offboarding" -> "Exits" (/exits); remove the duplicate Recruitment "Exits"; sidebar
  test updated.

### Migration
`scripts/migrate_exit_processes.ts` - idempotent. For each in-flight exit (status Exited or
employmentStatus On Notice, or with offboarding-task rows) create/merge an ExitProcess seeded with
all six steps, mapping old completion signals (employee.exit.relieving/experienceLetterIssued,
FFSettlement.paidAt, handover reviewed) onto step status WITHOUT clobbering anything already
Completed, and backfilling the new No Dues + F&F steps. Re-running never resets a Completed step.

---

## Feature B — Internal HR task board

Internal HR/admin tool (Admin/HR/HOD/Leadership; never employees/candidates). Tracks multi-stage,
multi-stakeholder tasks that stall waiting on other teams - status, owner, ordered sub-stages,
dependency (who it's pending with + why), blocker flag/note, optional due date, nullable next step,
and an activity log.

- Types: `HrTask`, `HrTaskStage`, status enum `Not started | In progress | Blocked | Waiting on
  input | Done`.
- Data: `hr_tasks.json` seeded with Riddhi's incentive-structure demo (prepare structure -> Ameet
  review -> collect targets/achievement from Pratik & Vishwanath -> finalise -> Accounts
  implementation -> communicate to team).
- Writes: `atomicUpdateJson` + per-entity auditLog (matches the offboarding/admin write path).
- API: `POST /api/hr-tasks`, `PATCH /api/hr-tasks/[id]`, admin `DELETE`.
- UI: `/hr-tasks` board grouped by status with filters (owner, blocked-only, stage) + `/hr-tasks/[id]`
  detail with inline edit + activity log. Optimistic UI, saving/saved chips. Create/edit = Admin/HR;
  HOD/Leadership read-only. HR-Ops orange section. British English, Indian number format, WCAG AA.

---

## Acceptance
- HR drives one exit end-to-end from `/exits/[id]`.
- Each of the three letters downloads a .docx with correct merge data + config signatory.
- Completed exits group to Alumni, off the active roster; in-progress on the board with live status.
- HOD/Leadership gates demonstrably unchanged (exit interview + F&F stay HOD-blind).
- Task board live on `/hr-tasks`, seeded demo visible day one.
- vitest + axe baseline green.
