# GSL HR System — Gate H2 write-surface audit

Performed 2026-05-13 against `48f1aec`. Inventory of every entity that
HR mutates, with verification of the write path (queue helper, validation,
toast, audit), and a triage of gaps into critical/workaroundable/Phase 1.1.

The HR system has shipped Phases 1-4 and a hotfix gate. Most write
surfaces are present and correct. The audit confirms which ones are
truly missing so this gate stays focused.

---

## Per-entity inventory

### Candidate

- **Read**: `/candidates`, `/candidates/[id]`, `/candidates/import`, `/careers/[roleId]` (public), portal pages.
- **Write surfaces**:
  - Paste-import (`PasteImportForm.tsx` → `POST /api/candidates/import-paste`) — bulk add.
  - Resume upload (`ResumeUpload.tsx` → `POST /api/candidates/[id]/resume`).
  - Inline edit (`CandidateEdit.tsx` → `POST /api/candidates/[id]`) — name, email, phone, source, notes, programmes.
  - Bulk archive (`CandidateList.tsx` → `POST /api/candidates/bulk` `{ type: 'archive' }`).
  - Unarchive (`UnarchiveButton.tsx` → `POST /api/candidates/[id]/unarchive`).
  - Bulk add-to-pipeline (`CandidateList.tsx` → `POST /api/candidates/bulk` `{ type: 'add-to-pipeline' }`).
  - Bulk log-email (`CandidateList.tsx` → `POST /api/candidates/bulk` `{ type: 'log-email' }`).
- **Verification**: every path enqueues via `enqueueUpdate`, shows honest toast (post-hotfix), audit logged on apply.
- **Status**: COMPLETE.

### Application (candidate × role)

- **Read**: `/roles/[id]` (Kanban), `/candidates/[id]`, `/dashboard`.
- **Write surfaces**:
  - Single stage transition (Kanban + candidate detail → `POST /api/applications/[id]/transition`) — forward, backward, reject with reason.
  - Bulk stage transition (Kanban bulk bar → `POST /api/applications/bulk-transition`).
  - Move between roles (Kanban → `POST /api/applications/[id]/move`).
  - Self-withdraw via portal (`POST /api/portal/withdraw/[applicationId]`).
  - Auto-advance on interview scheduled / offer sent / employee created.
- **Verification**: all enqueue, validate, log; undo within 5s built into `useStageTransitions.ts`.
- **Status**: COMPLETE.

### Role / Job opening

- **Read**: `/roles`, `/roles/[id]`, `/careers` (public list).
- **Write**: create (`/roles/new`), edit JD (`/roles/[id]` inline), status change (`/api/roles/[id]/status`), rubric (`/api/roles/[id]/rubric`).
- **Status**: COMPLETE.

### Interview

- **Read**: `/interviews`, candidate detail.
- **Write**: schedule (`/interviews/new` → `POST /api/interviews`), score (rubric).
- **Status**: COMPLETE.

### Offer

- **Read**: `/offers`, `/offers/[id]`.
- **Write surfaces** (`/api/offers/[id]/[action]` with action ∈ {approve, send, accept, decline, withdraw}):
  - Draft → `/offers/new` → `POST /api/offers`.
  - Approve, Send, Accept, Decline, Withdraw all wired in `OfferActions.tsx`.
  - Letter generation (`/api/letters/[id]/generate`) → audit log entry.
- **Verification**: enqueue, validate state-machine transition.
- **Gaps found**:
  - Decline action takes no reason. HR has no structured way to record "Compensation / Counter-offer / Personal / Other."
  - Accept action takes no acceptance details. No place to capture a negotiated CTC, the actual acceptance date (vs queue write time), or the expected join date — all of which need to flow into the employee record on activation.
  - No "Resend" affordance for Sent offers. If the candidate's email bounced or they ask for another copy, HR can only Withdraw + redraft.
  - Toast in `OfferActions.tsx:43` says "Will reflect everywhere within ~1 minute." — predates the universal Sync now widget; should match the post-hotfix copy.
- **Status**: COMPLETE for the happy path; missing the structured-reason and resend affordances (this gate).

