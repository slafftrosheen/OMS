# Browser compatibility and order flow implementation plan

Goal: repair local HTTP actions and uploads; verify draft-to-station flow, manager deletion, Telegram, analytics and dashboard navigation.

Constraints: preserve running services and customer data; run checks sequentially with a bounded heap and one worker. Use isolated TEST ONLY records for integration checks. No real Telegram messages without explicit authorization.

- [x] Reproduce notification failures without randomUUID. Use a shared browser-compatible UUID helper for client actions and test missing browser APIs.
- [x] Check upload entry points, browser MIME differences, private storage and retry handling; add regressions for demonstrated failures.
- [x] Implement manager-accessible draft/order deletion with clear confirmation, race protection and retained audit/material history.
- [x] Trace creation, review, confirmation, all station controls, loading/dispatch; validate roles and stale updates.
- [x] Check Telegram configuration/outbox/worker health without sending messages; verify analytics queries and dashboard destinations.
- [x] Run relevant unit suites, type check, production build and available browser journeys sequentially. Record evidence and remaining external limitations.

Evidence and deployment limits: `docs/operations/OMS-browser-order-flow-2026-11-05.md`. Final browser/source reruns passed. The subsequently authorized production rebuild, migration application and deployment completed; see the operations report for release verification.
