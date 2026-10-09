# OMS-R04 — OpenRouter and signage tool hardening

**Date:** 2026-10-09  
**Scope:** GitHub repository changes only. No secrets accessed, no live OpenRouter inference, no Supabase migrations, no deployment. **R01/R02 migrations remain required before deploying R04 app code.**

## Provider and inference

- OpenRouter is the **sole inference provider**. API keys remain server-side (Supabase Vault or service environment). No credentials have been added to Git.
- Requests use a bounded AbortSignal that remains effective while a streaming response is being consumed; the previous timer was cleared as soon as headers arrived.
- The public chat and generated-description endpoints no longer return raw upstream provider body/errors, which could contain original prompt text or secrets echoed by a gateway.
- Chat messages are length-limited, subject to the existing AI rate limiter, and tool arguments, tool-call count and tool-output size are bounded.
- AI run records are marked failed on a provider/tool pipeline error instead of remaining indefinitely `running` on that path.
- `GET /api/ai/health` only reports **configured vs not configured** and explicitly says connectivity **not tested**. It never spends tokens.
- `POST /api/ai/health` is **R&D-only** and makes one minimal live OpenRouter request using the configured model and backend key, returning only model/status/latency; the key and provider response text are never returned.

## Authorization and tool execution

- `GET /api/ai/tools` requires a signed-in user. Its role comes from `locals.user.role`; a `?role=RD` URL parameter cannot elevate permissions.
- The session tool loop builds a single allow-list of tools actually offered to the model, filtered by user role and persona. Only those names can be invoked. Unlisted/hallucinated tool names and excess calls return a bounded tool error.
- Only statically implemented and explicitly enabled tool slugs can run, regardless of editable `ai_tools` database metadata. Database descriptors cannot override the built-in schema to broaden role access.
- Management-only order and stock tools enforce RD/Boss/HeadOfProduction at both listing and execution; all OMS business data, CNC feeds/speeds records, historic paint formulas and maker sketch reads use the **request-scoped, RLS-aware** Supabase client.
- Maker write tools are disabled in autonomous execution. A sketch must be reviewed and saved through the normal UI rather than on an unconfirmed model action.
- Database `ai_tools` metadata read may still use narrowly scoped server credentials; this is NOT an authorization to query user business data with `service_role`.

## LumiGrid hardware contract (calculator, not electrical approval)

The former calculator silently accepted up to 64 channels and assumed a 96/100 MHz timer and 16-bit resolution. This could give misleading outputs.

R04 explicitly models **8 PWM outputs + 8 addressable RMT lanes**. Legacy `channels` is now the number of connected PWM outputs (0–8); `channel_ma` is the load draw per PWM output. New inputs include `addressable_lanes`, `pixels_per_lane`, `pixel_ma`, and `pixel_volts`.

PWM loads and addressable-pixel loads have **separate current/PSU budgets**. Watts can be summed but amps across different voltage rails cannot. A reference firmware limit of 256 pixels/lane is validated; this is not a verified electrical/throughput guarantee. The default 25% supply headroom is a planning assumption, not an independent PSU certification.

The planner now **rejects invalid, nonfinite and over-capacity numbers** rather than clamping them into a plausible answer. `timer_ok=null` explicitly records that PWM/RMT timing feasibility is **unverified** for the connected PCB revision/firmware. Gamma LUT is still available. Camera flicker and thermal/current limits require real bench validation.

The AI tool schema and AI Lab canvas fields/summary follow the revised planner. For verified hardware limits, reconcile the final PCB rev, installed MOSFET/channel ratings, RMT driver configuration, PSU/wire/fuse data, and protocol with the active LumiGrid repository before allowing production sign-off.

### Example load calculation

An example with 8 PWM loads at 250 mA on 24 V and 8 addressable lanes × 60 pixels at a datasheet-specified 60 mA/pixel on 5 V yields:

