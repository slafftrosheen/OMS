# Connected workspace: Telegram, badges, and canvas

## Requested outcome

All Telegram administration belongs in the RD settings menu, including its credential. The bot supports two-way conversations and useful account actions. Shared badges communicate the same lifecycle, urgency and schedule information throughout OMS. The canvas has one bottom tool dock, persistent rich media, and a structured OpenRouter assistant that can understand and edit the scene.

## Design and boundaries

- Telegram uses the existing Supabase Vault convention for write-only credentials and a private settings record for nonsecret controls. Saved settings override environment defaults. RD can configure, probe and register the integration; each user still links and controls their own account. Webhook commands enforce the linked active account's visibility, replay fencing and bounded delivery. Notification acknowledgement is an account-scoped write. Production workflow transitions remain in their existing authenticated UI. An optional AI question command uses only authorized context.
- A shared semantic badge catalog defines icon, tone and localized label. Derived order badges use authoritative lifecycle status, actual priority, civil due/loading dates and explicit flags. Completed/cancelled work never shows active deadline alarms. The existing calendar consumes the same primitive; order lists, details, review, station boards, recent orders and notifications adopt the shared vocabulary.
- Canvas drawing and insertion tools appear once in a bottom dock, with compact grouped menus at narrow widths. Project/save and assistant controls retain their own purpose. Uploads remain private and board-scoped. Link previews sanitize metadata and validate network destinations; playable embeds use explicit provider rules. Media records survive board reloads.
- The assistant receives a bounded scene graph with IDs, geometry, selection, links, media and read-only boundaries. It returns validated proposals for supported creation, editing and arrangement actions. An explicit Apply action checks target versions and permissions, then applies one undoable transaction. Optional visual context is bounded and routed through the configured vision model. Order form shapes and locked content are protected.

## Implementation ownership

1. Telegram configuration, commands, migrations, admin UI and behavioral tests.
2. Canvas dock, persistent media, safe previews and media tests.
3. Full-scene OpenRouter context, structured action execution and tests.
4. Shared badges, order-list data fidelity, localization integration and final verification.

## Verification

Run focused model/API/executor tests as changes land, then source and complete unit suites, Svelte/TypeScript check and production build. Execute Telegram SQL integration against isolated PostgreSQL. Exercise the actual Svelte/React surfaces in a browser at desktop and phone widths, including light/dark/high-contrast and the three supported languages. Test save/reload, denied/stale AI actions, secret masking, failure recovery and toolbar uniqueness. Review the final diff, commit to main and publish the exact verified tree. Live configuration, real bot registration and deployment are separate operational steps requiring deployment access.
