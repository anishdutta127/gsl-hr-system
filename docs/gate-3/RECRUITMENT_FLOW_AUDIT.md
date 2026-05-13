# Recruitment stage + feedback flow audit

**Written**: 2026-05-13 for HR Gate 3 (Workstream 1).
**Scope**: read-only snapshot. No code is changed by this doc — it sets up the schema work in Step 2 and the gate work in Step 3 of the gate prompt.

---

## 1. The entity that moves through stages

Stages live on `Application`, not on `Candidate`. The candidate is the person; the application is candidate × role × stage. A candidate with two applications has two independent pipeline positions. This matters for the gate: hiring-manager feedback is per-application, not per-candidate.

`src/lib/types.ts`:
- `Application.id`, `candidateId`, `roleId`, `currentStage: Stage`, `stageEnteredAt`, `auditLog[]`. Reject capture lives on `rejectionReason` + `rejectionNotes`.
- `Candidate` carries identity, resume, tags, notes, audit log. No stage field.

The role record (`Role.pipelineStages: Stage[]`) defines the ordered non-terminal stages for that role. Two default lists are provided:
- `DEFAULT_PIPELINE_STAGES` — HOD-then-HR pipeline (most roles).
- `ACADEMICS_PIPELINE_STAGES` — two HOD rounds before HR (Manali round 1, Ritu round 2).
- Per-role override is allowed: any role may set its own `pipelineStages` ordering.

Terminal stages are global: `Rejected | OnHold | NotInterested | Withdrawn | Joined`. A terminal stage can be entered from any non-terminal stage; you cannot move out of a terminal stage. `pipeline.ts:canTransition` enforces this.

---

## 2. The stage list (default)

For a role using `DEFAULT_PIPELINE_STAGES`:

`Sourced → Shortlisted → AssessmentSent → AssessmentDone → VideoSent → VideoDone → HODRoundScheduled → HODRoundDone → HRRoundScheduled → HRRoundDone → Offered → OfferAccepted → DocsCollected → Joined`

Academics adds `HOD2RoundScheduled → HOD2RoundDone` between `HODRoundDone` and `HRRoundScheduled`.

The interview-feedback gate (Gate 3) needs a configurable list of stages that block exit until feedback exists. Default for this gate (from the gate prompt): `['HODRoundDone', 'HOD2RoundDone', 'HRRoundDone']`. The gate prompt phrases it as `['Interview', 'Final Interview']` but those are not real stage names in this codebase — the closest equivalents are the `*RoundDone` stages, because that is where HR/HOD would have actually run the interview and now needs to capture an opinion before progressing the candidate. We will rename `feedbackRequiredFor` to use real stage names in Step 2 and document the mapping in the schema.

---

## 3. How a transition is triggered today

Three surfaces fan into one API:

| Surface | Component | Behaviour |
|---|---|---|
| Kanban board (per-role pipeline) | `src/components/kanban/*` + `useStageTransitions` hook | Drag-drop a card column-to-column OR click the per-card forward / back / Reject buttons. Reject opens `RejectReasonModal` to capture structured reason. |
| Candidate detail page (per-application strip) | `ApplicationStageActions.tsx` + same hook in `static` visibility mode | Forward / back / Reject buttons under each application card. Same hook, same modals. |
| Bulk operations from candidate list | `useStageTransitions.bulkForward / bulkBackward / bulkRejectStart` | Same hook again, but fans out to `/api/applications/bulk-transition`. |

The single source of truth for "is this a valid move?" is `src/lib/pipeline.ts:canTransition` — a pure function over `role.pipelineStages` plus the global terminal list. Validation runs on both client (for button availability via `stageTransition.ts:neighbours`) and server (in the route handler, hard gate).

### API routes

- `POST /api/applications/[id]/transition` — single. Validates `canTransition`, writes a single queue entry `application.update` op=`stage-transition`, returns `{ ok: true }`. HOD-round transitions also fire an email notification to the assigned HOD via `deliverEmail` (best-effort, never blocks).
- `POST /api/applications/bulk-transition` — batch. Validates each app independently against its role's pipeline, queues one entry per applied app, returns counts + per-app details.
- `POST /api/applications/[id]/move` — special "move candidate to a different role's pipeline". Two queue writes: source app → Withdrawn, new app created at Sourced for destination role.