- PWM: 2.0 A load; 2.5 A / **60 W** budget with 25% headroom.
- Addressable: 28.8 A load; 36 A / **180 W** budget at 5 V.
- Summed supply rating budget: **240 W**, but **not** a single combined current rating. Wire/fusing/injection and PSU architecture need a separate design.

This is an arithmetic example, not a board-supported load rating or permission to power the LED strips from controller traces.

## Crawl / web tools

AI-controlled URLs now reject invalid schemes, credentials, nonstandard ports, localhost/Tailnet-style names, DNS resolutions into private/loopback/link-local/metadata ranges, and HTTP redirects. Search queries are bounded. Only public internet HTML/XML documents can be cleaned.

**Residual SSRF concern:** Node's `fetch` may perform a second DNS resolution after validation. Hostname validation alone does not eliminate DNS rebinding, proxy bypass or other network-layer redirection risks. For stronger assurance, enforce egress policy/allowlisted proxy at deployment (no outbound access to NAS/Supabase/private/Tailnet ranges from the crawler process). Do not claim full SSRF mitigation without a tested network boundary. Disabled redirects can break some vendor websites; use the final public URL instead.

## Staging and live-verification matrix

Before restarting OMS, complete R00 credential preservation and check the **five currently unapplied migrations** (R01 + four R02) on disposable PostgreSQL 17. Follow the R02 runbook, not blanket `supabase db push`. No SQL migration is introduced by R04 itself.

1. **Build/test:** `npm ci`, `npm run test`, `npm run check`, `npm run build`. Run `tests/unit/oms-r04-ai-hardening.test.ts` and the existing OpenRouter tests, and investigate any new warnings.
2. **No key:** As a signed-in user, `GET /api/ai/health` reports `configured=false`, `connectivity=not_tested`; no inference. A normal AI request must fail without exposing a key.
3. **Key installed:** RD uses the system Settings/Vault workflow. RD explicitly initiates **one POST** to `/api/ai/health` and checks connectivity, status and latency. Regular users get 403 on POST.
4. **Actual OpenRouter tool-call test:** Have Boss/HoP ask for low-stock and active orders. Test that actual configured model supports OpenAI-compatible function calling; model ID `openrouter/free` is not proof of any specific routed model capability. Test Operator attempts to access those tools (including hallucinated function names) are denied. Check returned rows respect RLS.
5. **Conversations:** Verify a no-tool chat, a real calculator tool call, a multi-hop result, a provider 429, and timed-out SSE stream; no run remains spuriously `running` for the tested failure path. No raw provider error body/key is returned to a browser.
6. **Tools:** Verify CNC feeds/speeds and paint recipes respect real signed-in users' RLS, including direct /api/ai/station/* routes. Verify maker sketch reads are scoped to the logged-in user; automatic AI write is refused. Normal maker UI writes remain a separate path.
7. **Crawler:** `localhost`, `127.0.0.1`, `169.254.169.254`, `100.100.100.100`, and a Tailnet FQDN are blocked. Public URLs are tested and redirect behavior is documented; verify the egress firewall.
8. **LumiGrid:** Test PWM-only, addressable-only, mixed-voltage mixed outputs, unsupported ninth channel, >256 pixels per lane, and missing datasheet pixel current; verify the canvas UI and check the result against real hardware.
9. **Operations:** Check `/api/healthz` still answers independent of OpenRouter and normal OMS orders/production remain usable if AI is down. Do not restart the Supabase Docker stack for app changes.

## Known limits / follow-up

No live provider probe was executed here: a successful repository commit or unit test **does not** demonstrate live OpenRouter authentication, available tool-call models, token usage, vendor crawler reachability, or storage policies.

The AI Lab canvas and orders now share the new LumiGrid computation, but this is not a full physics/EMC/CE review. Other signage calculators are still estimating rules of thumb. UI translations for new copy and end-to-end cost tracking remain follow-up work. An explicit user-approved assistant write workflow and hardened crawler network egress remain separate design tasks.
