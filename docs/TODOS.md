# TODOS

Running list of follow-up items. Newest entries on top. Each entry includes the reactivation signal — the specific observation that would trigger the work.

## Format

```
### <one-liner title>
- Added: YYYY-MM-DD
- Priority: P0 | P1 | P2 | P3
- Effort (human / CC): <estimate>
- Reactivation signal: <specific observation that promotes this to P1>
- Notes: <context, rationale>
```

---

## 2026-05-09 — From Phase 4 Phase 2 (Onboarding/Offboarding/Assets) build

### Riddhi to review the 16 onboarding task templates and 12 offboarding templates
- Added: 2026-05-09
- Priority: P1
- Effort (human / CC): 30 min Riddhi review / 0
- Reactivation signal: **Riddhi opens /onboarding for the first time** OR a real onboarding event happens. The seeded templates are best-practice Indian HR; she will want to add/remove/reword.
- Notes: Templates editor UI is not built yet (admin pages /admin/onboarding-templates and /admin/offboarding-templates are deferred). For now, Riddhi edits `src/data/onboarding_task_templates.json` and `offboarding_task_templates.json` directly via Anish.

### Build /admin/onboarding-templates and /admin/offboarding-templates editors
- Added: 2026-05-09
- Priority: P2
- Effort (human / CC): 4 hr / 1.5 hr
- Reactivation signal: **Riddhi requests her third template change** OR Anish gets tired of editing JSON for her. Phase 2 ships with templates as JSON; an editor page lets HR add/edit/disable templates without code.
- Notes: Deferred because the seed list is comprehensive and Riddhi will want to live with it before redesigning.

### Hook onboarding task auto-completion to document upload
- Added: 2026-05-09
- Priority: P2
- Effort (human / CC): 1 hr / 30 min
- Reactivation signal: **Riddhi reports double-data-entry friction**: she uploads a doc to /employees/[id]/documents and ALSO has to mark the matching onboarding task complete. Schema has the link (`OnboardingTaskTemplate.documentTemplateId`); UI just doesn't act on it yet.
- Notes: Implementation: add a hook in /api/admin/documents POST to find onboarding tasks for the same employee whose template references the same documentTemplateId and mark them Completed.

### Knowledge transfer document upload via existing repo
- Added: 2026-05-09
- Priority: P2
- Effort (human / CC): 30 min / 15 min
- Reactivation signal: **Riddhi attempts to upload a KT doc and there's no category for it.** Today the document repo has 16 templates; KT is implicitly part of "Other" or via a dedicated template. Add a "Knowledge Transfer" document template + link the offboarding `off-kt-document` task to it.
- Notes: Trivial seed addition to `document_templates.json`. Just hasn't been requested.

### exitType field UI (Voluntary / Termination / End of Contract / Retirement)
- Added: 2026-05-09
- Priority: P2
- Effort (human / CC): 30 min / 15 min
- Reactivation signal: **first termination event.** Schema has `EXIT_TYPES` enum; UI doesn't capture it. Should sit on the offboarding generate form so the exit interview can be auto-marked N/A for terminations.
- Notes: Today HR manually flips the exit-interview task to N/A for terminations.

### Resignation rescind affordance
- Added: 2026-05-09
- Priority: P3
- Effort (human / CC): 1 hr / 30 min
- Reactivation signal: **first rescinded resignation** (rare). Today the offboarding tasks persist when employmentStatus flips back to Active; HR has to manually mark them N/A en masse. A "Cancel offboarding" button on the offboarding page would do the bulk-mark + audit.
- Notes: Edge case explicitly tested in `phase2EdgeStates.test.ts`.

### Daily HR digest email (onboarding tasks due today + overdue)
- Added: 2026-05-09
- Priority: P3
- Effort (human / CC): 4 hr / 1 hr
- Reactivation signal: **Phase 4 attendance / notification module ships.** Brief said to log this — the data shape is already in place (the /onboarding overview computes overdue + due-today counts). Wiring email on a 9am IST cron is a small wrapper around the existing summary logic.
- Notes: Deferred from Phase 2 explicitly.

