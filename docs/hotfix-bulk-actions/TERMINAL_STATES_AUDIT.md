# Terminal stage handling - audit

## Which stages are terminal

`src/lib/types.ts:50-56`:

```
TERMINAL_STAGES = ['Rejected', 'OnHold', 'NotInterested', 'Withdrawn', 'Joined']
```

`Joined` is a "good" terminal (success); the other four are "negative" terminals (closed without a hire).

## What blocks transitions OUT

Three layers, each correct for its purpose, but together they leave no path to reopen a closed candidate from the UI:

1. **`src/lib/pipeline.ts:46`** - `canTransition` returns `{ valid: false, reason: 'Cannot move from terminal stage <stage>.' }` whenever `isTerminal(currentStage)` is true. This is the lowest-level guard and runs in both the single-card transition route and the bulk-transition route.

2. **`src/components/stageTransition/useStageTransitions.ts:470-473`** - the client `onIntent` dispatcher fires an error toast `Cannot move <name> from <stage>.` when the source app is at a terminal stage, before any fetch. This is why drag-drop and the per-card forward/back/reject buttons silently no-op for Withdrawn / Rejected candidates.

3. **`src/app/api/applications/[id]/transition/route.ts:65-68`** - defense-in-depth. Even if the client tried to dispatch a transition for a terminal app, the server returns 400 with the same `canTransition` reason.

## Whether this is intentional or a regression

Intentional. `pipeline.ts:46` predates Gate 3 (commit `a70d3f0` Week 1 scaffold). The bulk-transition skip behaviour predates Gate 3 too. Gate 3 / optimistic UI did not change the terminal-stage handling; it only added the per-application feedback gate skip on top of an already-conservative model.

Rationale: terminal stages were intended as the audit-final state. Once HR rejects a candidate or marks them Withdrawn, the assumption was "they're done with this role." A second look would happen via Add to role pipeline from the candidate detail page (which DOES allow re-adding a candidate to a role they're terminal in - see `8d48a3e` for the cross-role move fix).

## Why an explicit Reopen is the right shape

- Add to role pipeline creates a NEW application at Sourced. The recruiter who closed the original application loses the audit trail context. Reopen retains the same application record and appends a reopened-from-<stage> audit entry - better continuity.
- Drag-drop OUT of terminal is intentionally blocked to prevent accidental reopens (a misclick on the Withdrawn column shouldn't quietly flip a candidate back to Sourced).
- A modal-driven, reason-captured action makes the intent explicit and produces an audit entry HR can defend later.

## Implementation contract

- New API route `POST /api/applications/[id]/reopen`. Accepts `{ targetStage: string, reason: string, notifyCandidate?: boolean }`. Permissions: `Admin` always; `HR` always; an `HR` user who created the application (the assigned recruiter) always. Returns 403 for HOD and Leadership.
- Reason ≥10 chars, target stage must be a non-terminal in `role.pipelineStages`, current stage must be terminal.
- Audit entry: `op = 'reopen'`, `before.currentStage = <terminal>`, `after.currentStage = <target>`, notes = `Reopened from <terminal>: <reason>`.
- New API route `POST /api/applications/bulk-reopen`. Accepts `{ applicationIds, targetStage, reason, notifyCandidate?: boolean }`. Same reason rules; one reason applied across the batch; per-candidate audit entries.
- Client modal `ReopenCandidateModal.tsx`. Reused for single and bulk. Renders a reason textarea, a target-stage dropdown (filtered to non-terminal stages for the role; for bulk, the union of non-terminal stages across all selected applications' roles), and a "notify the candidate" checkbox (defers to a follow-up reminder, not an immediate mail blast).
- Drag-drop OUT of terminal remains blocked - no change to `useStageTransitions.onIntent` terminal-check.
- The bulk forward / back actions, when one or more selected candidates are at a terminal stage, do NOT silently skip them; the bar surfaces an inline "<N> already in a terminal state. Reopen them first" hint with an inline `Reopen…` button that opens the bulk-reopen modal pre-populated with those candidates.
