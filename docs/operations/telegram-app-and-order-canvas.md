# Telegram app and draft canvas

The bot home message now offers buttons for opening OMS, chats, controls, today, orders, notifications, the assistant, and pause/resume. Buttons use the existing private-chat identity, command allowlist, account link and database authorization. Commands remain compatible. Notification messages retain their original record link and add an app launcher.

For an HTTPS application URL, **Settings → Telegram → Update bot app menu** registers Telegram's persistent **Open OMS** Mini App menu with `setChatMenuButton`. The existing registration and command-sync actions update it together; a failure is surfaced as partial synchronization. HTTP installations receive ordinary links instead, as required by the [Telegram Mini App API](https://core.telegram.org/bots/api#webappinfo). Deploy the application before synchronizing the menu. No live bot settings are changed merely by committing this code.

`/telegram` opens a compact workspace with Home, Notifications, Chats and Controls tabs. The tabs use the actual OMS notification store, realtime subscription and chat page, including history, sending, rooms and voice controls. Controls link to role-appropriate existing order, review, calendar, inventory, production and work screens. Telegram preferences reuse the same account linking, pause/resume, category, preview and personal AI controls as Settings.

Authorization remains the OMS login and Supabase RLS. The Telegram SDK is used for ready/expand presentation only; `initDataUnsafe` does not authenticate users. A user without an OMS session signs in once in the webview, then returns to the requested app page. No bot credential is shipped to the browser. Opening the app never sends a chat message or changes an order. Full OMS exits the compact navigation for that browser session.

## Draft canvas

New Order has Form view / Canvas view. Both share the same local draft values. The client, dates, delivery, address history, priority and R&D fields share `OrderDraftFields` in normal creation, editing and canvas. The production form on canvas mounts `OrderNativeProfileForm`, which uses the same `Profile7stVisual` component and real catalog pickers as normal mode. Quantity is stored separately from profile configuration. Existing canvas profile records are refreshed from the canonical draft configuration; the former hardcoded material and LED lists are removed.

Canvas provides Upload files, Note, Warning, Explain, Draw, Mark, Arrow and Select controls. Annotation badges carry a comment type, editable icon and explanation. They are annotations, never production approval. Original files are displayed as document/image nodes, with upload progress and individual failures shown. Paste, file picker and drag/drop share the order attachment pipeline. New unsaved drafts keep files locally until Save; the saved snapshot replaces temporary URLs with canonical private file downloads.

Form application remains local. Save uses the ordinary draft revision guard, then saves canvas placement with the returned revision. A canvas failure keeps the created draft available for retry and prevents submission. Read-only canvases disable mutation and upload controls. No production migration is required by these interface changes.

## Verification

Run `TZ=UTC npm test`, `npm run test:unit`, `npm run check`, `npm run build`, and the Playwright configurations `playwright.production-intake.config.ts`, `playwright.telegram-app.config.ts`, and `playwright.order-canvas.config.ts` under `tests/ui`. Browser tests use controlled service responses; they do not send messages to real teammates or mutate the live Telegram bot.

Verified on 2026-11-09: 110 application tests, 1,173 unit tests, two isolated database migration tests, all five private PDF fixture checks, and 36 Chromium scenarios (33 intake, one Telegram workspace, two canvas) passed. The browser scenarios cover real-page upload entry points, upload-only and upload-and-analyze behavior, preview switching, explicit review, stale-edit protection, chat sending, notification read/pause actions, persistent canvas uploads, native form editing, annotation restore, and read-only controls. Svelte check reported zero errors and the same 14 existing warnings; focused ESLint had no errors, and the production Node build completed. Mobile/light and mobile/dark screens were inspected. These tests use controlled service responses; live provider inference, Telegram transport and deployment acceptance remain separate release checks.
