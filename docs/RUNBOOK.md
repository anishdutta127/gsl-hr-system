# Operations Runbook

Written 2026-04-23 during planning; populated with scenarios identified in
`/plan-eng-review` Section 8. Update as incidents happen.

Audience: Anish + any future operator taking over.
Philosophy: every incident has a check, a fix, a verification. No guessing.

## Who's on point

- **L1 (all incidents):** Anish
- **L2 (escalation):** none in Phase 1 (single-operator system)

## Common incidents

### 1. HR reports "Save failed" toast in Kanban / offer drafting

**Check:**
1. `GET /api/health` — does the app respond 200? If no, Vercel status page + logs.
2. GitHub API rate limit status for the queue-writer PAT:
   - Run `curl -H "Authorization: token $GSL_QUEUE_GITHUB_TOKEN" https://api.github.com/rate_limit`
   - Check `resources.core.remaining`. Fresh fine-grained PAT typically has 5000/hr.
3. `src/data/pending_updates.json` — does the latest entry have `retryCount > 0`?
4. `src/data/failed_updates.json` — are there entries piling up?

**Likely causes:**
- PAT expired or revoked. Fix: rotate PAT per `docs/SECRETS.md` (inherit from MOU for now), update Vercel env var, redeploy.
- Rate limit hit. Fix: wait for reset window; investigate why — likely a runaway client retry loop.
- Network issue between Vercel and GitHub. Fix: usually self-heals within 5 min.

**User-side fix:** Tell HR to retry. If fails twice, WhatsApp Anish.

---

### 2. Candidate reports "I clicked the magic link but it says it's expired"

**Check:**
1. How long between link issued and click? Check `src/data/magic_links.json` for the nonce + `issuedAt`. Links expire after 15 minutes.
2. Was it clicked from a different browser than where it was originally opened? (Expected behaviour: single-use links reject on second-click regardless of browser.)
3. Candidate's timezone / clock skew — rare but possible on old Android.

**Likely causes:**
- Candidate let the email sit too long. Fix: candidate clicks "Request a new link" in the portal; new link issued.
- Candidate forwarded the link to themselves or a friend clicked it first. Fix: single-use is a security feature; candidate requests a new link.
- Clock skew on candidate device. Fix: if pattern emerges, widen HMAC tolerance from ±0 to ±60 s.

---

### 3. HR reports "I posted a role but it's not appearing on /careers"

**Check:**
1. Is the queue consumer caught up? `ls -lt src/data/pending_updates.json` + check `applied_updates.json` for the role's UUID.
2. Is the sync runner on Anish's laptop running? On Windows: `sc query actions.runner.anishdutta127-gsl-hr-system.anish-laptop`.
3. Is Vercel rebuilding? Check Vercel dashboard → Deployments → latest. If no recent deploy, check `vercel.json ignoreCommand` didn't accidentally skip a non-queue commit.
4. Has the sync-and-deploy workflow fired in GitHub Actions → last 24h?

