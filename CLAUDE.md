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
