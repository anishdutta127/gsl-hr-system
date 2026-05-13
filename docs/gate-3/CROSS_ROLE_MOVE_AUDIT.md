# Cross-role move + stage transition audit

**Written**: 2026-05-13 for HR Gate 3, Workstream 4 (Shruti's two-bug report).
**Scope**: read-only snapshot of what the code does today. Drives Steps 19 + 20 + 21.

---

## 1. Schema is per-application, not per-candidate

`Application.currentStage` is the source of truth. `Candidate` has no stage field. One candidate × N roles = N applications, each with its own `currentStage`.

That much is correct in the data model (see `src/lib/types.ts`). The bug is not a schema problem — no migration is required. The bugs that look "global" are UI / API edge-case issues.

---

## 2. Surfaces that let HR move a candidate across roles

Two distinct surfaces; both render `PipelineActions.tsx`:

| Where | Used from | Source of `memberships` |
|---|---|---|
| Candidate detail page | `/candidates/[id]/page.tsx` line 218–225 | `apps` = `loadApplications().filter(candidateId === id)` (ALL stages, including terminal) |
| Kanban side panel | `/roles/[id]/page.tsx` line 48–58 → `Kanban` → `CandidateSidePanel` line 216–223 | Same: ALL applications of every candidate currently in the role |

Both invocations pass the unfiltered membership list. Terminal stages (Rejected / Withdrawn / NotInterested / Joined / OnHold) are included.

---

## 3. The two PipelineActions affordances

In `PipelineActions.tsx`:

### "Move to other role"
- Endpoint: `POST /api/applications/[sourceApplicationId]/move`.
- Server-side validation (lines 60–125 of `move/route.ts`):
  - source === destination → "Source and destination roles are the same." (400)
  - Joined source → "Cannot move a candidate who has already Joined…" (400)
  - destination has an active app for same candidate → "[name] is already in [role]'s pipeline." (409)
  - past-offer source without `force: true` → confirmation prompt (409)
- Behaviour on success: source app → Withdrawn (audit only on source side if pipeline is read-only), new app at Sourced at destination. Two queue writes plus a third candidate-level audit entry.
- **No call to `canTransition`** — so "Already at this stage" cannot come from this route.

### "Add to additional role"
- Endpoint: `POST /api/candidates/bulk` with `action: { type: 'add-to-pipeline', roleId }`.
- Server-side validation (lines 63–116 of `bulk/route.ts`):
  - role not accepting candidates → 400.
  - dup check (line 80–82): skips when candidate already has a non-terminal app for the role.
- Behaviour on success: single queue write per candidate, application created at Sourced.
- Client surface (PipelineActions `handleAdd`, lines 146–183): handles `applied: 0, skipped: 1` by setting error: `"${candidateName} is already in this role's pipeline."`.

Neither path returns the literal string "Already at this stage." That string lives in exactly one place: `src/lib/pipeline.ts:41`, inside `canTransition`, when source stage === target stage.

---

## 4. Where the "Already at this stage" toast really comes from

`canTransition` is called by every stage-transition route:
- `/api/applications/[id]/transition` (single drag-drop, candidate detail per-app buttons)
- `/api/applications/bulk-transition` (Kanban multi-select)
- `/api/portal/withdraw/[applicationId]`, `/api/portal/video/[id]/submit`, `/api/portal/assessment/[id]/complete`, `/api/employees`, `/api/offers/[id]/[action]`, `/api/interviews`.

Likely paths for the toast on the screenshot:

1. **Kanban drag-drop on an already-correct column.** The drag handler in `Kanban.tsx:128` has an early-return `if (application.currentStage === targetStage) return`, but the optimistic state (`stageOverride`) is set BEFORE the early-return check looks at the merged state. If the user drags a card to the column it's already visually in (e.g. card optimistically flipped, network reverted, then user drags it back), the early-return relies on `merged` (which reflects the override) rather than the canonical server stage. The transition fires anyway and `canTransition` returns "Already at this stage."

2. **The optimistic flip is stale.** When a queue write succeeds and the server props re-arrive via `router.refresh()`, the local `stageOverride` map is NOT cleared (the Kanban only adds, never removes). Subsequent drags compute `targetStage` against the stale override and produce the same `currentStage === targetStage` condition, which the server then rejects.

3. **Stage-transition called from the per-app buttons on the candidate detail page when the role's `pipelineStages` order has been edited.** If the next/previous neighbour is computed against a stale role record, the call can land on the same stage. Less likely but reachable.

The most plausible cause of Shruti's screenshot: Shruti dragged John's card on the Kanban, the optimistic flip happened, the network was slow, she dragged again (or the queue applied delayed and `router.refresh()` brought back the original state mid-drag), and the second transition fired with `currentStage === targetStage`.

The cross-role buttons are NOT directly responsible. The toast is real and appears on the screen at the same time the user clicks Move / Add — but it is a stage-transition toast bleeding through from a recent drag, not a Move / Add error.

---

## 5. The actually-broken duplicate detection

`PipelineActions.tsx:97–98`:
```ts
const memberRoleIds = new Set(memberships.map((m) => m.roleId))
const destinationOptions = openRoles.filter((r) => !memberRoleIds.has(r.id))
```

`memberships` includes terminal applications. Therefore Role B is excluded from the dropdown even when the candidate's only application for Role B is Rejected or Withdrawn. This is **stricter than the server** (which dedupes only against non-terminal applications). The user has no way to re-add a previously rejected candidate from the UI; the same Add action would succeed via curl or via the bulk-add bulk-actions surface from the candidates list page.

Same problem for the source-roles filter:
- `moveableMemberships.filter((m) => m.currentStage !== 'Joined')` includes Withdrawn / Rejected / NotInterested / OnHold sources. Picking a Rejected source would still call the move endpoint, but the move endpoint's `skipSourceWrite = sourceTerminal || isPipelineReadOnly` handles this gracefully — the source-side write is skipped, only the destination application is created.

---

## 6. Stage-transition write path end-to-end

Single transition (the slow surface Shruti reports):

1. User drag or button click → `useStageTransitions.onIntent`.
2. Hook calls `applyOptimistic(applicationId, toStage)` → `Kanban.setStageOverride` map.
3. Hook fetches `POST /api/applications/[id]/transition` with the target stage + reject reason as needed.
4. Server validates `canTransition` + `evaluateGate` (Gate 3 addition).
5. Server enqueues one `application.update` op via `enqueueUpdate`.
6. `enqueueUpdate` writes a single queue entry to the GitHub Contents API.
7. Server responds 200 → hook fires success toast + `router.refresh()`.
8. Server Component re-renders against fresh disk data — but the queue has not yet been applied, so `currentStage` in `applications.json` is unchanged. The applier runs on schedule (hourly cron IST business hours) or via "Sync now."
9. The visual stage on the card depends on the optimistic override staying alive: the card "moves" instantly client-side, but reloading the page in another tab still shows the old stage.

The end-to-end perceived latency is dominated by:
- The network round-trip to enqueue (one GitHub Contents API write).
- The queue applier interval. The card LOOKS instant on the same tab, but `router.refresh()` re-fetches and re-renders the whole page — that fetch + paint is what feels slow.

`router.refresh()` is the perceived hang. The toast fires immediately, but the Server Component refresh re-loads every Server Component on the page (Kanban, side panel, header, breadcrumbs). A 200ms fetch + 300ms hydration round on a slow connection is ~half a second; on a fast connection ~150ms but still visible.

---

## 7. What changes in Steps 19, 20, 21

| Step | Change | File |
|---|---|---|
| 19 | Loosen `memberRoleIds` to non-terminal-only. Allow re-adding to roles the candidate was previously rejected from. Match server behaviour. | `PipelineActions.tsx` |
| 19 | Clear stale `stageOverride` entries from the Kanban when server refresh delivers a matching real stage (so a second drag from the "same" column doesn't compute against the override). | `Kanban.tsx` |
| 19 | Better error copy: when `canTransition` rejects with `currentStage === targetStage`, the toast should read "[name] is already at [stage]; the card may need a refresh" so HR has a clearer recovery hint. | `pipeline.ts` |
| 19 | Tests cover: re-add after Reject, drag onto current column is no-op, server refresh clears the override map. | `__tests__/pipeline.test.ts` and integration via Kanban regression. |
| 20 | Optimistic UI is already implemented for the in-tab case. Refine: avoid `router.refresh()` round-trips on every success (the optimistic override map already paints the new state; only refresh when the override map drifts from server). | `useStageTransitions.ts` |
| 20 | "Saving…" indicator on a card when the request is in flight > 1s, dropped when the response lands. | `CandidateCard.tsx` or `Kanban.tsx` |
| 21 | KanbanFilters: filter state is client-only (no re-fetch). Confirmed in `applyFilters`. No fix needed. | (already perf-clean) |
| 21 | Side-panel candidate search: check debouncing. If a controlled `value` triggers a re-render on every keystroke without debounce, add a short debounce. | `CandidateSidePanel` / search box |
| 21 | Initial load: confirm no N+1 — current code reads `loadApplications`, `loadRoles`, `loadInterviews`, `loadOffers` once each, then in-memory joins. Looks fine. | (already perf-clean) |

This audit is the bridge into Step 19 — it does not change any code.

---

## 8. Step 21 — Kanban perf findings

Walked the obvious surfaces; no actionable slowness:

- **Filter clicks (`KanbanFilters` All / Stale / My adds / etc.)** — fully client-side. `Kanban.tsx:119` runs `applyFilters` inside `useMemo([merged, filters, currentUserEmail])`. No fetch. The URL `replace` on every change is a tiny no-op for the browser. Already fast.
- **Kanban initial load** — Server Component reads `loadApplications`, `loadRoles`, `loadInterviews`, `loadOffers` once each (one fs.readFile per JSON), then in-memory join. No N+1. The cost scales with total candidate count, which is ~hundreds today.
- **Candidate list search** — form-submit (`<form>` → URL `?q=...` → server re-renders). No `onChange` round-trips; debounce is unnecessary because the user explicitly hits Apply.
- **Side panel** — server renders the candidate snapshot once; no inputs that fire on every keystroke today.

No commits filed for Step 21. The findings stand as a snapshot — promote any of these to active work the first time HR reports concrete slowness.
