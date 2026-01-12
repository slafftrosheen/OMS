Reclame OMS — Source of Truth (SoT) v1.0

Scope. One canonical reference for Reclame OMS (Reclamefabriek’s order-management system). Covers brand and UX, functional flows, data model, accessibility, i18n, performance, deployment, QA, and contribution rules. Self-contained and agent-ready.

Audience. Admins, workstation operators, logistics, designers/CAD, fabrication leads, PMs, and engineers.

Status. Living document; changes require a PR that explains the rationale.

1) Brand, Voice, Positioning

What we are: An end-to-end production OS for visual signage: order intake → CAD → CNC → finishing (sanding/bending/welding/paint) → assembly → QC → logistics.

Who we serve: Internal teams (Admin, CAD, Workstations, Logistics), with client-facing export artifacts (traveller, loading manifests).

Voice: Straight, operations-first; label things the way the shop talks. No buzzwords. Every screen should answer: what should I do next?

Primary outcomes/KPIs: On-time loads, fewer blockers, fewer reworks, and instant traceability of revisions/stage history.

2) Information Architecture (IA)

Top-level sections:

Orders. The core: repo-like “Order Records” that contain the order form + PDF/asset previews + revisions/branches + change requests (PR-style approvals) + stage status and rework cycles.

Calendar. Admin-managed Loading Dates; assign orders to upcoming load slots; export daily manifests (CSV).

Stations. Per-station boards: CAD, CNC, SANDING, BENDING, WELDING, PAINT, ASSEMBLY, QC, LOGISTICS.

Dashboard. KPIs: blocked orders, top rework stations, R&D count, done/total, by-stage breakdown.

Assets. (Read-only) previews of PDFs/images tied to orders; no raw folder browsing for operators.

Settings. Users/roles, themes, languages, notification prefs.

Right rail (persistent): Notifications (top), Chat (bottom). Both scroll internally; the page never resizes.

Header actions: brand logo, compact theme/language/text-size controls, notifications counter, small avatar + quick user switch (role aware).

3) Reusable Modules & Components

Order Form (admin-created):

Core fields: PO/ID, client, title, due date, Loading Date (chosen from Calendar’s load slots), R&D flag + R&D notes, materials (type/thickness/colors with RAL/Pantone/HEX), attachments (PDF primary).

Stages (no percent bars): NOT_STARTED, QUEUED, IN_PROGRESS, BLOCKED, REWORK, COMPLETED for each station.

Rework cycles: per-station repeat log (RECUT / RESAND / REPAINT / … + note, user, timestamp).

Assignees: users per station (drives mentions/notifications).

Badges: URGENT, R&D, READY_TO_SHIP, etc.

Change Requests (CRs). Station proposals become CRs (admin approves/applies). CR compare view highlights changed fields/materials/stages.

Calendar: Loading Dates. Admin toggles “Loading Mode,” marks capacity/notes per day. Orders select from upcoming load days. Daily Schedule view + Export CSV.

Chat v2. Rooms (General, Workstations, Logistics), @mentions with autocomplete, persistence-ready structure. System posts on rework/completions.

Notifications. Right-rail list; unseen counter in header; live region for screen readers.

PDF Frame. Embedded PDF with “Open in new tab”; respects theme tokens.

Charts/Metrics. Series palette sourced from CSS tokens; axes/legend colors match theme; lines/bars meet non-text contrast (≥3:1). 
W3C

4) Content & Microcopy Rules

Labels reflect shop terms (e.g., Send to Rework, Assign Loading Date, Station Log).

Button pairs: primary = action (“Apply change”), secondary = safe (“Cancel”).

Errors are clear, actionable (“Provide HEX like #RRGGBB”).

Empty states tell the next step (“No orders for this load day. Assign some from Orders.”).

Avoid percentages for process: show stage names and counts (e.g., “CNC: Completed • x2 repeats”).

5) Design System (Tokens & Themes)

Tokens: --bg-0/1/2, --text, --muted, --border, --accent-1/2, status (--ok, --warn, --danger), --focus.

Themes: LightVim, DarkVim, HighContrast, stored on <html data-theme=>.

WCAG: Body text ≥ 4.5:1; large text ≥ 3:1; UI outlines/borders/focus/indicators ≥ 3:1; chart lines/keys ≥ 3:1. Validate each theme. 
w3c.github.io
+1

Motion: Respect prefers-reduced-motion; no essential info conveyed only by motion.

6) Accessibility (WCAG 2.2 AA)

Semantic headings; ARIA where needed; visible focus; skip link.

Right-rail scrolls inside fixed panels; no layout jump on notifications/chat.

Inputs: programmatic labels, help text, error summaries via ARIA live.

Non-text contrast for UI boundaries, focus rings, chart strokes (≥3:1). 
W3C

Axe-core automated checks in dev; fix color-contrast/focus violations before merge. 
GitHub

7) Animations

Subtle only; never required to understand state.

Dialogs/menus: fade + scale; disable on reduced-motion.

No parallax or marquee effects.

8) Performance Budgets

LCP < 2.5s, INP < 200ms, CLS < 0.1 on mid-tier mobile.