**Likely causes:**
- Self-hosted runner offline (Anish's laptop closed). Fix: open laptop; runner auto-restarts.
- Workflow failing silently. Fix: check GitHub Actions tab for recent red runs.
- Build failing on Vercel. Fix: check Vercel logs for the last deploy.

---

### 4. Offer letter generation returns "Template file missing"

**Check:**
1. Does `public/hr-templates/{template-id}.docx` exist on the latest deploy?
2. Check `next.config.mjs` `outputFileTracingIncludes` — is the route path in the list?

**Likely causes:**
- Template file was deleted or renamed. Fix: restore from git history or ask HR to upload again.
- `outputFileTracingIncludes` regression (Next.js quirk — keys must live under `experimental:` in 14.2.x). Fix: verify the config and redeploy. This bit us on MOU once — see CLAUDE.md non-negotiables.

---

### 5. Offer letter generation returns "Missing fields: X, Y, Z"

**Check:** User is filling the form; some placeholders are unfilled.
**Fix:** Not an incident. Tell HR to fill the named fields and retry.
**Root cause:** Template placeholders don't match the form schema. Should be caught at template-registry definition time. If this fires repeatedly, template registry and form are out of sync.

---

### 6. Self-hosted sync runner "failed to push" in GitHub Actions log

**Check:**
1. GitHub Actions tab → last run of `sync-and-deploy.yml` → push-step log.
2. Is `main` protected in ways that block the runner's token?
3. Did a concurrent human commit race the runner?

**Likely causes:**
- Race with human commit. The runner retries 3x with `git pull --rebase`. If all 3 fail, investigate the rebase conflict.
- PAT (`SYNC_BOT_PAT` secret) expired. Fix: rotate.
- Branch protection changed. Fix: ensure the bot is allowlisted or rules don't require reviews.

---

### 7. Candidate portal session cookie not issuing

**Check:**
1. `GSL_JWT_SECRET` set in Vercel env for all three scopes (Production / Preview / Development)?
2. `GSL_SNAPSHOT_SIGNING_KEY` set? (HMAC-signs the session cookie.)
3. Cookie domain matches request host? On Vercel preview URLs this can mismatch.

**Likely causes:**
- Env var missing after secret rotation. Fix: set it again and redeploy.
- Preview URL mismatch. Fix: candidate should be using production URL, not preview.

---

### 8. Magic-link email not arriving

**Check:**
1. Resend dashboard → sending logs for the candidate's email.
2. Daily volume hit 100/day free-tier limit? Resend returns 402.
3. Candidate email bouncing? Check Resend logs for bounce status.
4. Candidate email in spam folder (the obvious one).

**Likely causes:**
- Resend quota exhausted. Fix: upgrade to paid tier. (Phase 1 threshold: > 80/day sustained for a week.)
- Candidate email typo. Fix: HR contacts candidate out-of-band to confirm address.
- Domain reputation issue. Fix: verify sending domain SPF/DKIM/DMARC in Resend.

---

## Secret rotation

See inherited MOU pattern at `gsl-mou-system/docs/SECRETS.md`. Three secrets to rotate on the listed cadences:

| Secret | Rotate every | Scope | Blast radius if expired |
|---|---|---|---|
| `GSL_QUEUE_GITHUB_TOKEN` | 90 days | All three (Prod/Preview/Dev) | Writes return 503. Reads unaffected. |
| `GSL_SNAPSHOT_SIGNING_KEY` | 180 days | Production only | Outstanding magic links + candidate sessions invalidated instantly. Candidates see "link not recognised" — must request new one. |
| `GSL_JWT_SECRET` | 180 days | All three | Staff logged out; must re-authenticate. |

Always scope new token before revoking old. Short overlap window = zero downtime.

## Queue applier

**What it is:** `.github/workflows/apply-queue.yml` runs every 10 min
(IST business hours, Mon-Fri) on a hosted ubuntu runner. Consumes
`src/data/pending_updates.json`, applies each entry to the matching
entity file, commits as `chore(apply): drain queue <ts>`, pushes.
Vercel rebuilds on the apply commit so the UI surfaces the change.

**Latency:** writes visible within 10-15 min of submission. Acceptable
for an internal HR tool at pilot volume. If HR needs it faster, the
workflow can be kicked manually from the GitHub Actions tab
("Run workflow").

**If the applier is stuck:**
1. Open Actions tab, find the latest `Apply Pending Queue` run.
2. If red: inspect logs. Most likely an unknown `operation` value in
   a queue entry -> `scripts/apply_queue.py` needs a handler added.
3. Failed entries go to `src/data/failed_updates.json` with the
   reason. The entry stays in the queue until handled.
4. Manual drain: on a local checkout, run `python3 scripts/apply_queue.py`
   then commit + push. Only do this if the hosted runner is down.

**Testing surface awareness:** when no applier run has happened yet,
writes queue but don't surface. Check Actions tab if a tester reports
"I added X but I don't see it." Typical wait: up to 10 min.

## Monitoring (Phase 1 — manual)

No pager duty. Anish monitors manually via:
- Vercel dashboard deploy status
- GitHub Actions tab for sync-runner + queue-applier health
- `src/data/failed_updates.json` file size (shouldn't grow)

**Automation trigger (TODO in `docs/TODOS.md`):** when any sustained incident class takes > 30 min to detect, invest in an `/admin/health` dashboard + webhook alerting.

## Logs

- **Sync runner:** `logs/sync.log` (committed to repo by the runner itself).
- **Vercel functions:** Vercel dashboard → Functions → Logs.
- **Audit log:** per-entity `auditLog[]` array inside each entity JSON file. Queryable by reading the JSON directly.
- **Queue archive:** `src/data/applied_updates.json` retains UUID + timestamp of every applied queue entry. Keep forever; it's the reconstruction record.
