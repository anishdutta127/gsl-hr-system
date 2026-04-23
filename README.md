# GSL HR System

Internal HR system for GSL — hiring pipeline, employee records, onboarding, exits.

Fork-in-spirit of [`gsl-mou-system`](https://github.com/anishdutta127/gsl-mou-system): same Next.js 14 / Tailwind / TypeScript stack, same queued-write architecture, same accessibility bar. Shipping GSL-first, multi-tenant-ready for a future Mafatlal Group pitch.

## Status

Phase 1 scaffold. Planning via the gstack cycle (`/office-hours`, `/plan-ceo-review`, `/plan-eng-review`, `/plan-design-review`) is next. See `CLAUDE.md` for the non-negotiables inherited from MOU.

## Stack

- Next.js 14 App Router, TypeScript strict
- Tailwind v3 with CSS custom-property tokens
- Lucide icons
- `docxtemplater` + `pizzip` for offer / appointment letter generation
- Data in `src/data/*.json`, every write through a GitHub Contents API queue

## Scripts

```
npm run dev       # next dev
npm run build     # next build
npm test          # vitest
npm run e2e       # playwright
```

## Conventions

British English. Indian number format (Rs, lakh, crore). No emdash. WCAG 2.1 AA enforced.