### Queue applier

`scripts/apply_queue.py` consumes `pending_updates.json`. For `application.update` with op=`stage-transition`:
- Sets `currentStage` + `stageEnteredAt` on the entity.
- If new stage is Rejected, stamps `rejectionReason` + `rejectionNotes`.
- If new stage is NOT Rejected, clears both rejection fields (so re-opening clears stale rejection capture).
- Appends an audit entry.

Failure modes are loud — unknown ops raise `RuntimeError` and the whole queue run halts.

---

## 4. Permissions

`getCurrentSession()` returns `SessionClaims { sub, email, role: 'Admin' | 'HR' | 'HOD' | 'Leadership' }`.

| Role | Can transition? | Notes |
|---|---|---|
| Admin | Yes, all stages all directions | No restriction in either API route. |
| HR | Yes, all stages all directions | Same — both routes accept any signed-in session. |
| HOD | Yes via UI affordances if shown | The transition routes do NOT currently check HOD ownership of the role. The candidate detail page redirects HODs who don't own any of the candidate's role IDs (`page.tsx:42-45`), but a HOD with knowledge of an application ID could in theory POST a transition. Worth noting; not in scope to fix in this gate. |
| Leadership | No write actions in the UI | Read-only sidebar surfaces; no transition affordances rendered. |
| Candidate | Self-withdraw only | `POST /api/portal/withdraw/[applicationId]` — separate write, distinct from staff transitions. |

The route handlers gate on "signed-in session exists" (`getCurrentSession`), and trust the role-aware UI to keep Leadership / HOD off the transition routes. The `move` route additionally hard-gates to Admin + HR.

---

## 5. Hiring manager field on Candidate / Application

**Not present today.** Neither `Candidate` nor `Application` has any `hiringManagerId` / `hiringManagerUserId` field. The closest fields are:
- `Role.hodUserId` and `Role.hodRound2UserId` — the HOD(s) who run the technical assessment for the role. These are per-role, not per-application.
- `Interview.interviewerUserId` — captures who scored a given interview (one record per scoring event).
- `Application.createdBy` + `Candidate.createdBy` — author of the record. Not the hiring manager.

For Gate 3, Workstream 1, we need a new per-application field `hiringManagerId` that is assignable by HR when the candidate enters an interview stage. The natural placement is on `Application` (not `Candidate`), because:
- A candidate with two applications could have two different hiring managers (different roles, different teams).
- The gate fires per application, not per candidate.
- `Role.hodUserId` is a sensible default, but it should NOT be the hiring manager automatically: gate prompt explicitly says HR assigns one, and an HOD-Less role still needs a hiring manager.

Decision for Step 2: add `Application.hiringManagerId: string | undefined` (User id), defaulting to undefined; HR assigns. Out-of-band default suggestion in UI: if the role has `hodUserId`, prefill the assign dropdown with that user — they can change it.

---

## 6. Existing interview feedback artefacts

`Interview` entity already exists for HOD rubric scoring. It is NOT the right place for the hiring-manager feedback the gate prompt describes, because:
- Interview is rubric-led (`scores: InterviewScore[]`), tied to `applicationId × round × interviewerUserId`. One interview record per scoring event.
- Hiring-manager feedback is narrative: recommendation + strengths + concerns + overall notes. No rubric.
- The gate prompt's `interviewFeedback` is an array on the candidate (or application — see below), keyed by round + submitter. Closer to a journal than a score.

Decision for Step 2: introduce a new array `interviewFeedback: InterviewFeedback[]` on `Application` (not `Candidate`, same reasoning as above — feedback is per-pipeline-position). Schema follows the gate prompt verbatim: `{ round, submittedBy, submittedAt, recommendation, strengths, concerns, overallNotes }`.

If a single interview score AND a narrative feedback are both wanted for the same round, that is fine — different surfaces, different data. The rubric Interview is on `/interviews/new`; the narrative feedback will be on the candidate detail page action surface added in Step 3.

---

## 7. Existing approval workflow patterns we can reuse

Useful precedents:

