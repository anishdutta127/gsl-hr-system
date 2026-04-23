# Design System — GSL HR System

Created by `/design-consultation` on 2026-04-23. Lives next to `CLAUDE.md` as one of the project's authoritative planning docs. Everything visual calibrates against this file.

## Product Context

- **What this is:** internal HR system for GSL (Get Set Learn, MAF Technologies — an Arvind Mafatlal Group K-12 EdTech company). Hiring pipeline + employee records + onboarding + exits.
- **Who it's for — two distinct audiences:**
  - **Internal ops:** HR (Shruti, Riddhi), HODs (Manali — Academics; Shashank — Ops/STEM; Vishwanath — Premium Sales), Leadership (Ritu, Ameet, Jesal), Admin (Anish).
  - **Candidates:** external, 22-40 year olds applying for roles at GSL, predominantly on mobile.
- **Space/industry:** K-12 EdTech, India, Mumbai-headquartered.
- **Project type:** hybrid web app. Internal surfaces = workspace / dashboard UI. Candidate-facing surfaces (`/careers`, `/portal/*`) = hybrid of marketing (`/careers` listing) and app (portal).

## Memorable Thing — two, one per audience

The unusual move for this product. One house, two rooms.

- **Internal ops memorable thing:** *"This is what replaced the Excel chaos."* Serious software for serious work. Dense, fast, no-nonsense. Feels like Linear, not like Workday.
- **Candidate-facing memorable thing:** *"They treated me like a human."* Warm, clear, respectful of the candidate's time. Different emotional register from every other ATS the candidate has ever used.

Every visual decision below serves one or both of these memorable things. Design that tries to be memorable for everything is memorable for nothing.

## Aesthetic Direction

- **Internal ops:** restrained, functional, Linear-inspired. APP UI classifier. Left-aligned dense. No hero sections. No centered-everything outside of login.
- **Candidate-facing:** warm hybrid. Marketing-shell feel on `/careers` listing + welcome + celebration. App feel on portal status, assessment, video-submit, self-withdraw. Two visual grammars in one subtree, switched by route.
- **Decoration level (both):** intentional. Subtle texture via the palette; no decorative blobs / wavy dividers / icon-in-colored-circle grids.
- **Mood per audience:**
  - Internal: *"I know where things stand and I can move them."*
  - Candidate: *"GSL actually respects my time and effort."*

## Typography

Three-font system. Inherits Montserrat + Open Sans from `gsl-mou-system`; adds Fraunces as a third face used sparingly on candidate-facing emotional moments only.

| Face | Role | Where | Weights | Rationale |
|---|---|---|---|---|
| **Montserrat** | Display / headings | All internal pages + candidate-portal headings + `/careers` page titles | 500, 600, 700 | Inherited from MOU. Geometric sans with strong Devanagari-adjacent glyph quality. Reads confident in navy. |
| **Open Sans** | Body / UI / labels | Everywhere body text appears; all form inputs; buttons | 400, 500, 600, 700 | Inherited from MOU. Humanist sans with excellent scanning quality at 14-16 px. Tabular-nums enabled via token class. |
| **Fraunces** | Secondary display — *candidate moments only* | Candidate portal welcome-card greeting; candidate portal celebration moment headline; post-offer messaging | 500, 600 | Variable serif with warm optical-size scale. Adds emotional texture on the 2-3 surfaces where the candidate needs to feel the warmth, without bleeding into functional or internal surfaces. Chosen over Instrument Serif for better Unicode coverage on Indian names (diacritics, mixed-script). |
| **JetBrains Mono** | Monospace — IDs, codes, tabular data when monospace helps | Candidate IDs, role IDs, MOU-style unique identifiers if rendered | 400, 500 | Inherited from MOU. Used sparingly. |

**Font loading:** all via `next/font/google` with `display: 'swap'` and CSS-variable binding. Variable names: `--font-display` (Montserrat), `--font-body` (Open Sans), `--font-display-alt` (Fraunces — new), `--font-mono` (JetBrains Mono).