### Letter (offer / appointment / relieving / experience / no-dues)

- **Read**: `/letters`, `/letters/[id]`.
- **Write**: generate via `POST /api/letters/[id]/generate` from a docxtemplater template.
- **Status**: COMPLETE.

### Employee (active)

- **Read**: `/employees` (post-hotfix: real-time search + dept filter), `/employees/[id]`.
- **Write surfaces**:
  - Activate from offer accept (`/employees/new?applicationId=…` → `POST /api/employees`).
  - Profile edit modal (`EmployeeProfileEdit.tsx` → `POST /api/employees/[id]/profile`) — title, phone, location, workPattern, reportingTo, address, personalEmail, gender, maritalStatus.
  - Salary structure (`SalaryStructureForm.tsx` → `POST /api/employees/[id]/salary-structure`).
  - Probation confirm/extend (`ProbationCard.tsx` → `POST /api/employees/[id]/probation`).
  - Documents upload (`/employees/[id]/documents`).
  - Onboarding tasks (`OnboardingChecklist.tsx`).
  - Offboarding tasks + exit interview + F&F (`/employees/[id]/offboarding`).
  - Leave applications (`/employees/[id]/leave`).
- **Verification**: all enqueue or use `atomicUpdateJson` for admin ops, audit logged.
- **Gaps found**:
  - No CSV export on `/employees`. Useful for Riddhi pulling a board pack.
  - No bulk profile edit. Workaroundable: edit one-by-one. (Defer.)
- **Status**: COMPLETE for daily flow; CSV export is a small win this gate.

### Exit / Offboarding

- **Read**: `/exits` (post-hotfix: exited list only), `/employees/[id]/offboarding`.
- **Write surfaces**:
  - Initiate exit (`ExitInitiator.tsx` on `/employees/[id]` → `POST /api/employees/[id]/exit`) — sets `employee.status='Exited'`, writes `employee.exit` block (LWD, reason, notes), generates offboarding tasks.
  - Offboarding task completion (`/employees/[id]/offboarding`).
  - Exit interview form (HR + Admin write; Leadership read if allowlisted; HOD never).
  - F&F settlement form (HR + Admin only).
- **Verification**: all enqueue; audit logged on apply.
- **Gaps found**:
  - **/exits has no "Initiate exit" CTA**. To create an exit, the user must already know to navigate to `/employees`, find the active employee, and scroll to the ExitInitiator section. From `/exits` there's no path. This is the user-perceived "the exits page is empty / where do I create one?" gap that maps onto Shruti's testing flow.
  - The directory `src/app/(staff)/exits/new/` exists empty (leftover scaffold).
- **Status**: write paths COMPLETE; discoverability missing (this gate).

### Onboarding

- **Read**: `/onboarding` (overview), `/employees/[id]/onboarding`.
- **Write**: per-task complete/edit; HR-mediated.
- **Status**: COMPLETE.

### Asset (laptop / ID card / SIM / email account / other)

- **Read**: `/admin/assets`, embedded section on employee detail.
- **Write**: full CRUD via `POST /api/admin/assets`. Used by `off-asset-return` offboarding task.
- **Status**: COMPLETE.

### HR Document

- **Read**: `/documents`, `/employees/[id]/documents`.
- **Write**: upload, edit metadata, delete (Admin hard-delete only).
- **Status**: COMPLETE.

### Leave

- **Read**: `/leave`, `/employees/[id]/leave`.
- **Write**: apply (HR-mediated default; self-service when env flips), approve, reject. Balance math + LOP overflow handling.
- **Status**: COMPLETE.

### Attendance

- **Read**: `/attendance`.
- **Write**: log exception (single + bulk-mark across employees), edit, delete.
- **Status**: COMPLETE.

### Holiday

- **Read**: `/holidays`.
- **Write**: add / edit / delete (HR), per-employee optional pick.
- **Status**: COMPLETE.

### Probation

- **Read**: badges on `/employees` + `/employees/[id]`.
- **Write**: confirm + extend with reason (`ProbationCard.tsx`).
- **Status**: COMPLETE.

