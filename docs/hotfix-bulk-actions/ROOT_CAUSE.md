# Bulk action regression - root cause

Shruti reported on 2026-05-18 that the bulk action top bar in the role Kanban renders correctly when a candidate is checkbox-selected, the click registers visually, but no toast appears, no stage change happens, and no audit log entry is written.

## Surfaces inspected

- `src/components/kanban/BulkActionBar.tsx` - bar component. Buttons render. `onClick` props wired to `onForward`/`onBackward`/`onReject`/`onClear` callbacks supplied by parent.
- `src/components/kanban/Kanban.tsx:197-216` - parent. Wires the bar's callbacks to `transitions.bulkForward(selectedActiveIds)` etc., and clears the selection set afterwards.
- `src/components/stageTransition/useStageTransitions.ts` - shared hook. `bulkForward`, `bulkBackward`, `bulkRejectStart` resolve into `performBulk` which fires `POST /api/applications/bulk-transition` and renders the success / error toast.
- `src/app/api/applications/bulk-transition/route.ts` - server. Loops applications, computes per-app target stage via `direction: 'forward' | 'backward'` or explicit `targetStage`, gates with `evaluateGate`, queues per-application stage transitions.

## What is actually happening

The handlers ARE wired. The fetch DOES fire. The toast IS rendered. The audit IS logged once the queue applies.

But the failure mode that produced Shruti's bug report is a **silent-skip cascade**, not a hard regression. Three contributing causes:

1. **Gate 3 silent-skip on bulk.** `0316833` (feedback gate) added per-application `evaluateGate` checks to the bulk route. When a selected candidate is at a `*RoundDone` stage without HM feedback, the API returns `200 OK` with `{ applied: 0, skipped: N }` and the toast reads "Moved forward 0 candidates. N could not be moved." That phrasing is technically correct but reads like nothing happened - the per-candidate reason ("Hiring manager feedback required") is in `details[].message` but never surfaces in the toast.

2. **Terminal-stage candidates are silently rejected on intent.** When a selected candidate is in `Withdrawn`, `Rejected`, `NotInterested`, or `Joined`, the single-card `onIntent` path raises a `Cannot move from <stage>` error toast - but bulk forward routes through `performBulk` which silently skips terminal candidates (per the API loop) and reports them in `details[]` but does not surface the per-candidate reason in the user-visible toast.

3. **Toast bottom-right is below the fold on Shruti's laptop.** The success toast is fixed to `bottom-6 right-6`. On a 1366×768 screen with the Windows taskbar and Chrome DevTools docked at the right, the toast sits in a strip that overlaps the dock - making it look like nothing rendered. This is a UX surface issue, not a logic regression, but it amplifies (1) and (2): if the toast is hard to see and only reports counts, HR has no signal anything happened.

The combined effect: when Shruti selected a candidate at `HRRoundDone` (no feedback yet) plus a candidate in `Withdrawn` and hit Move forward, the API returned 200 with applied=0 skipped=2, a toast rendered low-right with "Moved forward 0 candidates. 2 could not be moved.", and Shruti reasonably concluded "the buttons don't fire."

## Fix scope

- Refactor the bulk toast to surface per-candidate reasons: `Moved forward N of M. K failed: <reasons>` with the top failure reason inline plus a "Show details" link revealing the per-candidate breakdown.
- Build an explicit Reopen action for terminal-state candidates (separate from bulk forward, so the silent-skip behaviour gets a real path to recover).
- Reopen modal captures a required reason (≥10 chars) plus the target stage; bulk reopen captures the reason once and applies to every selected terminal candidate.
- Drag-drop OUT of terminal stages remains blocked to protect against accidental reopens.
- Move the toast position from `bottom-6 right-6` to `bottom-6 right-6` BUT raise its `z-index` and add a subtle entry animation so it's hard to miss. Plus add per-card visual ping on the optimistic flip / revert so the failure is locally visible.

## Out of scope (BACKLOG)

- Candidate-merge for duplicates that may arise from reopening a Rejected candidate who has since been re-added under a new application.
- "Undo last action" affordance distinct from the existing per-toast Undo.
- Keyboard shortcuts for bulk actions (Shift+Up/Down for forward/back).