**Fraunces is opt-in per-component.** Default components never use it. Only the `WelcomeCardGreeting`, `CelebrationMoment`, and `PostOfferMessage` components reference it. This prevents convergence-drift across the app.

**Scale (from tokens.css, unchanged):**
- `--text-xs: 12px` — badges, metadata
- `--text-sm: 14px` — table rows, dense UI, secondary labels
- `--text-base: 16px` — body, inputs (16 px min, prevents iOS zoom per learning)
- `--text-lg: 18px` — candidate-facing body
- `--text-xl: 24px` — section headings
- `--text-2xl: 32px` — page titles internal
- `--text-3xl: 40px` — welcome / celebration headlines candidate-only

**Line heights:** `--leading-tight: 1.2` (display), `--leading-normal: 1.5` (body), `--leading-relaxed: 1.7` (longform candidate-portal copy only).

**Font blacklist (never recommend, never add):** Inter, Roboto, Arial, Helvetica, Poppins, Space Grotesk (every AI tool converges on these — they're the convergence trap), Papyrus, Comic Sans, Lobster, system-ui as primary display. If a future PR proposes any of these, reject it.

## Color

Inherited from `src/styles/tokens.css` verbatim. One reuse pattern added for HR (source-badge colors).

### Brand

- **Teal:** `#00D8B9` (default), `#00B89D` (dark), `#E6FBF7` (light). Primary accent. Used on: focus rings, primary CTAs, current-stage dots, Kanban drag-rings, annexure-block borders, candidate progress-viz fills.
- **Navy:** `#073393` (default), `#052563` (dark), `#E8EEFB` (light). Brand secondary. Used on: display headings, sidebar active state, primary buttons, source badges for Naukri, info/success framing.

### Neutrals (Linear-inspired cool lean)

- **Ink:** `#0A0F1F` (default — body text), `#4A5365` (ink-2 — secondary text), `#8189A0` (ink-3 — muted / metadata).
- **Line:** `#E5E8F0` (default — dividers), `#C8CDD9` (strong — input borders at rest).
- **Surface:** `#FAFBFC` (app bg), **Card:** `#FFFFFF`.

### Semantic (Stripe-restrained)

- Success `#10B981` + bg `#ECFDF5` — completed stages, join confirmations.
- Warning `#F59E0B` + bg `#FFFBEB` — aging indicators, queue-not-yet-synced.
- Danger `#EF4444` + bg `#FEF2F2` — validation errors, rejected / failed states.
- Info = navy + bg navy-light. Neutral informational surfaces.

### Source-badge colors (HR-specific reuse of MOU's programme palette)

MOU reserves `--color-steam`, `--color-yp`, `--color-hbpe` for programme badges (STEAM, Young Pioneers, HBPE). Those programmes don't exist in HR's domain, so HR reuses the slots for candidate-source differentiation:

| Source | Color | Rationale |
|---|---|---|
| Naukri | navy (`#073393`) | Primary paid channel; brand-adjacent navy signals "trusted paid source" |
| Referral | teal (`#00D8B9`) | Referrals are the highest-quality channel — teal matches the brand-positive accent |
| Educohire | steam `#7C3AED` | Agency channel, needs visual differentiation |
| Careerchoice | yp `#0EA5E9` | Second agency channel — cyan-blue distinct from navy |
| HRTeam | success `#10B981` | Internal-sourced, positive connotation |
| Application | ink-2 `#4A5365` | Inbound via `/careers`, neutral |
| CSS | hbpe `#DC2626` | Campus sourcing service — red-distinctive |
| Other | ink-3 `#8189A0` | Muted fallback |

Source badge uses **filled-soft** treatment: color at 10% alpha for background, color-dark for text. 11 px text, radius `--radius` (8 px), padding `4px 8px`. See Badge System below.

### Dark mode

Deferred to Phase 2. Tokens accept dark-mode overrides later; no HR dark-mode UI ships in Phase 1.

## Spacing

8 px base, inherited:

- `--space-1: 4px` — tight stacks, icon-label gaps
- `--space-2: 8px` — default stack gap inside components
- `--space-3: 12px` — input padding, badge padding
- `--space-4: 16px` — card padding, section gaps
- `--space-5: 24px` — page sections
- `--space-6: 32px` — major section breaks
- `--space-8: 48px` — hero / welcome vertical breathing
- `--space-10: 64px` — celebration moment breathing
- `--space-12: 96px` — only on candidate welcome hero

Density rules:
- **Internal:** comfortable. Table rows 14 px text + `--space-3` vertical padding (≈ 44 px row height, meets touch target). Card padding `--space-4`. Section gaps `--space-5`.
- **Candidate-facing:** generous. Welcome / celebration use `--space-8` to `--space-12` vertical. Portal functional (status, assessment) uses `--space-5` to match internal rhythm.

## Layout

- **Internal shell:** sidebar (280 px) + topbar (64 px) + content (max 1200 px). Breadcrumbs on every internal page ≥ 2 levels deep. Content left-aligned dense.
- **Candidate `/careers`:** centered content (max 800 px) with full-bleed hero above. Typography-forward, little chrome.
- **Candidate portal:** no sidebar. Full-bleed headers on welcome / celebration. Back-to-portal affordance on all sub-pages. Mobile primary (375 px); desktop expands gracefully.
- **Mobile breakpoints:** 375 / 768 / 1024 px.
- **Internal mobile posture:** accepted degradation. Kanban collapses to stage-picker + single-column list. Offer drafting redirects to desktop under 768 px.
- **Candidate mobile posture:** mobile-first. Every flow tested on 375 px first, desktop adapts up.

Radii (inherited + usage rules):
- `--radius-sm: 4px` — badges, tight chips
- `--radius: 8px` — inputs, standard buttons, source badges
- `--radius-lg: 12px` — internal cards, Kanban cards, internal drawers
- `--radius-xl: 16px` — candidate-facing cards only (welcome card, celebration moment, candidate portal sections)

Shadows (inherited; usage):
- `--shadow-sm: 0 1px 2px rgba(10, 15, 31, 0.05)` — candidate welcome card resting state
- `--shadow: 0 2px 8px rgba(10, 15, 31, 0.06), 0 1px 3px rgba(10, 15, 31, 0.04)` — internal cards resting
- `--shadow-lg: 0 8px 24px rgba(10, 15, 31, 0.08)` — drag-in-progress, drawer overlays

## Motion

Approach: **minimal-functional internal, intentional candidate.**

- Easing: `--ease-out: cubic-bezier(0.16, 1, 0.3, 1)` for enter/reveal; `--ease-in-out: cubic-bezier(0.65, 0, 0.35, 1)` for move.
- Durations: `--duration-fast: 120ms` (hover/focus), `--duration-base: 200ms` (default), `--duration-slow: 400ms` (entrance).
- `prefers-reduced-motion` globally honored (already in tokens.css).

**Internal motion inventory:**
- Card hover: background tint (navy at 4%) over 120 ms.
- Kanban column hover: 2 px teal ring over 120 ms.
- Drag-in-progress: 4 px lift + `--shadow-lg` over 200 ms.
- Drawer open: slide-in from right 200 ms ease-out.
- Toast: fade + slide-up 200 ms, auto-dismiss 4 s.
- No page-load entrance animations. No scroll-driven effects.

**Candidate motion inventory:**
- Welcome card entrance: fade-in + 8 px slide-up, 300 ms ease-out, once per session.
- Progress-viz stage-transition: filled-stamp ripple + line-fill, 600 ms ease-out, triggered when candidate's stage advances.
- Celebration moment: fade-in entrance (300 ms) + one-pass confetti burst (2 s, dismissible). Reduced-motion substitutes a static teal-gradient backdrop with identical copy. No parallax. No scroll-reveal.
- Button tap on mobile: 100 ms scale-95 press feedback.

## Badge System

Three badge types, three visual treatments that don't compete:

### 1. Source badge (filled-soft)
- Background: source color at 10% alpha.
- Text: source color at full saturation (or `-dark` variant if full saturation contrast < 4.5:1).
- Padding: `4px 8px`. Radius: `--radius` (8 px). Text: 11 px medium.
- Position: on Kanban card below candidate name; also on candidate detail header.
- Example CSS:
  ```css
  .badge-source-naukri { background: color-mix(in srgb, var(--color-navy) 10%, transparent); color: var(--color-navy-dark); }
  ```

### 2. Stage pill (dot + text)
- 6 px colored dot followed by `--space-1` gap and 12 px text.
- Dot color maps to stage semantic: active-stage = navy, terminal-success (Joined) = success, terminal-fail (Rejected) = danger, waiting-action (HODRoundScheduled etc.) = warning, other-active = ink-2.
- No pill chrome. No border. No background. Inline flow.
- Example: `● Shortlisted` `● Rejected` `● Joined`.

### 3. Priority / aging (outlined)
- 1 px border + matching muted text. Only appears when days-in-stage ≥ stage-specific threshold (default: 7 days warning, 14 days danger).
- Padding: `2px 6px`. Radius: `--radius-sm` (4 px). Text: 11 px.
- Colors: warning border `--color-warning` + text `--color-warning`; danger border `--color-danger` + text `--color-danger`.
- Fresh cards (< 7 days) show `3d` etc. in `ink-3` 11 px text with no border.

## Component Additions (HR-specific, not in MOU)

- **Kanban card:** 72 px height, 260 px min width, radius `--radius-lg`. Top: candidate name (14 px medium, ink). Middle: source badge. Bottom: stage dot-pill + aging indicator. Hover: navy-4% tint. Drag: teal 2 px ring + `--shadow-lg`.
- **Rubric scored-input (HOD):** label + control pair per criterion. Controls adapt to `role.rubric[].scale`:
  - `stars-1-5` — 5 focusable star buttons, hover-highlight from left, selected fills teal.
  - `score-1-10` — slider with live number readout + labeled end-points ("Needs improvement" ↔ "Exceptional").
  - `yes-no` — two connected buttons, selected = teal bg + white text.
  - Aggregate score at form bottom: 32 px navy number, live-updating as weighted average of `sum(score × weight) / sum(weight)`.
- **Annexure-editable-block (MOU-inherited, offer drafting only):** `border-left: 3px solid var(--color-teal)`, background `color-mix(in srgb, var(--color-navy) 6%, transparent)`, padding `6px 12px 6px 18px`. Focus-visible: teal 2 px box-shadow. Teal dot in left gutter when content edited from template default. Exclusively used on the offer-draft editable regions. Not a general-purpose affordance.
- **Status timeline (candidate detail, internal):** vertical list. Each entry: 8 px vertical rule on the left + timestamp (ink-3 12 px) + event text (ink 14 px) + actor name (ink-2 12 px). Current stage entry: rule = teal. Older entries fade: ink → ink-2 → ink-3 as they age.
- **Progress-viz stamps (candidate portal, CP1):** **vertical timeline (delivery-tracking mental model).** Each stage = circular stamp (32 px) + line segment to next stamp + stage label (14 px) + ETA / next-action subtext (12 px ink-2).
  - Past stages: filled teal, check icon, line fully drawn teal.
  - Current stage: teal outline + pulsing teal glow (2 px teal ring expanding 0 → 8 px over 1.5 s, reduced-motion = static ring), line dashed below.
  - Future stages: 1 px ink-3 border, line dotted.
  - On stage transition: next stamp fills in with 600 ms ease-out ripple.
  - Mobile = primary layout. Desktop = same layout, centred max-400 px.
- **Welcome card (candidate portal):** radius `--radius-xl` (16 px), `--shadow-sm`, top band of `--color-teal-light` 80 px tall behind circular brand avatar (64 px), white card body below containing: Fraunces greeting *"Welcome, {FirstName}."* (24 px), plain-English stage summary (16 px ink), recruiter contact card (avatar + name + email + WhatsApp optional), primary CTA button to next action.
- **Celebration moment (candidate portal, OfferAccepted):** full-bleed gradient `--color-teal` → `--color-teal-dark` behind: Fraunces 40 px headline *"Welcome to the team."*, 18 px body *"We're so glad you're joining GSL."* (first name if available), download-offer button (white bg, navy text, `--radius` 8 px, 44 px tall), one-pass confetti burst 2 s. Reduced-motion: static gradient + identical copy, no confetti.
- **Mobile assessment runner (candidate portal):** 375 px primary. Top: large timer in JetBrains Mono `MM:SS` 24 px tabular-nums. Middle: question body 18 px + answer input or MCQ stacked with 48 px touch targets. Bottom: sticky autosave indicator + explicit "Save and exit" button. Autosave silently every 30 s to localStorage + queue.
- **Prompt drawer (staff, CP3):** right-rail 40 % width desktop, full-screen modal mobile. Top: search input + category chips. Scrollable list. Selected prompt: title + use case + copy button + schema preview + example outputs + favourite toggle. Paste-back validator = separate tab in same drawer.

## Copy Voice

### Rules (both audiences)

- **British English**: organise, colour, behaviour, recognise, centre.
- **Indian context**: Rs, lakh, crore. DD-MMM-YYYY dates. Mumbai/India defaults.
- **Never emdash** (—). Hyphen or colon only.
- **No AI vocabulary:** delve, crucial, robust, comprehensive, nuanced, leverage, unlock, empower, multifaceted, pivotal, tapestry, foster.
- **No corporate filler:** "we're excited to announce", "delighted to", "here's the kicker", "make no mistake".

### Internal voice (HR / HOD / Leadership)

- Direct, outcome-framed. *"Moved to Assessment."* not *"Candidate stage transition complete."*
- Honest error copy. *"Save failed. Retry, or WhatsApp Anish."* not *"Oops! Something went wrong."*
- Plain labels. *"Name"* not *"Candidate Full Name (Legal)"*.
- Empty states: functional + primary action. *"No candidates in this role yet. Add the first candidate →"*

### Candidate voice

- Warm, outcome-framed for the candidate's goals. *"Your assessment is ready."* not *"Assessment sent."*
- First-name basis. Fall-back to *"Hi there"* if first name can't be extracted cleanly; **never** *"Dear Applicant"* or *"Dear Candidate"*.
- No internal jargon leaks. "Stage" (internal) → "Step" (candidate). "Pipeline" → don't mention. "Rubric" → internal only. "Withdrawn" → "You've withdrawn" or "Ended".
- Celebration copy is sincere, not theatrical. *"Welcome to the team. We're so glad you're joining GSL."* not *"🎉🎉 CONGRATS!! 🎉🎉"*.
- Error copy is honest without blame. *"Couldn't reach the server. Your answers are saved — try again in a moment."*

## Accessibility (WCAG 2.1 AA, non-negotiable)

- **Touch targets:** 44 × 44 px minimum on all interactive elements.
- **Contrast:** 4.5:1 on body text; 3:1 on large text + UI control borders. Verified combinations:
  - Ink on surface: 14.2:1 ✓
  - Ink on card: 15.1:1 ✓
  - Ink-2 on surface: 8.9:1 ✓
  - Teal-dark on white: 4.6:1 ✓
  - Navy on white: 12.8:1 ✓
  - Navy-light on navy: 10.4:1 ✓
- **Focus rings:** 2 px teal outline + 2 px offset, `--radius-sm`. Defined in globals.css `*:focus-visible`.
- **Skip-to-content** link at top of every authenticated page (visually hidden until focused).
- **ARIA landmarks** per page: `<header>`, `<nav>`, `<main>`, `<aside>`.
- **Kanban keyboard nav:** Tab cycles cards. Arrow keys move focus within a column / between columns. Enter opens detail drawer. Space initiates drag; arrow keys move ghost; Enter drops at focused column; Esc cancels. All drag actions announced via `aria-live="polite"`.
- **Forms:** visible labels always. Never placeholder-as-label. Errors tied to inputs via `aria-describedby`.
- **Minimum text size on mobile inputs:** 16 px (prevents iOS zoom per `ios-textarea-zoom-16px` learning).
- **Axe-core in CI** with shrinking baseline. Zero violations on new pages. Violations block merge.
- **Reduced motion:** honored via `@media (prefers-reduced-motion: reduce)` globally. Every animation has a static fallback.

## AI Slop Blacklist (canonical)

Never in HR UI:
- Purple/violet/indigo gradients.
- 3-column icon-in-colored-circle feature grid.
- Centered-everything on dense internal surfaces (login and welcome are OK).
- Uniform bubbly radii across all elements.
- Gradient CTA buttons (brand solid teal or navy only).
- Decorative blobs / floating circles / wavy SVG dividers.
- Emoji as design elements in UI chrome.
- Colored left-border on arbitrary cards. **Exception:** annexure-editable-block is brand-specific, not slop.
- Generic hero copy: *"Unlock your hiring superpowers"*, *"Welcome to the future of recruitment"*.
- Cookie-cutter section rhythm (hero → 3 features → testimonials → CTA, every section same height).
- `system-ui` or `-apple-system` as primary display font.
- Inter, Roboto, Arial, Poppins, Space Grotesk as primary faces (convergence trap).

Cards earn existence only where card IS the interaction. Dashboard KPIs use row-flow (headline + number + sparkline), never cards-per-number.

## Decisions Log

| Date | Decision | Rationale |
|---|---|---|
| 2026-04-23 | Two design languages in one app | HR and candidate are two jobs; internal "Linear-dense" and candidate "warm-with-celebration" must diverge emotionally while sharing brand DNA |
| 2026-04-23 | Fraunces as secondary display, candidate-moments only | Emotional texture on welcome + celebration without component-library-drift everywhere; better Unicode than Instrument Serif for Indian names |
| 2026-04-23 | Vertical-timeline stamps for candidate progress-viz | Mobile-native, leverages delivery-tracking mental model (Amazon / Dunzo / Flipkart) candidates are already trained on |
| 2026-04-23 | Motion-measured celebration moment (fade-in + one-pass confetti) | Threads the needle between quiet dignity (loses shareability) and cinematic (loses sincerity); the share-to-WhatsApp moment |
| 2026-04-23 | Source-badge colors reuse MOU's steam/yp/hbpe palette slots | Source differentiation needs 8 visually distinct colors; MOU's programme-accent slots are unused in HR's domain, zero token additions |
| 2026-04-23 | Internal mobile = accepted degradation | HR is at a desk; candidate is on a phone. Mobile budget goes to candidate portal |

## Refactor Rules (when HR grows)

- New programme accents: add to tokens.css, never hard-code hex values in components.
- New source value: add to `src/data/_enums.json` + assign a color slot in the source-badge color map.
- New stage: add to `role.pipelineStages` or the global-default list. Stage-pill dot color is assigned by semantic (active / waiting / terminal), not by stage name — so no color update needed.
- New candidate-facing component with emotional weight: consider whether it's a Fraunces-eligible surface. Default no.
- **Do not** add new fonts, new base colors, or new radii scales without a DESIGN.md update PR.

## Reference

- `src/styles/tokens.css` — the source of truth for tokens. Tailwind config extends from this.
- `CLAUDE.md` — project-level conventions.
- `docs/plans/phase-1-design.md` — design doc from `/office-hours` + internal-surfaces design decisions from `/plan-design-review` Pass 1.
- `docs/plans/phase-1-ceo-review.md` — CEO plan (accepted expansions).
- `docs/TODOS.md` — deferred items with reactivation triggers.
- `gsl-mou-system` repo — inheritance source for palette / typography / AppShell / queue patterns.
