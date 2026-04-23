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