Budget: ≤ 170KB JS on first route (gz), route-split heavy pages, lazy-load PDF viewer.

9) Internationalization (EN/RU/LV)

All UI strings externalized; builds fail if critical keys missing.

Locale persistence + deep-link (?lang=ru).

svelte-i18n or sveltekit-i18n are acceptable; both are SvelteKit-ready lightweight options. 
GitHub

10) Privacy, Security, Compliance

CSP: default-src 'self'; script-src 'self'; img-src 'self' data: blob:; connect-src 'self' https://api.example.com; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'. Tighten as backend lands; avoid inline scripts where possible. 
MDN Web Docs

Strong referrer policy, HSTS (once on custom domain), and no third-party scripts without review.

11) Analytics & Telemetry

Events: order_created, loading_assigned, stage_proposed, stage_applied, rework_sent, pdf_opened, theme_toggle, locale_toggle.

Respect consent; no tracking in operator-only contexts unless strictly necessary.

12) Tech Stack & Hosting

Frontend: SvelteKit + TypeScript; adapter-static for a demo build on GitHub Pages.

Set kit.paths.base = '/reclame_OMS'; add .nojekyll; add 404 fallback. 
svelte.dev
+1

UI: Tokenized CSS (brand.css), Lucide icons, Apex/ECharts for metrics.

Backend (later): REST/WebSocket + Postgres/SQLite; object storage for files; workers for PDF/BOM extraction.

CI: GH Actions build + Pages deploy with BASE_PATH=/reclame_OMS.

13) Domain Model (Minimum Viable)
type Station = 'CAD'|'CNC'|'SANDING'|'BENDING'|'WELDING'|'PAINT'|'ASSEMBLY'|'QC'|'LOGISTICS';
type StageState = 'NOT_STARTED'|'QUEUED'|'IN_PROGRESS'|'BLOCKED'|'REWORK'|'COMPLETED';

type FileRef = { id:string; name:string; path:string; kind:'pdf'|'img'|'other' };

type ReworkReason = 'RECUT'|'RESAND'|'REBEND'|'REWELD'|'REPAINT'|'REASSEMBLE'|'RECHECK'|'CUSTOM';
type StageCycle = { idx:number; station:Station; reason:ReworkReason; note?:string; at:string; by:string };

type Order = {
  id:string; title:string; client:string; due:string;
  loadingDate?: string;
  isRD?: boolean; rdNotes?: string;
  badges: string[];
  fields: { key:string; label:string; value:string }[];
  materials: { key:string; label:string; value:string }[];
  stages: Record<Station, StageState>;
  cycles: StageCycle[];
  assignees: Record<Station,string[]>;
  revisions: { id:string; file:FileRef; message?:string; createdBy:string; createdAt:string }[];
  defaultRevisionId:string;
};

14) Key Flows

Create Order (Admin): upload PDF → fill form (R&D? materials/colors?) → assign Loading Date (or later) → set initial assignees.

Station Update: operator proposes stage change → CR appears → admin applies (or requests change) → system posts notification + chat message with @assignees.

Send to Rework (Admin): choose station + reason + note → stage set to REWORK → cycle logged (x1, x2…) → chat + notification.

Assign Loading: Admin marks load days in Calendar → orders select from list → exports daily manifest (CSV).

Revisions/Branches: uploading a new PDF with same PO adds a revision on the order (admin can promote as current).

15) Deployment (GitHub Pages demo)

adapter-static with base path; include a 404.html fallback so deep links work; add .nojekyll. 
svelte.dev

GH Action: set BASE_PATH=/reclame_OMS during build (see Svelte docs example). 
svelte.dev

16) Testing & Quality

Unit/Integration: Order create/edit, CR lifecycle, stage transitions (allowed graph), Loading Dates assign/export.

A11y: Keyboard nav, focus order, live region updates, non-text contrast, color contrast per theme; axe-core CI/dev gate. 
GitHub

Perf: LCP route budgets and code-split; no console errors; images lazy below the fold.

I18n: Missing-key check for EN/RU/LV; deep link preserves locale; theme independent.

Definition of Done: Criteria met; a11y checks pass; contrast ≥ AA across themes; screenshots updated; release notes line added.

17) Contribution & Workflow

Branching: Feature branches off main; small PRs.

Commits: Conventional (feat/fix/chore/docs/refactor/perf/ci).

PR checklist: Screenshots, a11y notes (axe run), i18n keys, GH Pages preview link.

18) Backlog (Agent-Ready)

Epic A — Shell

Header actions (avatar switch, notif count) and right-rail polish.

Theme/logo auto-swap (light variant) with contrast verification.

Epic B — Orders

Compare View deltas (fields/materials/stages).

Station logs: quick notes + photo attach (future backend).

Epic C — Calendar

Load-day capacity limits and over-capacity warnings.

Manifests with client phone/address and crate count.

Epic D — R&D

Experiment runs (trial revisions) and promotion workflow.

Defect taxonomy per station with analytics.

Epic E — Scanning

QR on traveller; scan-to-stage mobile panel for operators.

Epic F — Security

Harden CSP, strict referrer policy, HSTS; minimal externals. 
MDN Web Docs
# OMS
