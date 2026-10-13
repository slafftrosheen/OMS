# OMS — Toolkit localization and AI response-language contract (2026-10-13)

## Contract

- Supported UI locales: `en`, `ru`, `lv`. All selectors use `setLocale`.
- Language selection is stored locally for immediate display and saved in `user_preferences.locale` for signed-in users; anonymous preference GET must not overwrite an explicitly selected login-screen language.
- The user-selected UI locale is passed in both **Toolkit Conversations** and **Canvas Brainstorm** requests. On the server, an invalid or missing request locale falls back to the authenticated user's saved preference, then Accept-Language, then English.
- The AI system instructions require a user-visible reply, proposed card content and action reasons in that locale, regardless of the language of the question or references; schema property names, IDs, URLs, code, proper nouns and enums remain unchanged.
- Model output language is instruction-based, **not** a guaranteed machine-translation postprocessor. Inspect actual answers with the production OpenRouter model before release.
- Changing UI language does not rewrite existing project titles, persisted card text, previous chat history, technical numeric data or retrieved source content. Newly created starter boards use the language selected when created.
- Localized UI labels (including React/tldraw nodes) follow locale changes without reloading the board. Canonical tool IDs, shapes, stored enum values and API schemas are unchanged.

## Smoke test, before production release

1. Open Login while signed out. Switch EN → LV → RU, refresh, and verify selection and visible translations persist. Repeat signed in and on a new browser session to confirm the saved preference.
2. Open Toolkit → Canvas, then switch each language without navigating away. Check header/tabs, project library, toolbar, drawing tools, material studies, technical-node menu, assistant skills and descriptions, and quick prompts.
3. Create each Canvas template in each language; new card titles/bodies should match the selection. Existing saved project content should **not** be translated or mutated on language change.
4. Open existing web search, crawler, material, idea, document, PDF and signage calculator nodes. Check labels, placeholders, status indicators and controls. Enter values, save, refresh, and confirm they remain unchanged.
5. Run local Board Audit and test clean / disconnected / missing decision cases in EN/LV/RU. Trigger unsaved edits and conflict or reload confirmation on a shared board, and verify localized warnings without losing the unsaved local state.
6. Test AI Conversations and Canvas Brainstorm with conflicting languages: set RU UI but ask in English, then LV UI but ask in Russian, and EN UI but ask in Latvian. Replies **and generated cards/action reasons** should match selected UI locale. Re-test after switching language mid-conversation.
7. Try a saved-user preference with an API request that omits `language`; the authenticated preference should still control the AI. An unsupported language code should not become a system prompt.
8. Test web Research in LV/RU (search locale should be passed as the selected language). Verify the model still cites URLs accurately without claiming unavailable sources.
9. Run `npm run check`, `npm run test:unit -- --run tests/unit/oms-i18n-toolkit.test.ts` if supported by the configured runner (or `npx vitest run tests/unit/oms-i18n-toolkit.test.ts`), and `npm run build`. Do not deploy a failing build.

## Scope and caveats

This patch concentrates on live Toolkit and its AI services, global language persistence and primary navigation. Legacy or unrelated OMS administration pages may still contain hardcoded English; a separate full-app string audit is required to claim 100% OMS translation completeness.

Static translation-key parity tests are committed. The GitHub-connected editing environment cannot run the repository's Node dependencies or a live SvelteKit build, so end-to-end validation must occur in the development/deployment environment.