### IT and Accounts roles
- Added: 2026-05-09
- Priority: P2
- Effort (human / CC): half day / 2 hr
- Reactivation signal: **second time IT or Accounts ends up with the wrong default assignee.** Today both fall back to first active HR user; the four "set up email" / "order laptop" / "F&F settlement" tasks all go to HR by default. Adding real role types and matching users would route correctly.
- Notes: Folds into the wider RBAC redesign already logged.

## 2026-05-09 — From Phase 4 verification round (anti-Shruti-bug-class)

### Inline "Edit" links on taxonomy + holiday rows have small touch targets
- Added: 2026-05-09
- Priority: P2
- Effort (human / CC): 30 min
- Reactivation signal: **Riddhi reports difficulty editing rows on her phone.** The current "Edit" link is text-only with no padding (~16-18px tall), below the 44px WCAG target. Works fine with a mouse. Affects /admin/taxonomy and /holidays.
- Notes: Promoted to inline buttons or made the entire row tap-to-expand. Defer until Riddhi actually edits from her phone — desktop is the dominant surface.

### Optional holiday picks table is dense on mobile
- Added: 2026-05-09
- Priority: P2
- Effort (human / CC): 1 hr
- Reactivation signal: **Riddhi attempts to record picks from a 375px screen and complains.** Current matrix view (4 holiday columns + employee rows) requires horizontal scroll on phones. Functionally works, awkward.
- Notes: Better UX would be a per-employee accordion view that switches in below 768px. Not built because Riddhi will run picks from a desktop during quarterly admin sessions.

### Add Delete and Add actions to /admin/taxonomy
- Added: 2026-05-09
- Priority: P2
- Effort (human / CC): 1 hr
- Reactivation signal: **Riddhi has a stale taxonomy entry with 0 employees that she wants gone, OR a brand-new location/department to add before any employee gets it.** Today she can rename-to-merge, but cannot delete a 0-count entry, nor pre-create a new entry without the muster.
- Notes: Phase 1 ships the rename/merge path because that covers 95% of admin needs. Add when explicit demand surfaces.

### Surface employmentStatus mismatches with confirmation date
- Added: 2026-05-09
- Priority: P3
- Effort (human / CC): 30 min
- Reactivation signal: **a record drifts where employmentStatus = "Probation" but confirmationDate is in the past, or vice versa.** Today the probation badge always uses date-derived truth and ignores employmentStatus drift. Riddhi might hand-edit JSON and inadvertently create a drift; the system silently picks the date.
- Notes: Add a small "Data inconsistency: confirmation date conflicts with employment status" warning banner on the employee detail. Low value until this drift actually happens.

### On Notice / On Leave UI for employmentStatus
- Added: 2026-05-09
- Priority: P2
- Effort (human / CC): 2 hr
- Reactivation signal: **first employee enters notice period or extended leave.** The schema already has these enum values; only the probation flow wires UI. On Notice / On Leave need their own actions on the employee detail.
- Notes: Phase 4 attendance + leave systems naturally want to read these. Build alongside.

## 2026-05-09 — From Phase 4 HR Operations module Phase 1

### Confirm Demonstration & Support department canonical home
- Added: 2026-05-09
- Priority: P1
- Effort (human / CC): 5 min / 5 min
- Reactivation signal: **Riddhi reviews the seeded taxonomy at /admin/taxonomy.** "Demonstration & Support" is flagged in `src/data/taxonomy.json`. Likely belongs under Operations or Sales. 2 employees today (NEELADRI SEN, ARPIT SRIVASTAVA).
- Notes: Migration left it as-is rather than guessing. Riddhi clicks "Edit → rename" on the row; the cascade-rename then updates both employees + the taxonomy metadata in one operation.

