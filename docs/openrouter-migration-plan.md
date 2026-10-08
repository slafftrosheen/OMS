# OpenRouter-backed AI in OMS

## Current scope

The AI chat and text-generation paths use OpenRouter’s OpenAI-compatible Chat Completions API. The default model is `openrouter/free`, which OpenRouter routes to available free models; availability, capabilities, rate limits, and latency vary by provider and may change. Business operations such as production calculations, inventory/order lookups, CNC/paint recommendations, and web search remain application-owned tools invoked by the model; these are not local model services.

R&D users (role `RD`) can manage a shared OpenRouter key from Settings. The server stores it in Supabase Vault through `service_role`-only RPCs. The Settings API returns only whether a key is configured and a masked suffix. `OPENROUTER_API_KEY` is an optional server-only emergency fallback. The key is never intended for a browser build, logs, or Git.

## Removed while using the free router

These capabilities were tied to Ollama or Python inference sidecars and are removed from the application UI/API rather than silently kept local: Forge image/media generation and editing, background removal, mesh generation, ASR, TTS, voice input, vector embeddings, text/image RAG, ColPali retrieval, reranking, and the knowledge ingestion worker. Existing database tables/migrations and stored documents are not dropped automatically; review and data-retention decisions separately.

Image input and vision chat are not part of the current supported UI. The OpenRouter client retains image wire-format conversion for later use, but actual model/API support must be configured and verified before exposing it.

## Setup and validation

1. Apply `supabase/migrations/20261007000001_openrouter_vault_settings.sql` through the project migration workflow. The current live database was inspected and the migration is not applied yet. Check the actual Vault owner/signatures/permissions and verify the three public RPCs are executable by `service_role` only after application.
2. Sign in with an `RD` profile, open Settings → AI provider, and save an OpenRouter key. The UI does not show the key again. Alternatively, the host can provide `OPENROUTER_API_KEY` as a server-only fallback.
3. Exercise a real free-router text request, streaming response, and tool-call cycle. The environment had no OpenRouter key during implementation, so authenticated provider requests remain unverified.
4. Run `npm run test`, `npm run check`, `npm run build`, and `git diff --check` after the last code edit. Then restart only `reclame-oms.service`, check local health and logs. Never claim provider or deployment success without live command output.

## Credential boundary

Only the API route’s role check authorizes R&D to manage the shared credential; a UI-only check is not authorization. Vault RPCs are deliberately not callable by `anon` or `authenticated`. The application uses the Supabase service key only on the server. Keep the migration unapplied until this boundary is reviewed on the target database.

## Notes

- OpenRouter’s free router does not promise a stable model or that every selected model supports tool calls. Unsupported tool/function behavior should fail explicitly; never fall back to Ollama.
- PDF/OCR and structured file extraction are not implied by chat completion and remain removed.
- No key was available here; only mocked provider-client behavior can be tested until R&D supplies/configures one.
- Keep `.env` out of every commit; the worktree already contains an unrelated `.env` change.