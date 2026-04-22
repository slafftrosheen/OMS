# Réclame Fabriek — Sovereign Swarm OS

> End-to-end production OS for visual signage: order intake → CAD → CNC → finishing → assembly → QC → logistics.  
> Augmented by a local AI orchestrator with RAG retrieval and live database tool calling.

---

## Architecture Overview

```
┌────────────────────────────────────────────────────────────────────┐
│                    Tailscale Flat Network                          │
│                                                                    │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐ │
│  │  Frontend Node   │  │   AI Server      │  │  Supabase Vault  │ │
│  │  100.105.211.46  │  │  100.93.147.108  │  │  100.98.202.69   │ │
│  │                  │  │                  │  │                  │ │
│  │  SvelteKit App   │  │  Ollama          │  │  PostgreSQL      │ │
│  │  (Node.js)       │  │  ├ deepseek-r1   │  │  ├ pgvector      │ │
│  │                  │  │  ├ nomic-embed   │  │  ├ Auth           │ │
│  │  Crawler Worker  │  │  └ Open WebUI    │  │  ├ Storage        │ │
│  │  (background)    │  │    :3000         │  │  └ Realtime       │ │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘ │
└────────────────────────────────────────────────────────────────────┘
```

### IP Routing Table

| Node | Tailscale IP | Services | Port(s) |
|------|-------------|----------|---------|
| **Frontend** | `100.105.211.46` | SvelteKit OMS, Crawler Worker | `5173` (dev), `3000` (prod) |
| **AI Server** | `100.93.147.108` | Ollama (deepseek-r1:14b, nomic-embed-text), Open WebUI | `11434`, `3000` |
| **Supabase Vault** | `100.98.202.69` | PostgreSQL + pgvector, Auth, Storage, Realtime | `54321` |

---

## Quick Setup

### Prerequisites
- Node.js 18+ and npm
- Access to the Tailscale network (all services are local-only)

### Installation

```bash
# 1. Clone and install
git clone <repository-url>
cd OMS
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env — set SUPABASE_SERVICE_ROLE_KEY at minimum

# 3. Run migrations
npm run supabase:migrate:push

# 4. Start dev server
npm run dev
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PUBLIC_SUPABASE_URL` | ✅ | Supabase REST endpoint |
| `PUBLIC_SUPABASE_ANON_KEY` | ✅ | Supabase anonymous/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Service role key (server-side only, used by AI tools) |
| `DASHSCOPE_API_KEY` | Optional | Qwen/DashScope API key (legacy AI features) |

> Ollama and Supabase Vault endpoints are hardcoded to Tailscale IPs in `src/lib/server/ai/orchestrator.ts`.

---

## AI System — Sovereign Swarm OS

The AI subsystem is a self-hosted RAG pipeline with native tool calling, running entirely on the local Tailscale network.

### Components

| Component | Path | Purpose |
|-----------|------|---------|
| **Orchestrator** | `src/lib/server/ai/orchestrator.ts` | RAG pipeline + tool-call loop |
| **AI Tools** | `src/lib/server/ai/tools.ts` | Database skills (read-only queries) |
| **Chat API** | `src/routes/api/ai/chat/+server.ts` | Streaming endpoint for the dashboard |
| **Dashboard UI** | `src/routes/ai-dashboard/+page.svelte` | Swarm OS command center |
| **Crawler Worker** | `src/workers/crawler/index.ts` | Documentation scraper + embedder |

### How It Works

```
User Query → Embed (nomic-embed-text) → Dual Vector Search
                                          ├── match_code_chunks (internal code)
                                          └── match_framework_docs (external docs)
                                                    ↓
                                         Build System Prompt + Tools
                                                    ↓
                                         Ollama Chat (deepseek-r1:14b)
                                                    ↓
                                         ┌─ Tool Calls? ──┐
                                         │  Yes            │  No
                                         ↓                 ↓
                                    Execute Skills    Stream Response
                                    Append Results        ↓
                                    Re-send to LLM   Client Display
                                         ↓
                                    Stream Final
```

### AI Skills (Tool Calling)

The orchestrator passes a `tools` array to Ollama. When the LLM determines it needs live data, it responds with `tool_calls` which the server executes and feeds back.

