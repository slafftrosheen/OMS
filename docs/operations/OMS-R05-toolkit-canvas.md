# Toolkit — Canvas and visual project workspace (R05 baseline, superseded by R06)

**Superseded sharing/persistence details:** R06 introduces shared manager canvases and private discussions. See [OMS-R06](OMS-R06-toolkit-sharing-stability.md). The R05 statements about per-user canvases and saving chat inside board payload must not be used for deployment.

**Scope:** Repository implementation, not a deployed or browser-tested release. This feature is the successor to the old experimental canvas. The product is branded **Toolkit**; the project UI contains no requirement to use an assistant to work.

## Product workflow

1. Open **Toolkit → Canvas**. Existing personal canvases in `canvas_documents` appear in the project library.
2. Create a blank canvas or choose Project concept, Compare options, or Workshop concept. Template cards are editable.
3. Add **Idea**, **Research**, **Decision**, **Task**, and **Note** cards. Edit title/body inline; tasks and decisions track progress. Reposition and connect cards using the built-in arrow drawing tool.
4. Name your project. The complete tldraw document and conversation proposals autosave after edits; a manual Save action is also available. Failed saves stay marked unsaved.
5. Select a card (or leave nothing selected for whole-board context) and ask the **Brainstorm** panel to explore options, critique assumptions, compare paths or generate next steps.
6. Review suggested cards. **Nothing alters the canvas until Add to board / Add all is clicked.** The user can then freely edit and connect added nodes.
7. Advanced/technical tools (LumiGrid, LED planners, CNC sketches, source/web cards) remain available from the **Technical tools** menu. They are secondary to ideation, not removed from the underlying tldraw schema.

## Architecture and compatibility

- Canonical route: `/toolkit/canvas`; `/toolkit` opens Canvas, and legacy `/ai-lab/... ` URLs redirect to corresponding `/toolkit/...` pages (including conversations). Internal `/api/ai/*` endpoints remain in place for compatibility; no database renaming/migration is required.
- The tldraw canvas is mounted client-side through `TldrawWrapper.svelte` and `CanvasApp.tsx`. Old order-specific shapes and related callbacks stay registered.
- Browser React shape `IdeaShape.tsx` is isolated from Svelte SSR by a pure `idea-model.ts`.
- Project data lives in existing RLS-scoped `canvas_documents` records: `payload = { version, snapshot, conversation, proposals }`. Canvas document creation, retrieval, saving and deletion use the existing authenticated endpoints. Legacy payload with a direct tldraw store snapshot has a compatibility fallback.
- The assistant uses `POST /api/toolkit/brainstorm` with the signed-in session, request limits and existing provider key resolution. Input cards and arrows are normalized, bounded and treated as untrusted data. The model returns a human-readable reply plus validated card proposals; it never receives credentials or database bypass clients.
- Browser state tracks unsaved changes and a local revision counter. Autosave debounces edits, attempts a save on exit, and warns before unload if unsaved. The user cannot deliberately switch boards after a failed save.
- Localized main nav label updated in English, Russian and Latvian. Long-form new Toolkit canvas copy currently has English fallbacks; translation expansion is follow-up.

## Release blockers and acceptance

The repository is **not** known to pass `npm run check` or `npm run build` in the present GitHub-only session. Before deployment, run `npm ci && npm run test && npm run check && npm run build`, and investigate all new errors. The previously pending R01/R02 migrations are still prerequisites to deploying the entire current `main` application; Toolkit itself introduces no SQL changes.

Manual staging walkthrough on a PostgreSQL-17-backed self-hosted Supabase test environment:
- Create empty and templated projects and confirm they appear exactly once in the library.
- Enter title/body, drag nodes, create arrows, modify task progress, refresh and reopen; verify the exact canvas is restored.
- Change board title, confirm autosave and explicit Save, navigate away and back. Force a failed save: show error/unsaved indication and block intentional project switching.
- Select one idea, request alternatives, and verify proposals aren't added automatically. Add one, discard others, refresh and confirm approved node persists.
- Ask for decisions/tasks from multiple connected cards; verify linked context and language behavior.
- Open a legacy saved board; confirm the previous document/shapes still load.
- Access old `/ai-lab/canvas` URL; confirm permanent redirect into Toolkit.
- Verify a second user cannot access/save/delete another user's project (RLS).
- Exercise Keyboard: focusable project and card inputs, tldraw selection tools, brainstorm composer, assistant results; check 360px, tablet and desktop layouts.
- Verify provider missing, rate-limited and unreachable: errors are visible but the user's canvas remains intact.
- Test existing order edit canvas separately to detect regressions in registered shape utilities and autosave listener teardown.

## Known limitations

This is a first substantial visual-brainstorming release rather than a collaborative Miro clone. It does not yet include real-time multi-user cursors, merge conflict resolution between simultaneous browser tabs, source attachment citations, automatic layout of connected graphs, rich document import, or granular role-based project sharing. Those must be explicitly designed and validated before claiming support. Incoming tldraw arrows depend on the installed version's bindings API; manual arrow visuals remain native to tldraw regardless of whether relationship context is extracted. There is no live provider smoke test in this repository-only execution.
