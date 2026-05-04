# Backlog

Items deferred from current scope. Severity tags from the Phase 3 R3 mobile QA sweep:

- **P0** — blocks Shruti from working on mobile (already fixed when found)
- **P1** — usable but visibly off; promote when Shruti's testing confirms it bites
- **P2** — cosmetic only; promote only if it accumulates with other issues on the same page

## Mobile (375px / iPhone SE) — surfaced 2026-05-04

### `/dashboard`

- **P1** — `RowFlowList` uses fixed `w-40` (160px) for label column. At 375px that's 43% of viewport, leaving roles cramped. (`src/app/(staff)/dashboard/page.tsx:186`)
- **P2** — KPI grid `grid-cols-2 sm:grid-cols-4` stays 2-col at 375px. Tight but readable.

### `/roles/new`

- **P2** — `max-w-2xl` form at 375px with 16px outer padding leaves ~343px usable. Visually cramped, functional.

### `/candidates`

- **P1** — Search form input has `flex-1 min-w-[200px]`; at 375px the 200px floor forces uneven wrapping of the dept select and submit button. (`src/app/(staff)/candidates/page.tsx:135-177`)
- **P2** — Bulk-action modal uses `max-w-md` (448px); tight at 375px with `p-4` gutters but text wraps OK.

### `/candidates/[id]`

- **P1** — "View resume" anchor uses `min-h-[36px]`, below the 44px CLAUDE.md non-negotiable. (`src/app/(staff)/candidates/[id]/page.tsx:145`)
- **P2** — Resume section header row `flex flex-wrap items-center justify-between gap-3` wraps awkwardly at narrow widths.
- **P2** — Applications-section button row tight; works.

### `/employees`

- **P1** — Search form has the same `flex-1 min-w-[200px]` issue as `/candidates`. (`src/app/(staff)/employees/page.tsx:60-106`)

### `/portal/me`

- **P2** — Application card row `flex items-start justify-between gap-3` may wrap at 375px with long role titles plus status badge.

### `/careers/[roleId]`

- **P1** — `lg:grid-cols-[1fr_420px]` only stacks below the lg (1024px) breakpoint. Sidebar should display full-width when stacked; needs visual confirmation that nothing overflows the 420px content. (`src/app/careers/[roleId]/page.tsx:84`)
- **P2** — Prose body uses `prose-sm max-w-none`, no mobile-specific font-size cap; long lines acceptable but could be tightened.

### `/` (Home)

- **P2** — KPI grid same as `/dashboard` (2-col at 375px instead of 1-col on very narrow screens).

## Promotion criteria

- Promote a P1 to active work when Shruti reports it as a blocker, OR when two related P1s on the same page surface in the same testing session.
- Promote a P2 only if (a) it stacks with a P1 on the same page, OR (b) it's part of a broader "polish pass" sprint.
- Don't fix mobile P1s in isolation; batch them per-page so each commit produces a visible improvement.

## Other deferred items

(empty — promote future deferrals here)
