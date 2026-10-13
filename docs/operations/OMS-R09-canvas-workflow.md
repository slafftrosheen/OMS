# OMS-R09 — Canvas workflow, models and web research

This batch extends the existing shared Toolkit Canvas without changing its
database schema or permitting autonomous mutations.

## Implemented

- **Model picker** — backend-authorized OpenRouter models only. The default
  route is `OPENROUTER_MODEL`. Optionally set
  `OPENROUTER_TOOLKIT_MODELS=provider/model,provider/other-model` in the
  server environment and restart `reclame-oms.service`. Model IDs are NOT
  fetched from the browser or accepted arbitrarily. The picker displays routing
  labels, not promises of image, tool-call or structured-output support. An
  invalid model ID is rejected.
- **AI workflow** — active skill + selected card + graph diagnostics + bounded
  textual context from notes, crawler results, web-search nodes and calculators
  are sent to the model. Selected shapes are prioritized in the context budget.
  Image/PDF **previews are not presented as if they were decoded or understood**.
  When a model returns malformed JSON, its answer remains visible but no unsafe
  proposals are applied. Returned card/connection/revision proposals are
  validated, displayed, and only applied on a user click.
- **Research** — the Research skill uses existing private SearXNG by default,
  displaying links and snippets. Users can pin each source as a research card
  or create an inspect-page crawler node. Crawling itself requires a second
  deliberate Run action; server-side SSRF rules prevent internal/Tailnet URLs.
  If SearXNG is unreachable, show the failure rather than fabricate hits.
- **Optional OpenRouter search** — off by default. Set
  `OPENROUTER_TOOLKIT_WEB_SEARCH=true` on the server to offer an explicit
  second research provider in the UI. This sends
  `{type:'openrouter:web_search'}` only when Research and this mode are selected.
  It may incur **extra paid searches** independently of model token cost.
  OpenRouter server-tool output/citations are provided in the model response;
  the inspectable source panel contains only the independently returned
  SearXNG hits, never made-up citations.
- **Productivity tools** — direct arrange-by-kind, manual source capture,
  save-last-AI-answer-as-note, and offline, deterministic Markdown export of
  cards, task states, links and current research references. No provider calls
  are made for a Markdown export.
- **EN/RU/LV copy** — new controls and quick prompts have translation parity.

## Recommended workflow

Create or open a shared project → add ideas, notes and technical or web nodes →
select a node → choose an approved OpenRouter model and assistant skill →
ask / generate researched sources → inspect source / pin references →
review proposed cards and actions → approve individually → save →
export a Markdown brief. Private AI conversation remains separate from the
shared drawing, and changing projects while the AI is running cannot apply
a late answer to the newly opened project's private conversation.

## Configuration

```dotenv
OPENROUTER_MODEL=openrouter/free
# Comma- or semicolon-separated additional model IDs from OpenRouter:
OPENROUTER_TOOLKIT_MODELS=
# Extra-cost OpenRouter server web search; false until explicitly enabled:
OPENROUTER_TOOLKIT_WEB_SEARCH=false
# Existing self-hosted private search:
SEARCH_BACKEND=searxng
SEARCH_BACKEND_URL=http://<your-searxng-host>:8888
```

Use the current <https://openrouter.ai/models> catalog to select models.
Endpoints vary in price, model availability, tool support and structured-output
capability; test each candidate. OpenRouter's server web-search tool is beta.
No automatic paid-feature opt-in, price estimate or claim of guaranteed model
capabilities is made.

## Manual acceptance before deployment

1. Open the same board in two browsers. Verify CAS save conflict protection,
   recovery copy, private chat segregation, and that AI suggestions do not edit
   the board until explicitly approved.
2. Set EN, RU and LV. Exercise all six quick prompts and the eight original
   skill modes; verify each prompt uses the intended skill, and the response,
   card titles and reasons follow the UI language.
3. Run `Research` on SearXNG. Check real source URLs, no fake sources when
   down, pin-source card content, and inspect-page node manual Run. Try a
   prohibited private/Tailnet URL; server crawler must reject it.
4. Configure two valid model IDs. Check the picker shows only configured IDs.
   Submit an arbitrary ID via HTTP; API must reject it with 400. Check a
   free-router model that outputs prose instead of JSON — it must not create
   invented proposals.
5. If separately authorized, enable OpenRouter server search, select it,
   and verify the paid-search warning and real costs in OpenRouter usage.
   Switch back to SearXNG and confirm normal requests have no OpenRouter
   server-web tool.
6. Ask with selected note / crawler / search / signage calculator: verify
   relevant text is provided, but the agent does not claim to see actual pixels
   or PDF text from mere previews.
7. Arrange ideas, capture AI reply, export Markdown and confirm the shared
   canvas remains stable after refresh. Ensure the export contains task states
   and connections; do not treat research snippets as verified facts.
8. Run `npm run check`, `npx vitest run tests/unit/oms-r09-canvas-ai.test.ts`,
   `npx vitest run tests/unit/oms-r07-toolkit.test.ts tests/unit/oms-i18n-toolkit.test.ts`,
   and `npm run build`.

## Explicit limitations

- Textual context only; no live image recognition, no model-independent PDF
  extraction, and no arbitrary-code execution through the assistant.
- Paid web search is disabled unless server configuration opts in.
- This GitHub pass did not run tests or deploy to the OMS server. A local CI
  or operator verification pass is still required before shipping.
