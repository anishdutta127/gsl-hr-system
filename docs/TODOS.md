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