### User / staff account

- **Read**: `/users` (Admin), `/account` (self).
- **Write**: create, edit, role assignment, password change.
- **Status**: COMPLETE.

### Department + Location (taxonomy)

- **Read**: `/admin/taxonomy`.
- **Write**: rename / merge (cascades through employees).
- **Status**: COMPLETE.

### Email log + outbound mail

- **Read**: `/emails` (per-template list), `/emails/[id]`.
- **Write**: log-send (`POST /api/emails/[id]/log-send`), bulk log-send via candidates list.
- **Status**: COMPLETE.

### Notifications

- **No in-app notification entity**. The system has:
  - `/alerts` page (cron-fired email digest, see `daily-alerts.yml`).
  - HOD email notification on stage transition into HOD-round stages.
- **Status**: NO in-app surface. Triage: defer (alerts cover the urgent fan-out, and Shruti hasn't asked for a bell).

### Dashboard

- **Read**: `/` (Home — attention feed), `/dashboard` (KPIs + stage/source distribution + per-role counts).
- **Status**: COMPLETE per CP6 deferral in `docs/TODOS.md`. Deeper breakdowns unlock once leadership uses regularly.

### Analytics

- **Read**: `/analytics` (5 widgets: headcount, attrition, attendance, leave, HR ops).
- **Status**: COMPLETE per CLAUDE.md.

---

## Triage

### Critical — build this gate

| # | Gap | Surface | Why critical |
|---|---|---|---|
| 1 | `/exits` has no "Initiate exit" path | New: list of active employees with quick "Initiate exit" link | Shruti can't discover the flow from the page that's literally called Exits |
| 2 | Offer decline takes no reason | `OfferActions.tsx` decline modal | Loses structured signal HR needs for source-effectiveness reporting |
| 3 | Offer accept captures no acceptance details | `OfferActions.tsx` accept modal | Acceptance date / negotiated CTC / expected join date all need to flow into the employee record |
| 4 | No resend offer | `OfferActions.tsx` for Sent | If candidate's email bounced, HR currently has to Withdraw + redraft |
| 5 | No CSV export on `/employees` | Button on filtered list | Riddhi needs occasional board-pack pulls |
| 6 | Offer toast doesn't mention Sync now | `OfferActions.tsx:43` | Predates the hotfix; consistency |

### Workaroundable — defer to BACKLOG

| # | Item | Workaround | Reactivation trigger |
|---|---|---|---|
| 7 | Bulk employee profile edit (dept/RM/location) | Edit one-by-one via existing modal | Re-org touches >5 employees in a week |
| 8 | In-app notifications + bell icon | `/alerts` page + email digests | Leadership asks for "where do I see my unread items at a glance?" |
| 9 | Dedicated `/reports/*` routes | `/analytics` already has 5 widgets | Riddhi asks for a report shape that doesn't fit the analytics widgets |
| 10 | Reverse employee deactivation | Admin edits JSON | First time someone marks the wrong employee as exited |
| 11 | Edit/correct probation confirmation | Admin edits JSON | First wrong-confirmation incident |
| 12 | Candidate merge UI | Archived-candidate suggestion path covers most | First HR-confirmed dup that needs structured merging |
| 13 | Interview / onboarding / document template CRUD UI | Admin edits JSON files | HR asks to add a new round / category / template |
| 14 | Resume application after rejection (resurrect) | Manual via candidate detail | Pattern emerges — candidates re-apply for new roles after rejection |

### True Phase 1.1 — keep on roadmap, no concrete trigger yet

- 15. Multi-tenant migration (per CLAUDE.md: 1-2 week pivot when Mafatlal Group gets serious).
- 16. Candidate self-service portal (currently magic-link only; build full auth when employee accounts ship).
- 17. Document expiry auto-rotate (alerts already exist; auto-issue replacement is Phase 2).

---

## Plan for this gate

Build items 1-6 from Critical. Add tests pinning each. Document items 7-14
in `docs/gate-h2/BACKLOG.md` with the reactivation triggers above so the
deferral is intentional.
