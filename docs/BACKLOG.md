# Backlog

Items deliberately deferred from the gate that shipped them. Each entry names the **reactivation trigger** — the specific signal that promotes it to active work.

Compare to `docs/TODOS.md` (open items with no specific trigger), this file is for items we have **chosen not** to build now and want to remember why.

---

## HR Gate 3 (2026-05-13)

### Pre-onboarding email automation

#### Direct SMTP send (replaces mailto: throughout)

Today every "Send …" affordance opens a mailto: in the user's mail client. Phase 1.1 would replace this with a direct send (e.g. via Resend, the same provider `deliverEmail` already uses). The recruiter would no longer review the draft in Outlook — the system would fire and confirm.

**Reactivation trigger**: Riddhi confirms that mailto: is functioning correctly during her testing pass AND HR collectively asks for a fully automated send (eliminating the per-email Outlook click). Both conditions, not either. Pre-condition: a thread on attachment handling (mailto: cannot carry attachments; SMTP can — we would need an attachment-picker UI tied to actual file storage).

Scope when promoted: send via Resend, signed envelope tracking (delivered / bounced), reply-to wired to the recruiter, audit log captures the message-id.

#### Inbound email parsing (auto-detect candidate offer response)

Step 8 records candidate offer responses manually because we are not parsing inbound mail. Phase 1.1 would auto-detect Accepted / Declined from the candidate's reply (heuristics + keyword scan, candidate name in the From, last-7-days only) and pre-fill the response form for HR to confirm.

**Reactivation trigger**: HR consistently lags > 24h on recording responses for accepted candidates, and the lag delays appointment-letter sends measurably. Symptom: appointment-letter average-time-to-send creeps above 48h.

Scope when promoted: an SMTP / IMAP listener (Microsoft Graph for Outlook, more likely), pattern matching on the offer-intimation subject line, a "Suggested response: Accepted (3 of 4 keyword cues fired)" banner on the candidate detail page that the recruiter accepts or overrides.

### Hiring manager feedback gate

#### Rich feedback editor

Feedback today is plain textareas (strengths, concerns, overall notes). A richer editor with structured headings or a small rubric would help the HOD turn around a useful response faster.

**Reactivation trigger**: Riddhi reports that HODs are returning feedback that is too thin to evaluate, OR HM feedback in 50%+ of submissions reads "looks good" with no detail.

Scope when promoted: shadcn or tiptap-style rich text editor, structured "would hire / would not hire" + per-criterion comments mirroring the role's existing rubric.

#### Slack / WhatsApp prompt instead of mailto: feedback request

The "Send feedback request" button today opens mailto: with a pre-filled message. Phase 1.1 could integrate Slack (DM the HOD with a deep link) or WhatsApp Business API (HR's preferred channel for time-sensitive nudges).

**Reactivation trigger**: HM feedback response time > 48h is the typical case, AND HR raises the mailto: nudge as ineffective.

Scope when promoted: Slack incoming webhook OR Twilio WhatsApp Business message template (the latter requires Meta approval — 1-2 week lead time).

### Rewards & Recognition module

#### Photo upload for the Recognition card

The MVP card uses initials in a teal circle. The Canva reference includes a photo. Phase 1.1 would let HR upload a face photo per nominee that renders inside the navy card.

**Reactivation trigger**: HR ships R&R for two months and tells us they want the photo before the third month, OR the Leadership team specifically asks for it.

Scope when promoted: face photo upload (1MB cap, basic crop UI), `data/recognition-photos/[employeeId].jpg` storage with traversal guard (mirror resume + hr-documents pattern), render inside the navy card.

#### Canva-fidelity poster generation

The MVP card is a brand-aligned simplified version. Phase 1.1 would produce a poster identical to the Canva reference: exact Montserrat heading + Proxima Nova body weights, exact decorative icon placement, A4 / Instagram-square export.

**Reactivation trigger**: HR consistently downloads the MVP card and edits it in Canva before sharing (signal: the simplified card is too far below the bar for external distribution).

Scope when promoted: Remotion or @vercel/og for SVG-precise rendering, with the company brand assets bundled inside `public/recognition-template/`. Likely 2-3 days of work, mostly typography polish.

#### WhatsApp distribution

The MVP distributes via mailto: BCC all-active-employees. Phase 1.1 would deliver via WhatsApp Business API to a Recognition broadcast list (employee phone numbers from `Employee.phone`).

**Reactivation trigger**: HR confirms WhatsApp open rates beat email rates for in-company comms (this is plausibly the case for GSL given the team mix), AND Twilio WhatsApp Business is set up (1-2 week approval lead time).

Scope when promoted: Twilio WhatsApp Business API, an approved message template that fits the WhatsApp template grammar (no free-form, only variable substitution into a pre-approved skeleton), opt-in list management.

---

## Recognition card scope decisions captured at MVP land (2026-05-13)

These are NOT backlog — these are decisions Shruti has explicitly endorsed. Documented here so a future maintainer doesn't try to "fix" them:

- **No photo upload**: initials placeholder is intentional. Promotion logic above.
- **Brand-aligned simplified visual, NOT Canva pixel-fidelity**: HR can keep using Canva for the highest-fidelity poster runs; the in-system card serves as the canonical reference and is good enough for internal distribution.
- **mailto: distribution**: matches every other "send …" affordance in this gate; same SMTP-vs-mailto decision throughout.