| Skill | Function | Description |
|-------|----------|-------------|
| `get_pending_orders` | `getPendingOrders()` | Fetches active/draft/on-hold orders with PO, client, dates |
| `get_inventory_status` | `getInventoryStatus()` | Returns materials at or below minimum stock threshold |
| `get_order_counts_by_status` | `getOrderCountsByStatus()` | Aggregates orders by status for dashboard summaries |

All skills are **read-only** and use the service-role Supabase client (RLS bypass).

### Documentation Crawler

The crawler is a standalone Node.js process that scrapes external documentation, chunks it semantically, embeds via Ollama, and upserts into the `framework_docs` vector table.

```bash
# Single page
npm run crawler -- https://svelte.dev/docs/svelte/overview

# Multi-page crawl (follows same-origin links)
npm run crawler -- https://svelte.dev/docs --follow --max-pages 50

# All options
npm run crawler -- <url> [--follow] [--max-pages N] [--chunk-size N] [--delay MS]
```

Requires `SUPABASE_SERVICE_ROLE_KEY` in the environment.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | SvelteKit 2, Svelte 5 (runes), TypeScript |
| **Styling** | Tokenized CSS (`brand.css`), Lucide icons |
| **Backend** | Self-hosted Supabase (PostgreSQL + Auth + Storage + Realtime) |
| **AI** | Ollama (deepseek-r1:14b, nomic-embed-text), pgvector RAG |
| **Deployment** | Docker + K3s on Raspberry Pi cluster |
| **Network** | Tailscale mesh VPN |

---

## Project Structure

```
src/
├── lib/
│   ├── server/
│   │   ├── ai/
│   │   │   ├── orchestrator.ts    # RAG + tool-call pipeline
│   │   │   ├── tools.ts           # AI skills (DB queries)
│   │   │   └── AIService.ts       # Legacy Qwen AI service
│   │   ├── inventory/             # Inventory management
│   │   ├── logging/               # Structured logger
│   │   └── supabase.ts            # Server Supabase client
│   ├── realtime/
│   │   ├── realtime-service.ts    # WebSocket subscriptions
│   │   └── use-realtime-orders.ts # Generic event hooks
│   ├── types/
│   │   └── database.ts            # Domain types (Order, Stage, etc.)
│   └── ...
├── routes/
│   ├── ai-dashboard/              # Swarm OS UI
│   ├── api/ai/chat/               # Streaming chat endpoint
│   ├── orders/                    # Order management
│   └── ...
├── workers/
│   └── crawler/
│       └── index.ts               # Documentation crawler
└── ...
```

---

## Design System

Themes: **LightVim**, **DarkVim**, **HighContrast** — stored on `<html data-theme>`.

Tokens: `--bg-0/1/2`, `--text`, `--muted`, `--border`, `--accent-1/2`, `--ok`, `--warn`, `--danger`, `--focus`.

WCAG 2.2 AA compliant: body text ≥ 4.5:1, large text ≥ 3:1, UI elements ≥ 3:1.

---

## Key Workflows

1. **Create Order** — Upload PDF → fill form → assign loading date → set assignees
2. **Station Update** — Operator proposes stage change → CR → admin applies → notifications
3. **Rework** — Admin selects station + reason → stage set to REWORK → cycle logged
4. **AI Query** — User asks on dashboard → orchestrator fetches live data via tools → streams response
5. **Doc Crawl** — Operator runs crawler → pages scraped + chunked + embedded → available in RAG

---

## Deployment

```bash
# Docker
docker build -t slaff/reclame-oms:latest .
docker-compose up -d

# K3s
kubectl apply -f k8s/oms-deployment.yaml
```

Supabase: Self-hosted on `100.98.202.69:54321`  
Ollama: Self-hosted on `100.93.147.108:11434`

---

## Contributing

- **Branching**: Feature branches off `main`; small PRs
- **Commits**: Conventional (`feat/fix/chore/docs/refactor/perf/ci`)
- **PR checklist**: Screenshots, a11y notes (axe run), i18n keys
- **Definition of Done**: a11y checks pass, contrast ≥ AA, screenshots updated
