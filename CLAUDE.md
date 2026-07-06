# GSL HR System — agent guide

Written for future Claude sessions. Keep short, current, opinionated.

## What this is

Internal HR system for GSL (EdTech in Mumbai): hiring pipeline, employee records, onboarding, exits. Fork-in-spirit of `gsl-mou-system` — same architecture, standards, team. **Single-tenant, GSL-only.** Company identity (name, logo, GSTIN, registered address, PAN, CIN, signatory details) lives in `config/company.json`; every templated string and UI chrome reads from that config. If Mafatlal Group bites later, converting single-tenant → multi-tenant is a known 1-2 week migration (add `tenantId`, backfill `gsl`, scope queries) — we'll pay that tax when the pitch is real, not now.

## Status

Phase 1 scaffold landed. Planning via the gstack cycle is the immediate next step — see `docs/` once populated by `/office-hours` etc.

## Stack

- Next.js 14.2.x App Router, TypeScript strict (`noUncheckedIndexedAccess`, `strict`)
- Tailwind v3 extending `src/styles/tokens.css`
- Lucide icons
- `docxtemplater` + `pizzip` for offer / appointment / relieving letter generation
- Data in `src/data/*.json`, writes queued through the GitHub Contents API (see MOU's `src/lib/pendingUpdates.ts` — reuse verbatim)

## Non-negotiables (inherited from MOU, paid-for-in-blood)

- **No `fs.writeFile` to `src/data/*` from serverless runtime.** Every write goes through the queue writer. Vercel filesystem is read-only in prod; even if it wasn't, we need auditability.
- **`outputFileTracingIncludes` lives under `experimental:` in `next.config.mjs`.** Next 14.2.x silently drops it at top-level; Next 15 silently drops it under `experimental`. We're on 14 — it stays nested. Do not move.
- **`vercel.json` `ignoreCommand` matches `^chore\(queue\):` on the subject line only**, never body substring. Queue commits skip Vercel deploys to stay under Hobby-tier quota.
- **Sync bot runs on a self-hosted Windows runner**, hourly cron IST business hours only, with an xlsx mtime guard to skip no-op runs. See `.github/workflows/sync-and-deploy.yml`.
- **Queue entry shape**: `{id, queuedAt, queuedBy, entity, operation, payload}`.
- **Per-entity `auditLog[]`**: `{timestamp, user, action, before, after, notes}`. Every write appends.

## Domain rules

- **British English.** Organise, analyse, colour, behaviour, recognise.
- **Indian context.** Currency Rs with Indian comma grouping (12,34,567). Lakh and crore where natural.
- **Never emdash** (—). Use a hyphen or a colon instead.
- **WCAG 2.1 AA.** 44px touch targets, 4.5:1 contrast minimum, focus rings, skip-to-content, ARIA landmarks. Axe-core in CI with a shrinking baseline.

## Auth model (different from MOU)

MOU uses single-user basic auth. HR has real users and candidates:

- **Staff accounts**: `users.json` queue-managed. bcrypt hashes, JWT httpOnly cookies, 7-day expiry, refreshed on activity. Roles: Admin, HR, HOD, Leadership.
- **Candidate access: magic link + session cookie.** First visit: candidate receives a signed HMAC magic link (single-use, 15-minute expiry). Server validates and exchanges the link for an httpOnly SameSite=Strict session cookie scoped to that candidate's record, 30-day expiry, rolling refresh on activity. Return visits: cookie active lands in portal. Cookie expired lands on "check your email for a fresh link" page; we issue a new magic link. The same `GSL_SNAPSHOT_SIGNING_KEY` HMAC signs both. No passwords, no accounts.

## Resume file paths

All resume files live under one of two roots:

- `data/resumes/**` — live data (uploads, applications, future imports)
- `onedrive-data/seed/resumes/**` — legacy 156-resume seed corpus, immutable

Subdirectory structure under `data/resumes/` is informational, not enforced by the reader. Suggested organisation:

- `data/resumes/uploads/[YYYY]/[MM]/[uuid].pdf` — staff or self-upload (via `buildResumeRepoPath`)
- `data/resumes/applications/[YYYY]/[MM]/[uuid].pdf` — public `/careers` apply (via `buildApplicationResumePath`)
- `data/resumes/imports/[batch-id]/[uuid].pdf` — future bulk imports

The reader (`/api/resumes/[candidateId]`) does NOT need updates when new subdirectories are added. It validates that the resolved real path stays within one of the two roots, using `path.resolve` + `fs.realpathSync` to defeat `..` traversal, absolute path injection, and symlink escape. See `src/lib/resumePath.ts:assertInsideResumeRoot`.

Adding a brand-new top-level root requires:
(a) appending to `RESUME_ROOTS` in `src/lib/resumePath.ts`
(b) updating `outputFileTracingIncludes` in `next.config.mjs`

## Data boundaries

- **Resumes** stay in our system — small, text-searchable, the core repository value we're building.
- **Videos** are Drive / OneDrive links only, never uploaded. Candidate records video, uploads to their own Drive / OneDrive, sets "anyone with link can view", pastes the URL. Reviewers click through. URL validator accepts `drive.google.com`, `docs.google.com`, `1drv.ms`, `onedrive.live.com`, `sharepoint.com`. Rationale: storage, bandwidth, biometric-PII compliance.
- **AI is copy-paste, not API.** HR uses their own Claude accounts. We ship a prompt library at `docs/claude-prompts/*.md` (resume parsing, JD drafting, interview summaries). HR pastes the prompt + data into their Claude chat, pastes the structured output back. Zero API keys in our app, zero billing exposure.

## Environment variables

Set in Vercel (Anish will add when ready):

- `GSL_QUEUE_GITHUB_TOKEN` — PAT for the Contents API queue writer. Reusing MOU's PAT for now; may need to scope tighter.
- `GSL_SNAPSHOT_SIGNING_KEY` — `openssl rand -hex 32`. Also used for candidate magic-link HMACs.
- `GSL_JWT_SECRET` — `openssl rand -hex 32`. Staff JWT signing.

## Roles

- **Admin** — Anish. Full access.
- **HR** — Shruti, Riddhi. Daily ops.
- **HOD** — Manali (Academics), Shashank (Ops / STEM), Vishwanath (Premium Sales), others TBC. Their role's pipeline + rubric only.
- **Leadership** — Ritu, Ameet, Jesal. Dashboard read-only.
- **Candidate** — external, magic-link scoped.

## Pipeline (role-configurable)

Each role's pipeline stages live on the role record as `pipelineStages: Stage[]`. Default ordering:

`Sourced → Submitted → Shortlisted → AssessmentSent → AssessmentDone → VideoSent → VideoDone → HODRoundScheduled → HODRoundDone → HRRoundScheduled → HRRoundDone → Offered → OfferAccepted → DocsCollected → Joined`

Roles may override the middle section (for example: adding a Final Round, CEO Round, or Technical Panel, or reversing HOD and HR). The engine iterates `role.pipelineStages`, not a global hardcoded enum. This is how HR's data actually behaves — HOD-first for academics, HR-first for some premium sales hires. Hardcoding would break real cases immediately.

**Terminal states (global, never role-scoped):** Rejected, OnHold, NotInterested, Withdrawn, Joined.

Interim states that are also visible in the Kanban but aren't terminal: Offered, OfferAccepted, DocsCollected.

## Candidate source enum (matches `Hiring_Status` Q1 Source column)

Naukri, Referral, Educohire, Careerchoice, HRTeam, Application, CSS, Other.

## gstack skills (planning + review workflow)

`/office-hours` → `/plan-ceo-review` → `/plan-eng-review` → `/plan-design-review` (twice — internal surfaces, then candidate-facing) → build → `/review` → `/ship`.

Plan docs: `plans/anish-[track]-[phase]-[date].md` (same naming as MOU).

## Reference repo

MOU lives at `C:\Users\anish\Projects\gsl-mou-system`. Reuse `src/lib/pendingUpdates.ts`, `src/lib/templates.ts`, `.github/workflows/sync-and-deploy.yml` verbatim where applicable.

## Phase 4 — HR Operations module (landed 2026-05-09)

Second top-level area in the app, additive to recruitment. Sidebar has been split into Recruitment (navy) + HR Operations (orange #F39C50) + Admin sections. New surfaces:

- `/employees` — extended with HR-Ops fields (workPattern, employmentStatus, locationType, leaveBalance, leaveYearStart). Migration script at `scripts/migrate_employee_muster.ts` is idempotent and pulls from `phase-4-hrops-inputs/Employee_Muster_v2.xlsx`.
- `/admin/taxonomy` — admin Locations + Departments management; rename/merge cascades through employees in one commit, metadata moves in a second.
- `/holidays` — 2026 calendar (11 mandatory + 4 optional from `phase-4-hrops-inputs/Holiday_Calendar_2026.pdf`). HR can add/edit/delete and record per-employee optional picks (default budget: 2/year).
- `/roster` — expected-presence calendar from work patterns, holidays auto-removed. **No exception logging in Phase 1** per Riddhi's explicit ask; Phase 4 attendance handles that.
- `/employees/[id]/documents` + `/documents` — document repository, gated to Admin + HR + allowlisted Leadership (env: `GSL_DOCUMENT_VIEWERS=ameet@...`). Reporting Managers must NOT see.
- Probation tracking: 6-month default from joining date; badges on /employees, confirm + extend actions on /employees/[id].

### Phase 4 defaults locked at land (review/adjust as Riddhi runs into them)

- **Optional holiday budget**: 2 picks/year per employee (`OPTIONAL_HOLIDAY_BUDGET_PER_YEAR` in `src/lib/types.ts`).
- **Hybrid-2day default office days**: Academics + STEM & Training = Mon+Thu, all others = Tue+Thu. Per-employee override field exists but no UI yet (see TODOS.md).
- **Probation default**: 6 months from `dateOfJoining`. The resolver in `src/lib/probation.ts` accepts a `months` param so per-employee extensions land cleanly.
- **PHM (chairman, MTPL/220)**: not in muster as a real employee; reportingManagerId resolves to null; placeholder employee record kept with empty fields.
- **Ameet/Amit Zaveri (CEO, MTPL/014)**: name spelling drift in source data. Aliased explicitly in `scripts/migrate_employee_muster.ts` so the 11 reports-to-Ameet employees resolve to MTPL/014's id.
- **Office vs remote-field locations**: Mumbai + Kolkata are offices. Bangalore is flagged remote-field "for now" per Riddhi; promote via `/admin/taxonomy` when an anchor space opens.
- **Demonstration & Support** department: flagged for Riddhi to confirm canonical home (probably Operations or Sales).
- **Document viewers**: HR + Admin always; Leadership only via the `GSL_DOCUMENT_VIEWERS` env var (comma-separated emails). HOD is hard-blocked (Reporting Manager rule).
- **Document storage path**: `data/hr-documents/[employeeId]/[uuid].pdf`. Single-root traversal-guard via `assertInsideHrDocumentsRoot`. Mirrors the resume reader pattern. To add a new top-level root, append to that helper AND to `outputFileTracingIncludes` in `next.config.mjs`.
- **Roster exception logging**: NOT shipped in Phase 1. Riddhi's email-acknowledgement workflow proposal is deferred to Phase 4 attendance for the same reason.

### Apply runner additions

`scripts/apply_queue.py` now handles two new employee.update operations:
- `probation.confirm` — sets `confirmationDate` + `employmentStatus = 'Confirmed'`
- `probation.extend` — pushes `confirmationDate` forward, keeps `employmentStatus = 'Probation'`, requires reason in audit notes
- `employee.profile.update` — whitelisted fields: title, phone, location, workPattern, locationType, reportingTo, reportingManagerId, address, personalEmail, gender, maritalStatus

Other Phase 4 mutations (taxonomy, holidays, documents, onboarding tasks, offboarding tasks, exit interviews, F&F settlements, assets) write directly via `atomicUpdateJson` rather than the queue — admin operations land rare and fine to ship one commit per edit.

## Phase 4 — Phases 3 + 4 (Leave + Attendance + Analytics + Alerts, landed 2026-05-09)

### Leave management (Phase 3)
- 12 casual + 12 sick = 24 days/year per employee. April 1-March 31 leave year. No carry-forward, no encashment, no sandwich rule (Riddhi).
- Pure helpers in `src/lib/leave.ts`: `computeTotalDays()` walks every day per work pattern (office-5day skips Sat/Sun, trainer-6day skips Sun, hybrid-2day only the configured 2 weekdays, field skips Sun, remote skips Sat/Sun); holidays never count; half-day = 0.5.
- LOP overflow handled at apply-time: if applying days > balance, the API returns 409 with `requiresLOPConfirmation`; client confirms and the overflow lands as `lossOfPayDays` on the application.
- Mid-year joiners get prorated entitlement.
- `/leave` HR/Admin/Leadership overview (HOD scoped to direct reports). `/employees/[id]/leave` per-employee balance + apply form (HR-mediated) + history. Sidebar Leave entry now active.
- Roster auto-marks "On Leave" cells from approved leaves — no separate attendance write needed.
- Self-service portal: API ready (`/api/admin/leave/apply` accepts self-applies for HOD; the employee role + portal page lands when employee accounts ship).
- `DEFAULT_LEAVE_FLOW` env var ('hr-mediated' default; 'self-service' when employee accounts ship). API works for both.
- Full-year balance integration test: 12 checkpoints, rupee-perfect (`leaveBalanceFullYear.integration.test.ts`).

### Attendance exception tracking (Phase 4)
- "System assumes everyone present unless marked otherwise." HR logs only divergent days. No acknowledgement loop.
- Exception types: `late | half-day | absent | work-from-home | on-field | holiday-worked`. `on-leave` and `holiday` auto-derive from leaves + calendar — never stored.
- `/attendance` calendar with click-to-log, bulk-mark across multiple employees, filters by department/location/month.
- Permissions: Admin + HR write; Leadership read all; HOD read only their direct reports.

### Analytics (Phase 4)
- `/analytics` (Admin + HR + Leadership; HOD blocked). Five widgets: Headcount + 12-month trend; Attrition (last 90 days, by dept, top reasons, avg tenure); Attendance (% present, exceptions, late-by-DOW heatmap); Leave utilisation + year-end projection + balance distribution; HR Ops metrics (avg days to onboard, on-time tasks %, document compliance %, open offboarding tasks).
- Pure aggregation helpers in `src/lib/analytics.ts` — easy to unit-test.
- Full-page CSV export.
- PDF export deferred to backlog.

### Automated alerts (Phase 4)
- Daily 9am IST cron (`30 3 * * *` UTC) at `.github/workflows/daily-alerts.yml`. Calls `/api/cron/alerts` with `x-gsl-cron-token: GSL_ALERT_CRON_TOKEN`.
- Six categories: document-expiry (30/14/7d), probation-review (7d before), onboarding-overdue (3+ days), offboarding-lwd (14d before), leave-pending-24h, daily-hr-digest.
- Idempotency: each alert has a stable `triggerKey` keyed on (category, target, window, fire-date). `alert_log.json` records every send. Same key never fires twice.
- Email delivery via existing `deliverEmail()` (Resend if `RESEND_API_KEY` set; queue fallback otherwise).
- `/admin/alerts/preferences`: HR reads, Admin edits. Per-category enable/disable, global kill switch, extra-recipient list. Last-25 fired alerts log surfaced inline.

### Testing-vs-production access defaults

**Defaults are OPEN.** The system ships in testing mode so Anish + Ameet + Ritu + Jesal can poke every surface without anyone configuring env vars first. Production lockdown is one or two env vars away — no code change, no rebuild needed beyond the env flip.

Env vars currently defaulted to "open" when unset:

| Env var | Code default when unset | Effect when set |
|---|---|---|
| `TESTING_OPEN_ACCESS` | treated as `"true"` (open) | only `"false"` narrows; everything else stays open |
| `GSL_DOCUMENT_VIEWERS` | every Leadership user is in the allowlist | only listed emails get into Leadership doc-view |
| `GSL_INTERVIEW_VIEWERS` | every Leadership user is in the allowlist | only listed emails get into Leadership interview-view |

In-system admin settings (no env var needed):

| Setting | Default | Where to flip |
|---|---|---|
| Leave flow | `hr-mediated` (per Riddhi's preference) | Admin opens `/admin/alerts/preferences` and toggles. Persists in `src/data/system_settings.json`. |

**To lock down for production**, set these on Vercel and redeploy (or just flip the env vars — no rebuild needed since they're read at request time):

```
TESTING_OPEN_ACCESS=false
GSL_DOCUMENT_VIEWERS=ameet.z@getsetlearn.info,ritu@...,jesal@...
GSL_INTERVIEW_VIEWERS=ameet.z@getsetlearn.info
```

The accompanying test file (`testingOpenAccess.test.ts`) pins the contract — both default-open and production-lockdown postures — so the gate cannot drift unintentionally.

**Permission gates that DO NOT relax regardless of `TESTING_OPEN_ACCESS`** — these are role-correctness, not access-correctness:

- **HOD never sees exit-interview content**, even for their direct reports. `canViewExitInterview` returns false for HOD always.
- **Reporting Manager visibility scoping.** HOD only sees onboarding/offboarding tasks where they are the assignee or the employee's reporting manager. `canUserSeeTask` / `canUserSeeOffboardingTask` enforce this regardless of the flag.
- **Sales / Operations / Premium-Sales roles cannot reach HR Ops at all.** Today the staff role enum is `Admin | HR | HOD | Leadership`; once new roles get added in a wider RBAC pass, the HR Ops page guards (`if (!isHrOrAdmin && !isLeadership && !isHod) redirect('/')`) already exclude them.
- **Edit gates stay HR/Admin-only.** Leadership can VIEW documents + exit interviews + leave under the testing default, but cannot edit/upload/delete/approve. `canEditEmployeeDocuments`, `canEditExitInterview`, `canApproveLeave` always return false for Leadership.
- **HOD self-approval blocked.** A HOD cannot approve their own leave application even when they are nominally their own reporting manager.
- **Document hard-delete is Admin-only**, leave hard-delete is Admin-only, asset delete is HR/Admin-only.

The reactivation signal for production lockdown: Riddhi confirms her testing pass is complete and access should be restricted. Anish sets the three env vars on Vercel — no code edit, no commit.

### New Phase 3+4 env vars

- `TESTING_OPEN_ACCESS` — see above. Defaults open.
- `GSL_DOCUMENT_VIEWERS` — see above. Defaults open.
- `GSL_INTERVIEW_VIEWERS` — see above. Defaults open.
- `GSL_ALERT_CRON_TOKEN` — secret the cron endpoint expects in `x-gsl-cron-token`. Same value goes in the GitHub Actions repo secret of the same name + `ALERTS_URL` (e.g., `https://hr.gsl/api/cron/alerts`).
- `RESEND_API_KEY` — pre-existing. When unset, alerts fall back to the queue log (dev-friendly).

### Phase 3+4 defaults locked at land

- Leave entitlement: 12 casual + 12 sick = 24/yr per employee, all roles.
- Leave year: April 1 to March 31.
- No carry-forward, no encashment, no sandwich rule.
- Probation alert window: 7 days before end (matches Phase 1 probation badge math).
- Document expiry windows: 30 / 14 / 7 days before.
- Onboarding overdue threshold: 3+ days past due.
- Offboarding LWD pre-warning: 14 days.
- Leave manager-action SLA: 24 hours before HR escalation.
- Attendance: exception-based only. No "everyone marks present daily" acknowledgement (deferred per Riddhi).

## Phase 4 — Phase 2 (Onboarding + Offboarding + Assets, landed 2026-05-09)

Three new modules complete the employee lifecycle:

### Onboarding
- 16 default task templates spanning pre-joining, day-1, week-1, and probation milestones (`src/data/onboarding_task_templates.json`). Categories: Documentation, IT & Assets, Workplace, HR Formalities, Manager Tasks. All flagged best-practice for Riddhi to edit.
- Per-employee tasks live in `employee_onboarding_tasks.json`. Generation is idempotent and skips employees > 6 months past joining.
- `/onboarding` (overview, scoped to RM for HOD), `/employees/[id]/onboarding` (per-employee checklist with inline edit), employee detail "Onboarding" widget with progress bar.

### Offboarding
- 12 default task templates pegged to either notice-start + offset OR LWD - daysBefore (`pegToLwd` flag). Triggers on `employmentStatus → On Notice` or `Exited`. Generation accepts noticeStartDate + lastWorkingDay.
- Exit interview form + F&F settlement form on `/employees/[id]/offboarding`.
- Exit interview confidentiality: HR + Admin can submit/edit; Leadership can read ONLY when on `GSL_INTERVIEW_VIEWERS` env allowlist; HOD never sees the interview content even for their direct reports. F&F settlement is HR/Admin-only — no Leadership view at all (will open up when the Accounts role lands).

### Assets
- Lightweight inventory: laptop / ID card / SIM / email account / other.
- `/admin/assets` (Admin + HR write, Leadership read), per-employee section on the detail page.
- Used by the `off-asset-return` offboarding task as the visual checklist surface.

### Phase 2 defaults locked at land

- **Probation review**: ob-probation-review template fires at day 180 (matches the Phase 1 probation badge math).
- **Onboarding pre-joining tasks** auto-mark N/A when generated for back-dated joiners (we already passed those due dates).
- **Onboarding skipped** for employees > 6 months past joining.
- **Offboarding ff-settlement** dueDate = LWD + 30 days.
- **Offboarding leave encashment** defaults to 0 per Riddhi's no-encashment policy (form field exists for future).
- **IT / Accounts roles** don't exist yet; both fall back to first active HR user. Documented in `src/lib/onboardingTasks.ts:resolveAssignee`. Real RBAC pass logged in TODOs.
- **Exit interview viewers**: env `GSL_INTERVIEW_VIEWERS` (comma-separated emails). Without it, only Admin + HR see interview content.

## Authoritative planning docs (read these for the "why")

Phase 1 is specified across four living documents in this repo. When anything about scope, premises, architecture, or visual design is ambiguous, these files are the source of truth, not this CLAUDE.md:

- **`docs/plans/phase-1-design.md`** — design doc from `/office-hours` (2026-04-23) plus internal-surfaces design decisions from `/plan-design-review` Pass 1. Problem statement, demand evidence, status quo, premises P1-P13, three approaches considered, recommended approach, success criteria, the Shruti-shadow assignment, internal-surface design decisions (IA, interaction states, AI slop guardrails, responsive/a11y). Captures the "why we're building what we're building" and the "how the internal surfaces look."
- **`docs/plans/phase-1-ceo-review.md`** — CEO plan from `/plan-ceo-review` SELECTIVE EXPANSION (2026-04-23). Vision (10x check + platonic ideal), nine cherry-picks scored, seven accepted into Phase 1 scope (CP1 portal depth, CP2 mobile-first, CP3 in-app prompt drawer, CP4 JSON validator, CP5 quality floor, CP7 HOD rubric, CP8 self-withdraw), two deferred with explicit reactivation triggers. Captures the "what we're building and how ambitious."
- **`DESIGN.md`** — design system from `/design-consultation` (2026-04-23). Two-audience design language (internal ops + candidate-facing), palette, typography (Montserrat + Open Sans + Fraunces for candidate moments), badge vocabulary, component additions, motion inventory, copy voice, accessibility commitments, AI slop blacklist. Every visual or UI decision calibrates against this file — not against this CLAUDE.md or any individual component's judgement.
- **`docs/TODOS.md`** — deferred items with reactivation signals. Each entry states the specific observation that would promote it to active work (e.g., "30 days after launch, leadership opens /dashboard ≥ 2× per week → build CP6 expanded dashboard").
- **`docs/RUNBOOK.md`** — operational playbook. Common incidents (queue stuck, magic link expired, offer letter template missing, etc.) with check → cause → fix. Written 2026-04-23 from `/plan-eng-review` Section 8; populated as incidents happen.

These five docs replace the need for Claude to re-derive scope, visual language, or operational posture from this CLAUDE.md. Read them first, this file second.

### Onboarding new environments

- Copy `.env.example` → `.env.local` and fill in values. Production values live in Vercel env vars.
- Copy `config/company.json.example` → `config/company.json` and fill with real GSL details. This file is COMMITTED (it's configuration, not secrets).

## Design System

Always read `DESIGN.md` before making any visual or UI decisions. All font choices, colors, spacing, aesthetic direction, and copy voice are defined there. Do not deviate without explicit user approval. In QA mode, flag any code that doesn't match `DESIGN.md`.

<!-- cc-brain-project:begin -->
## Working memory (Obsidian vault), read first, persists across sessions
@C:/Users/anish/obsidian/cc-brain/Projects/gsl-hr-system/_index.md

Memory protocol: read state.md before starting; append to decisions.md / learnings.md inline as you go; update state.md + write a session log at the end of every work batch.
<!-- cc-brain-project:end -->
