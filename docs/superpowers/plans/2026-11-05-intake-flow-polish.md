# Intake and client address flow expansion

User requested both areas equally. Preserve native OMS forms, existing design tokens, explicit approvals, private file access and ordinary Save Draft.

1. Add behavioral regressions for deliberate catalog resolution, invalid roles/IDs, refreshing manually selected products, and localized apply failures. Extend production review helpers without weakening source conflict handling or automatic exact matching.
2. Refine intake into source setup, a filtered review with counts/current-versus-proposed/evidence, real native catalog pickers, and a clear local-apply summary. Add cancellation and explicit PDF capability states. Preserve unchecked approvals and invalidate replacement approval when selections change.
3. Add a read-only, paged, authenticated address-use history endpoint using existing RLS tables. Extend the existing address widget with search, last-used dates, source-order history, retry/empty/read-only states and edit-bound replacement approval. No new database migration.
4. Cover complete paths in browser tests, including mobile/keyboard, stale async results, cancellation, catalog choices and address history. Translate all new EN/RU/LV UI text and update operations documentation.
5. Inspect rendered desktop/mobile states together, fix findings in one bounded pass, run the mechanical design detector once, then full tests, Svelte check, production build and fresh code review. Commit and publish to main when the inspected remote base remains safe; no production configuration or migrations are applied.
