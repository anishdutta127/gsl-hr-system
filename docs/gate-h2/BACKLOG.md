# Gate H2 — deferred items + reactivation triggers

Items the H2 audit found that are workaroundable today. Each entry names
the workaround and the explicit signal that promotes it back into active
work. Don't pull from this list without one of the triggers firing.

## Workaroundable

| # | Item | Workaround today | Reactivation trigger |
|---|---|---|---|
| 7 | Bulk employee profile edit (dept / RM / location across many) | Edit one-by-one via `EmployeeProfileEdit` modal; one queue write per change | A re-org touches >5 employees in a week, OR Riddhi explicitly asks for batch |
| 8 | In-app notifications + bell icon | `/alerts` page shows the cron-fired digest; HOD email on round-scheduled covers the most-urgent fan-out | Leadership asks "where do I see what needs my attention right now without leaving the page?" |
| 9 | Dedicated `/reports/hiring-funnel`, `/reports/headcount`, `/reports/offer-conversion`, `/reports/probation-outcomes` routes | `/analytics` covers headcount, attrition, attendance, leave, HR-ops in 5 widgets with CSV export | Riddhi asks for a report shape that doesn't fit any of the existing widgets |
| 10 | Reverse employee deactivation (un-exit) | Admin edits `employees.json` to flip `status` back and clear `exit` block | First time someone marks the wrong employee as Exited |
| 11 | Edit / correct an issued probation confirmation | Admin edits `employees.json` to walk back `confirmationDate` + `employmentStatus` | First wrong-confirmation incident |
| 12 | Candidate merge UI (combine two records that turned out to be the same person) | The bulk-import dedupe + archived-candidate-suggest path catches most dups before they exist | HR confirms a true duplicate that needs the histories merged |
| 13 | Interview round / document category / onboarding task template CRUD UI | Admin edits the underlying JSON files (`interview_rounds.json`, `document_categories.json`, `onboarding_task_templates.json`) | HR asks to add a new template type and the JSON-edit ergonomics frustrate them |
| 14 | Resurrect rejected candidate for a new role | Manual via candidate detail: change source, re-trigger add-to-pipeline | Pattern emerges of candidates re-applying for different roles after rejection |

## True Phase 1.1

| # | Item | Why deferred | Roadmap |
|---|---|---|---|
| 15 | Multi-tenant migration | Single-tenant by design (CLAUDE.md). 1-2 week pivot when needed | When Mafatlal Group pitch is real, not before |
| 16 | Full candidate self-service portal (vs magic-link only) | Magic-link covers the current candidate journey; full auth depends on employee accounts shipping | Phase 2 — when employee accounts ship |
| 17 | Document expiry auto-rotate | Alerts already cover the pre-warning; auto-issue replacement is structurally bigger | Phase 2 — once HR has used the manual flow long enough to confirm the auto-replace shape |

## Anti-features (do NOT build)

- Mocked test fixtures for the database — we're file-backed JSON; mocks would diverge from production behaviour.
- Multi-step wizard for any HR action — single-screen forms are the pattern; wizards add hand-off cost without earning anything.
- Inline rich-text editors anywhere outside JD authoring — plain text + textareas keep the audit log readable.
- Email approval chains — every offer/exit decision lands directly. Audit log carries accountability; chain reviews are bureaucratic overhead this team doesn't have.
