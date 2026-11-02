# Telegram questions and live OMS context

Goal: menu /ask prompts for the next private message, and answers can inspect current business records rather than only ten order headings.

Design: retain polling/webhook replay fences and personal/company AI permissions. Persist a five-minute, one-use question session tied to account, connection, role and settings revision. Provide model tools for paginated business records, exact counts and grouped summaries, with explicit source/column allowlists and PostgreSQL RLS under the linked authenticated identity. Business read access follows the existing account permissions; secrets, authentication data, tokens, settings credentials and writes are excluded. Revalidate source record visibility before returning an answer. Treat record content as data, never instructions.

Alternatives: a larger static snapshot still omits records and becomes stale; direct administrative SQL exposes credentials and bypasses account permissions. On-demand RLS reads provide broad current context with bounded requests and explicit pagination.

Implementation:
- [x] Reproduce menu /ask failure with parser test; accept a bare command and multiline questions.
- [x] Add persistent prompt sessions and route ordinary private text through a session-only command.
- [x] Verify real SQL prompt, followup and one-use behavior in a rolled-back transaction.
- [x] Add source catalog and read/count/summary tool with fixed schemas and RLS.
- [x] Add authorization, tool-routing, pagination and revocation regression tests.
- [x] Run source tests, unit tests, Svelte checks and production build sequentially.
- [x] Back up, apply migrations, restart app and verify health. Keep existing local deployment fixes.

Validation: 110 source tests and 1,096 unit tests pass. Svelte check: zero errors, 14 existing warnings. Production build and app health checks pass. SQL checks execute in rolled-back transactions and verify source/column validation, notification ownership, non-manager workforce restrictions and connection revocation. A live OpenRouter exchange performed one actual database read and returned an answer with two provider calls, both HTTP 200. No Telegram test message was sent.

Independent review identified aggregate-result revocation and prompt cooldown edges. Both were fixed in migration 20261102000004, with regression checks that failed before the fixes and passed after. Follow-up review found no further important issues.