### Set hybrid-2day pattern per-employee where it differs from the department default
- Added: 2026-05-09
- Priority: P2
- Effort (human / CC): 30 min Riddhi review / 0
- Reactivation signal: **Riddhi finds an Academics employee whose office days are NOT Mon+Thu**, or any other hybrid mismatch. Migration defaulted everyone to office-5day except trainers and field; hybrid is opt-in per the brief. The roster page already uses department defaults (Academics+STEM = Mon+Thu, others = Tue+Thu) when workPattern = hybrid-2day, so the data shape is ready — just needs Riddhi to flip the workPattern field on individuals via a future inline edit on /employees/[id]. UI for this is currently absent.
- Notes: Adds an "Edit work pattern" control to the employee detail page when Phase 4 reactivates this. Until then, manual JSON edits via Anish.

### Per-employee acknowledgement-email roster workflow (Riddhi's idea)
- Added: 2026-05-09
- Priority: P3
- Effort (human / CC): TBD
- Reactivation signal: **Phase 4 attendance / exception-tracking module ships.** That's the natural place for this. Riddhi proposed daily emails asking employees to acknowledge their roster; sending 100+ emails/day and chasing non-responses creates more inbox traffic than it prevents. Defer until exception-tracking is in scope.
- Notes: Documented here so the idea isn't lost. The acknowledgement workflow only becomes useful when there's a downstream "did Riddhi see this" tracker, which doesn't exist in Phase 1.

### Employee self-service for optional holiday picks
- Added: 2026-05-09
- Priority: P2
- Effort (human / CC): per Phase 3 employee portal scope
- Reactivation signal: **Phase 3 employee self-service portal ships.** Today HR records picks at /holidays; the budget logic + storage are already in place, just needs an employee-facing checkbox UI hooked to the same /api/admin/holidays/picks endpoint (or a new self-serve variant).
- Notes: Riddhi confirmed Phase 1 stays HR-mediated.

### Confirm Bangalore as office vs. promote
- Added: 2026-05-09
- Priority: P3
- Effort (human / CC): 1 click
- Reactivation signal: **GSL opens an anchor space in Bangalore.** Right now it's flagged as remote-field per Riddhi's "for now treat as remote" note. 13 employees today.
- Notes: When the time comes, Riddhi clicks the type toggle on /admin/taxonomy.

### Add Accounts and Reporting Manager roles to the staff role enum
- Added: 2026-05-09
- Priority: P2
- Effort (human / CC): 1 day / 2 hr
- Reactivation signal: **Phase 4 spec finalises the seven-role permission model.** Today the system has Admin / HR / HOD / Leadership. The Phase 4 brief calls for seven: Admin / HR / HR-Ops-only / Reporting Manager / Leadership / Accounts / Employee. Document repository view-allowlist (GSL_DOCUMENT_VIEWERS env) is the stopgap until Accounts becomes a real role.
- Notes: Probably folds into a wider RBAC redesign rather than landing in isolation.

### Roster CSV export → real Excel (.xlsx)
- Added: 2026-05-09
- Priority: P3
- Effort (human / CC): 2 hr
- Reactivation signal: **Riddhi reports CSV doesn't preserve formatting / header weights / freezes.** Today /roster exports plain CSV via Blob; if Riddhi wants it in Excel format with formatting, swap to ExcelJS or similar.
- Notes: CSV is good enough for v1 — Excel imports it cleanly.

## 2026-04-23 — From /plan-devex-review

### Build /admin/health operational dashboard
- Added: 2026-04-23
- Priority: P3
- Effort (human / CC): 1 day / 2 hr
- Reactivation signal: **any Phase 1 operational incident takes > 30 min from HR reporting to Anish identifying root cause.** Or, sustained > 5 support-ping messages per week ("is X working?"). Measured manually.
- Notes: Phase 1 ships manual monitoring (Vercel dashboard + file-size checks on failed_updates.json). A `/admin/health` page would show: last-queue-apply timestamp, pending_updates count, failed_updates count, last-sync-runner-success, magic-link-issued vs exchanged ratio, Resend quota remaining. All computed from existing JSON files plus one Resend API call. Keeps Phase 1 lean; builds when manual monitoring starts costing time.