| Pattern | Where | Reuse for Gate 3 |
|---|---|---|
| Two-party offer approval | `offer.update` with `offer.approve`, `offer.send`, etc. in `apply_queue.py` | Same shape works for pre-onboarding approval in Workstream 2: HM submits → HR submits → status flips. |
| Reject reason capture modal | `RejectReasonModal.tsx` | Direct fit for the feedback-required-but-no-feedback override block. Different copy, same modal pattern. |
| `Override (Admin only)` style block | None today | New surface needed. Pattern: confirm modal + explicit free-text reason → audit captures it as an override. |
| Audit-only ops | `email.sent`, `letter.generated` in `apply_queue.py` | Direct fit for "Recruiter requested feedback from X" audit entry — append-only, no field change. |
| `before / after` patterns in payload | Every `application.update` and `candidate.update` op | Same shape will work for the new feedback ops. |

Pattern to AVOID: there is no existing "block transition with override" gate today — every transition either passes `canTransition` or is rejected outright. Gate 3 introduces a new shape: `canTransition === true` AND `feedbackGateClear === true` BOTH required for the move. The natural place to add this is the API route (server-side hard gate) plus the client hook (so the UI prompts instead of silent-failing). The override path adds a new request flag `override: true, overrideReason: string` plus session-role check for Admin.

---

## 8. Audit log shape

Per-entity `auditLog: AuditEntry[]` where `AuditEntry = { timestamp, user, action, before, after, notes }`. Every queue applier op appends one entry. The gate work will add:

- `application.update` op = `assign-hiring-manager` (before / after = `{ hiringManagerId }`).
- `application.update` op = `feedback-submitted` (after carries the new feedback entry, before is empty — append-only growth of the feedback array).
- `application.update` op = `feedback-requested` (audit-only; no field change; notes carry "Recruiter requested feedback from [name] on [timestamp]").
- `application.update` op = `feedback-override` (audit-only; notes carry the override reason + the stage that was bypassed).

---

## 9. Non-stage approvals — pre-onboarding

For Workstream 2 (pre-onboarding approval), no existing field captures the "approved CTC + joining date + location + position" sign-off pair. Closest analog:
- `Offer.compensation.ctcAnnual` + `Offer.proposedJoiningDate` + `Offer.location` + `Offer.designation` are captured on the Offer entity.
- `Offer.approvedBy` / `Offer.approvedAt` capture single-party approval today.

The gate prompt's pre-onboarding approval is sequential two-party. Step 6 will add `Application.preOnboardingApproval: { status, hiringManagerApprovedAt, hrApprovedAt, ctcConfirmed, joiningDateConfirmed, locationConfirmed, positionConfirmed, notes, rejectionReason }` so the workflow lives on the application, not the offer. Rationale: the approval happens BEFORE an offer record is drafted (a recruiter can run the approval then choose not to generate an Offer entity at all if the candidate ghosts — the existing `Offer.status === 'Draft'` is the wrong precedent here). The Offer entity becomes downstream of the approval, not coupled to it.

---

## 10. Done. What changes in subsequent steps.

| Step | Adds | Existing surface touched |
|---|---|---|
| Step 2 | `Application.hiringManagerId`, `Application.interviewFeedback[]`, `Application.feedbackRequiredFor[]`. New apply-queue ops `assign-hiring-manager`, `feedback-submitted`. Migration handles existing apps (all three fields undefined, no feedback required). | `types.ts`, `data.ts` if loaders need a shape adjustment, `apply_queue.py`. |
| Step 3 | New gate inside `/api/applications/[id]/transition` (and bulk equivalent). Feedback submission form on candidate detail page. Admin override path. | `transition/route.ts`, `bulk-transition/route.ts`, `ApplicationStageActions.tsx`, new modal. |
| Step 4 | "Awaiting feedback" banner + mailto: request action on candidate detail. New audit op `feedback-requested`. | `page.tsx`, new client component. |
| Step 6 | `Application.preOnboardingApproval` + new apply-queue ops. New approval form. | `types.ts`, candidate detail page, `apply_queue.py`. |
| Step 7 | Four send-email modals at the candidate detail page. mailto: only. | New components under `src/app/(staff)/candidates/[id]/`. |

No existing tests need rewriting — the existing pipeline tests pass through `canTransition` and stay green. New tests are additive.
