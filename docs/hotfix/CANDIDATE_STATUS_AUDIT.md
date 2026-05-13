# Candidate status persistence — write-surface audit

Audit performed 2026-05-13 in response to Shruti's feedback that candidates moved to On Hold or Rejected "jumped back to Sourced" after navigation.

## Root cause (one paragraph)

The application code is correct. Every stage-change surface listed below enqueues to GitHub via the queue helper, the apply runner consumes the queue, and `applications.json` lands in the repo with the new state. **The user-perceived bug is queue lag.** Vercel reads bundled JSON files at request time. Until the apply-queue cron drains the queue and the resulting commit triggers a Vercel rebuild, the deployed page reads the OLD `applications.json` and shows the candidate at their previous stage. From the HR's seat that looks identical to "the change was lost."

Today's specific aggravator: between 06:14Z (the morning drain) and ~13:00Z, the apply-queue scheduled workflow did not run despite cron `*/5 3-13 * * 1-5`. Eight stage-transition entries, including all four candidates Shruti named (Komal Hinduja, Huda, Abhishek Soni, ABHIJEET SINGH BHANUVANSHI), sat in `pending_updates.json` for the entire morning. Two of those entries were duplicated by Shruti at 12:26 IST after she retried the moves, confirming she perceived the first attempt as failed.

The fix has three parts:
1. **Honest toast copy** — every save toast now says "queued; click Sync now to force, or wait for the next auto-sync." So HR knows the state is "queued, not lost."
2. **Universal Sync now button** — moved out of the Admin-only sidebar slot into the top-right of every page so any HR user can force-drain immediately after a batch of changes.
3. **`/admin/queue-status` page** — pending count + last drain timestamp + recent entries, so anyone can see why the page might be stale.

The underlying scheduled-cron lag is a GitHub-side problem (scheduled workflows are best-effort and can be delayed indefinitely on free tier). Sync now is the contract: HR clicks it and knows the drain happened in seconds rather than minutes-or-never.

## Stage-change write surfaces

For each surface: file:line of the submit handler, queue helper called, validation, toast copy, audit log path.

| # | Surface (UI → handler) | API route | Queue call | Validates | Toast (post-fix) | Audit |
|---|---|---|---|---|---|---|
| 1 | Single stage transition (forward / backward / reject) — Kanban + Candidate detail | `POST /api/applications/[id]/transition` (`src/app/api/applications/[id]/transition/route.ts:16`) | `enqueueUpdate` (line 106) | `canTransition`, role open, reject reason captured | "[name] moved to [stage]. Queued — click Sync now to force, or wait for the next auto-sync." | application.auditLog appended on apply (`scripts/apply_queue.py:117-136`) |
| 2 | Bulk stage transition — Kanban bulk bar | `POST /api/applications/bulk-transition` (`src/app/api/applications/bulk-transition/route.ts:51`) | `enqueueUpdate` per app | `canTransition` per app, skipped on invalid | "Moved forward N candidates. Queued — click Sync now to force, or wait for the next auto-sync." | per-application auditLog appended on apply |
| 3 | Candidate move between roles — Kanban "Move to other role" | `POST /api/applications/[id]/move` (`src/app/api/applications/[id]/move/route.ts:27`) | `enqueueUpdate` for source (Withdrawn) + destination (Sourced) + candidate audit | role open, dedupe in destination, past-Offered confirm | "Moved to [destination role]. Queued — click Sync now to force, or wait for the next auto-sync." | source app + new app + candidate.auditLog appended on apply |
| 4 | Interview scheduled — auto-advances stage | `POST /api/interviews` | `enqueueUpdate` for both interview.create and application stage-transition | role open, slot validated | (HR-side toast already exists) — sync hint appended | application.auditLog |
| 5 | Offer accepted/declined/withdrawn → auto-advances stage | `POST /api/offers/[id]/[action]` | `enqueueUpdate` for offer.update + (if action triggers it) application stage-transition | offer in valid state | (Offer toast already exists) — sync hint appended | both auditLogs |
| 6 | Activate employee record — auto-advances application to Joined | `POST /api/employees` | `enqueueUpdate` for employee.create + application stage-transition | candidate exists, application in valid stage | "Employee queued. Click Sync now to force, or wait for the next auto-sync." | both auditLogs |
| 7 | Candidate self-withdraws via portal | `POST /api/portal/withdraw/[applicationId]` | `enqueueUpdate` (stage = Withdrawn) | session validated, app exists | (Candidate-facing portal — no Sync now hint, intentional) | application.auditLog |
| 8 | Candidate submits assessment via portal | `POST /api/portal/assessment/[id]/complete` | `enqueueUpdate` (stage = AssessmentDone) | session, app at AssessmentSent | (Candidate-facing — no Sync now hint) | application.auditLog |
| 9 | Candidate submits video via portal | `POST /api/portal/video/[id]/submit` | `enqueueUpdate` (stage = VideoDone) | session, app at VideoSent | (Candidate-facing — no Sync now hint) | application.auditLog |