### Write docs/PATTERNS.md for future-Claude sessions
- Added: 2026-04-23
- Priority: P3
- Effort (human / CC): 30 min / 10 min
- Reactivation signal: **second Claude session (fresh context) onboards onto this repo and drifts from this session's conventions.** Measurable signals: commit message pattern breaks (non-conventional-commits style), queue-write pattern gets bypassed with direct fs.writeFile, new entity skips audit-log append.
- Notes: Conventions (conventional-commits, write-through-queue invariant, when-to-add-tests, pure-function pipeline-transition, server-default / client-opt-in components) are captured implicitly across CLAUDE.md + docs/plans/*. Codifying them separately in `docs/PATTERNS.md` is cheap insurance. Deliberately deferred Phase 1: let patterns emerge from actual Week 1 code, then canonicalise.

### Week 1 onboarding audit
- Added: 2026-04-23
- Priority: P3
- Effort (human / CC): 30 min / 5 min
- Reactivation signal: **after Anish finishes Week 1 implementation slice.** Look back: what was missing from .env.example, config/company.json.example, or docs/RUNBOOK.md that caused >10 min friction during implementation? Update those files to match what was actually needed.
- Notes: This is the DX boomerang from `/plan-devex-review`. Plan said "these three stubs are enough to onboard Week 1." Reality check post-implementation. Don't skip — if we got it wrong, future Claude sessions pay the cost.

## 2026-04-23 — From /plan-design-review Pass 2 (candidate surfaces)

### Upgrade "what happens next" timeline to data-driven
- Added: 2026-04-23
- Priority: P2
- Effort (human / CC): 1-2 days / 30 min
- Reactivation signal: **30+ completed hires in the system** (status = Joined). At that volume, per-stage median time becomes statistically meaningful.
- Notes: Phase 1 ships a static generic 5-step timeline on role detail ("Apply → Assessment → HOD Interview → HR Round → Offer, typically 4-6 weeks end-to-end"). When 30+ hires exist, swap to a role-specific timeline computed from historical median time-in-stage per role. Candidate sees real expected durations. Upgrade keystone: reuses the CP6 leadership-dashboard infrastructure (time-in-stage p50 computation) — build once, use twice.

### Validate /careers filter usefulness
- Added: 2026-04-23
- Priority: P3
- Effort (human / CC): 30 min investigation
- Reactivation signal: **30 days after /careers ships.** Check: are filter chips engaged by > 20% of visitors? Filter usage drops off sharply at low role counts (< 10 open roles). If usage is minimal and role count stays < 15, revert to minimal-list layout and remove filter chrome.
- Notes: User chose filters-above-list at small role counts on the bet that GSL's hiring will grow. If that bet doesn't play out in first 30 days, the filters are unnecessary friction and should go.

### Waitlist subscribe on /careers empty state
- Added: 2026-04-23
- Priority: P3
- Effort (human / CC): 1-2 days / 45 min
- Reactivation signal: user request, or /careers traffic > 500 visits / month with the empty state seen > 30% of the time.
- Notes: Phase 1 empty state on /careers is just "Check back soon." A waitlist subscription (email input → stored list → notify on new role posting) is a Phase 2 upgrade. Requires email-delivery infrastructure (inherit from magic-link Resend setup).

## 2026-04-23 — From /plan-ceo-review SELECTIVE EXPANSION

### Add captcha to /careers/apply
- Added: 2026-04-23
- Priority: P3
- Effort (human / CC): 1 day / 30 min
- Reactivation signal: **> 100 honeypot-triggered or rate-limited requests observed in any rolling 24h window** in `/careers/apply` logs. Measured by counting entries in `src/data/_abuse_log.json` where `outcome: "honeypot_triggered" | "rate_limited"` over last 24h.
- Notes: Phase 1 ships honeypot field + 5/hr IP rate limit. Threat-model assumption: GSL lacks the brand recognition to attract scripted scraping at launch. If the reactivation signal fires, add hCaptcha (~1 day) — it's friction but at that point the friction is earned by a real threat, not speculative.

### Expand leadership dashboard (CP6)
- Added: 2026-04-23
- Priority: P2
- Effort (human / CC): 2-3 days / 45 min
- Reactivation signal: **30 days after /dashboard ships, Ritu + Ameet + Jesal collectively open the page ≥ 2× per week.** Measured via a simple server-side page-view counter on `/dashboard` in src/data/_dashboard_views.json, queued on each load. If yes → promote this TODO to P1 and build time-in-stage p50/p95 per role, conversion funnel (source → interview → offer → joined), source-effectiveness table (Naukri conversion vs Referral vs Educohire etc), withdrawal-reason breakdown. If no → close this TODO as killed; basic dashboard was the ceiling.
- Notes: Deferred in CEO review on the judgement that leadership dashboards usually underperform expectations. Phase 1 ships the basic version: open roles count, candidates per stage, open offers. That's sufficient until we have real usage signal. The expanded version earns its effort only if leadership actually forms the check-in habit.

### Publish rejection feedback to candidate portal (CP9)
- Added: 2026-04-23
- Priority: P3
- Effort (human / CC): 2-3 days / 40 min
- Reactivation signal: **2 months after HR adoption of the Rejected state workflow, ≥ 60% of Rejected transitions have a non-empty structured feedback field in the audit log.** Measured by counting `auditLog[].notes` presence on Pipeline transitions to Rejected over a rolling 30-day window. If yes → promote to P2 and build the HR-gated "publish feedback to candidate portal" view with a curated "what we valued + what the gap was" template. If no → close as killed; HR isn't writing the data so there's nothing meaningful to publish.
- Notes: Emotionally right + operationally questionable. The differentiator ("GSL is a place candidates recommend even when rejected") only works if HR actually fills the feedback field. Test the input side for 2 months before building the output side. Default HR opt-in per-candidate when this ships.

### Flesh out prompt library content (from CP5 commitment)
- Added: 2026-04-23
- Priority: P1
- Effort (human / CC): per prompt: ~1-2 hr HR time + 15 min author time
- Reactivation signal: every prompt planned for docs/claude-prompts/ ships only when validated by Shruti with 3 real test inputs producing the expected JSON output.
- Notes: Applies the "terse-v0-becomes-permanent" learning. Skeleton prompts become permanent half-measures. Expected prompts: resume-parse, JD-draft, interview-note-summarise, candidate-shortlist-from-batch, role-requirements-from-spec. Each must have: title, use case, input format instructions to HR, output JSON schema, 3 known-good example outputs, HR validation signoff.

### Evaluate Microsoft 365 SSO for staff auth (Phase 2)
- Added: 2026-04-23
- Priority: P3
- Effort (human / CC): 1-2 days / 2 hr (integration + testing)
- Reactivation signal: staff complains about password management > 3 times in month-1 retro, OR MAF Technologies IT mandates SSO.
- Notes: Phase 1 ships username/password + bcrypt + JWT. SSO is a nice-to-have. The P3 priority reflects that password auth is genuinely good enough for an 8-person internal tool; SSO is operational polish.

### Extract shared queue-writer library (MOU + HR) — "@gsl/core-writes"
- Added: 2026-04-23
- Priority: P3
- Effort (human / CC): 1 week / 1 day
- Reactivation signal: when starting the third internal project that needs the queued-write pattern (Mafatlal tenant or any new tool). Two consumers is premature; three makes the abstraction earn its keep.
- Notes: Approach B from /office-hours was rejected for Phase 1 because the right abstraction is not yet visible with only MOU as a consumer. Revisit once HR is shipped and a third consumer exists.

### Multi-tenant migration (if Mafatlal signal arrives)
- Added: 2026-04-23
- Priority: P3
- Effort (human / CC): 1-2 weeks / 1 day
- Reactivation signal: Mafatlal Group gives a real pitch commitment with a named buyer and a target timeline. Not before.
- Notes: P7 from /office-hours was explicitly DEFER. Migration is additive: `tenantId` column on every entity, backfill `gsl`, scope queries. No tenant-aware magic-link scoping required until second tenant exists.