All surfaces verified writing to queue correctly. None bypass the queue (no `fs.writeFile` to `src/data/*` from a serverless route).

## Why the candidates "jumped back to Sourced"

Trace of Shruti's 2026-05-13 session (extracted from `pending_updates.json` as of audit time):

```
06:37:29Z (12:07 IST)  app=e463d2db → Rejected   queuedBy=Hiring@getsetlearn.info
06:37:39Z (12:07 IST)  app=30f06940 → Rejected   queuedBy=Hiring@getsetlearn.info
06:41:59Z (12:11 IST)  app=f1bfb6bf → OnHold     queuedBy=Hiring@getsetlearn.info
06:45:19Z (12:15 IST)  app=88ebdd23 → OnHold     queuedBy=Hiring@getsetlearn.info
06:47:06Z (12:17 IST)  app=b53e78fb → OnHold     queuedBy=Hiring@getsetlearn.info
06:49:11Z (12:19 IST)  app=9a79caae → OnHold     queuedBy=Hiring@getsetlearn.info
06:56:36Z (12:26 IST)  app=e463d2db → Rejected   queuedBy=Hiring@getsetlearn.info  (DUPLICATE of 06:37)
06:56:41Z (12:26 IST)  app=30f06940 → Rejected   queuedBy=Hiring@getsetlearn.info  (DUPLICATE of 06:37)
```

Last drain commit before the session: `5f6d91e chore(apply): drain queue 2026-05-13T06:14Z`. No drain between 06:14Z and the time of this audit (~12:55 IST).

Result: Shruti's writes hit GitHub correctly (queue commits visible) but `applications.json` was not updated. When she navigated back to the candidates page, the bundled `applications.json` on Vercel still had the candidates at Sourced, so the StagePill rendered Sourced. She perceived this as a lost change and re-tried two of them at 12:26.

## Fix list (this PR)

1. **`src/components/shell/SyncNowButton.tsx`** — restyled into a top-right header widget with pending count + last-drain timestamp. Visible to all signed-in users (no longer Admin-only).
2. **`src/components/shell/AppShell.tsx`** — Sync now widget moved from sidebar bottom to header right; visible on every page (mobile and desktop).
3. **`src/app/api/sync/trigger/route.ts`** (new) — universal endpoint, any signed-in user, rate-limited 1 trigger per 60 seconds per user-email + IP fallback.
4. **`src/app/api/sync/status/route.ts`** (new) — read-only endpoint returning pending count, last drain timestamp, last-25 fired entries. Any signed-in user.
5. **`src/app/(staff)/admin/queue-status/page.tsx`** (new) — Admin-only full visibility surface (pending entries table, drain history, fail history).
6. **Toast copy updates** — every server-write success toast in HR-only client components now appends "Click Sync now to force immediate sync, or wait for the next auto-sync." (deferred to candidate-facing portal — no exposure there).
7. **No code changes to write paths** — they were already correct. The failure mode was operational lag, not buggy writes.

## What was NOT changed

- `src/app/api/admin/sync-now/route.ts` — kept as-is (Admin-only); the new `/api/sync/trigger` is the universal entry point. Two routes is intentional: existing tests / external probes still hit the admin endpoint, and Admin retains the same access pattern as before.
- The cron schedule in `.github/workflows/apply-queue.yml` — the cron is fine. The ops-side problem (today's drain gap) is independent of this PR; we now make it survivable from the HR seat with one click.

## How to verify the fix

1. Move a candidate from Sourced to OnHold. Toast says "queued, click Sync now…"
2. Click Sync now. Top-right widget shows "Syncing…" then "Synced just now."
3. Wait ~30s for Vercel to rebuild from the apply-bot commit. Refresh the page. Candidate now reads OnHold (not Sourced).
4. Without sync now, the same change applies on the next cron tick (within 5 min on a healthy day, or 5+ minutes when GitHub is throttling — the universal Sync Now removes the dependency on cron health entirely).
