# Réclame Fabriek OMS + Reclame AI Lab

End-to-end production OS for visual signage — order intake → CAD → CNC →
finishing → assembly → QC → logistics — paired with **Reclame AI Lab**, an
in-house AI swarm that ingests every drawing/manual/photo/voice memo we
produce and turns it into useful answers, generated content, and station
tools (CNC feeds & speeds, paint colour match, engineering brainstorm).

The whole stack runs on our own Tailnet. No public CDNs, no third-party
inference, no telemetry leaving the building.

---

## Topology

```
┌────────────────────────┐    ┌────────────────────────┐
│  ai1   100.93.147.108  │    │  ai2   100.93.147.109  │
│  Win11 · RTX 5080 16GB │    │  Win11 · RTX 5080 16GB │
│  Ollama  :11434        │    │  Ollama  :11434        │
│  Sidecar :8800         │    │  Sidecar :8800         │
│  caps: reasoning,      │    │  caps: image-gen,      │
│        vision, coder,  │    │        mesh-gen, asr,  │
│        embed           │    │        tts, rerank,    │
│                        │    │        colpali         │
└──────────┬─────────────┘    └─────────────┬──────────┘
           │  Tailscale                     │
           ▼                                ▼
┌──────────────────────────────────────────────────────┐
│  oms     100.98.202.69   Pi5 Bookworm · 1TB NVMe    │
│  Self-hosted Supabase (PG + pgvector + Auth +        │
│    Storage + Realtime + Edge Functions)             │
│  SvelteKit (adapter-node, port 80) + ingestor worker │
└──────────────────────────────────┬───────────────────┘
                                   │ rsync nightly
                                   ▼
                       ┌──────────────────────────┐
                       │ nas  100.98.202.70  Pi5  │
                       │ 1TB NVMe encrypted backups│
                       └──────────────────────────┘
```

> When you upgrade `oms` to the i7 / 64 GB / NVMe Linux host, only the IP
> changes — every config knob is in `.env` and the deploy script ports across.

---

## Tech stack

| Layer       | Stack |
|-------------|-------|
| Frontend    | SvelteKit 2, Svelte 5 (runes, snippets), TypeScript |
| Adapter     | `@sveltejs/adapter-node` (precompressed) |
| UI          | Token CSS in `static/brand.css`, `lucide-svelte`, `apexcharts`, `tldraw`-ready canvas |
| i18n        | `svelte-i18n` (NL/EN/DE) |
| Backend     | Self-hosted Supabase (Postgres 16 + pgvector + Auth + Storage + Realtime) |
| AI swarm    | Ollama (chat/embed) + Python sidecar (vision extract, Flux, TRELLIS, Whisper, Kokoro, BGE reranker, ColQwen2) |
| RAG         | bge-m3 (1024d) + nomic-embed-vision (768d) + bge-reranker-v2-m3 |
| Tests       | Vitest, Playwright, axe-core |
| Deployment  | docker-compose (Pi5 OMS), Windows services via NSSM (AI nodes) |

---

## Reclame AI Lab — what it does

Mounted at **`/ai-lab`** in the OMS UI. Surfaces:

| Surface          | Path                       | What it is |
|------------------|----------------------------|------------|
| Overview         | `/ai-lab`                  | Swarm health, knowledge counts, today's runs |
| Chat             | `/ai-lab/chat`             | Persistent conversations, RAG citations, persona switch (engineer/CNC/paint/sales/logistics), tool calling |
| Knowledge        | `/ai-lab/knowledge`        | Drag-drop upload (PDF/image/audio/video/text/URL), tags, status, page-by-page chunk preview |
| Forge            | `/ai-lab/forge`            | Image gen (Flux), 3D mesh (TRELLIS), ASR, TTS, background remove |
| Canvas           | `/ai-lab/canvas`           | Persistent infinite drawing board (tldraw-ready) |
| Toolbox          | `/ai-lab/tools`            | Browsable list of every tool the LLM can call |
| Runs             | `/ai-lab/runs`             | Transparency log: which model, which node, latency |
| Swarm            | `/ai-lab/swarm`            | Live node health, warm models, inflight requests |

Tools available to the chat LLM (and to operators in the station drawer):

* `rag.search_knowledge`     — semantic search across uploads
* `cnc.feeds_speeds`         — RPM/feed/stepdown suggestion grounded in vendor PDFs + history
* `paint.match`              — paint mix recipe + bake schedule per substrate
* `engineering.brainstorm`   — "we've done something like this before…"
* `forge.image / mesh / asr / tts / matting`
* `data.pending_orders / low_stock`

Add new tools by inserting a row in `ai_tools` and adding an executor in
`src/lib/server/ai/tools-registry/`. The LLM picks them up automatically.

---

## Models — full catalogue (uncensored where flagged)

Every task has a **PRIMARY** model and a **FALLBACK**. The swarm router
falls back automatically on timeout, OOM, or model-not-found errors.

All chat/reasoning models below are **abliterated** (uncensored) community
tunes from `huihui-ai`, `mradermacher`, `unsloth`, or `bartowski` on Hugging
Face. Each fits in 16 GB VRAM at the listed quant.

| Role              | Primary                                                                                      | Fallback                                                                            |
|-------------------|----------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------|
| Router            | `huihui-ai/Qwen2.5-7B-Instruct-1M-abliterated:Q5_K_M`                                        | `huihui-ai/Llama-3.2-3B-Instruct-abliterated:Q5_K_M`                                |
| Reasoning         | `huihui-ai/DeepSeek-R1-Distill-Qwen-14B-abliterated-v2-GGUF:Q4_K_M`                          | `mradermacher/DeepSeek-R1-Distill-Qwen-32B-abliterated-GGUF:Q3_K_M`                 |
| General chat      | `huihui-ai/Qwen3-14B-abliterated-GGUF:Q4_K_M`                                                | `huihui-ai/Qwen2.5-14B-Instruct-abliterated-v2-GGUF:Q4_K_M`                         |
| Coder / engineer  | `huihui-ai/Qwen2.5-Coder-14B-Instruct-abliterated-GGUF:Q4_K_M`                               | `bartowski/Qwen2.5-Coder-32B-Instruct-GGUF:Q3_K_M`                                  |
| Vision (PDF/img)  | `unsloth/Qwen2.5-VL-7B-Instruct-GGUF:Q5_K_M`                                                 | `bartowski/MiniCPM-V-2_6-GGUF:Q5_K_M`                                               |
| Math              | `huihui-ai/Qwen2.5-Math-7B-Instruct-abliterated-GGUF:Q5_K_M`                                 | `deepseek-math:7b`                                                                  |
| Embed (text)      | `bge-m3` (1024d, multilingual NL/EN/DE)                                                      | `nomic-embed-text` (768d)                                                           |
| Embed (image)     | `nomic-embed-vision-v1.5` (768d)                                                             | (same)                                                                              |
| Reranker          | `BAAI/bge-reranker-v2-m3`                                                                    | `jinaai/jina-reranker-v2-base-multilingual`                                         |
| Document-as-image | `vidore/colqwen2-v1.0`                                                                       | (same)                                                                              |
| ASR               | faster-whisper `large-v3-turbo`                                                              | `large-v3`                                                                          |
| TTS               | `hexgrad/Kokoro-82M`                                                                         | `rhasspy/piper-voices`                                                              |
| Image gen         | `black-forest-labs/FLUX.1-dev` (FP8, 12 GB)                                                  | `black-forest-labs/FLUX.1-schnell`                                                  |
| Mesh gen          | `microsoft/TRELLIS-image-large`                                                              | `tencent/Hunyuan3D-2`                                                               |
| Background remove | `briaai/RMBG-2.0`                                                                            | `ZhengPeng7/BiRefNet`                                                               |
| Music / SFX       | `facebook/musicgen-small`                                                                    | (same)                                                                              |

Disk budget per node: **~250 GB** (well within your 300-400 GB allocation).
Pull scripts live in `scripts/ai/pull-models-node1.ps1` and `pull-models-node2.ps1`.

---

## Configuration — single source of truth

Every IP, model tag, port, timeout, bucket, and feature flag lives in a single
`.env` file at the repo root. Copy `.env.example` → `.env` and edit.

* SvelteKit reads it via `$env/dynamic/private` / `$env/dynamic/public`
* Workers (`tsx src/workers/...`) use `dotenv/config`
* Edge Functions use `Deno.env.get(...)`
* `PUBLIC_*` are the only vars sent to the browser

Never `process.env.X` directly elsewhere — go through `src/lib/server/config.ts`.

---

## Deployment — all 4 nodes from scratch

### Prereqs everywhere

* Tailscale installed and authenticated, all 4 nodes on the same tailnet
* Each Tailscale IP set in `.env` (or override per-machine)

### 1) `oms` — Pi5 Bookworm (Supabase + frontend + ingestor)

**Hardware:** Pi5 8 GB / 1 TB NVMe via the official PCIe HAT. Bookworm 64-bit.

```bash
# 1.1 Base packages
sudo apt update && sudo apt install -y curl git docker.io docker-compose-v2 \
    nodejs npm tailscale build-essential

# 1.2 Clone repo
cd /opt && sudo git clone https://github.com/slafftrosheen/oms.git reclame-oms
cd reclame-oms
sudo cp .env.example .env && sudo nano .env       # fill in keys + IPs

# 1.3 Self-hosted Supabase
git clone https://github.com/supabase/supabase /opt/supabase
cd /opt/supabase/docker
cp .env.example .env && nano .env                  # match SUPABASE_* in OMS .env
docker compose up -d
cd /opt/reclame-oms

# 1.4 Apply migrations (extensions + AI Lab schema)
npm install
npm run supabase:migrate:push

# 1.5 Build the SvelteKit app
npm run build

# 1.6 Run it as a systemd service
sudo tee /etc/systemd/system/reclame-oms.service >/dev/null <<'EOF'
[Unit]
Description=Reclame Fabriek OMS (SvelteKit adapter-node)
After=network-online.target
[Service]
WorkingDirectory=/opt/reclame-oms
EnvironmentFile=/opt/reclame-oms/.env
ExecStart=/usr/bin/node build/index.js
Restart=on-failure
[Install]
WantedBy=multi-user.target
EOF
sudo systemctl enable --now reclame-oms

# 1.7 Run the knowledge ingestor as a service
sudo tee /etc/systemd/system/reclame-ingestor.service >/dev/null <<'EOF'
[Unit]
Description=Reclame AI Lab ingestion worker
After=network-online.target reclame-oms.service
[Service]
WorkingDirectory=/opt/reclame-oms
EnvironmentFile=/opt/reclame-oms/.env
ExecStart=/usr/bin/npx tsx src/workers/ingestor/index.ts
Restart=on-failure
[Install]
WantedBy=multi-user.target
EOF
sudo systemctl enable --now reclame-ingestor
```

The OMS is now reachable on `http://100.98.202.69` over the tailnet. The
AI Lab is at `http://100.98.202.69/ai-lab`.

### 2) `ai1` — Win11 + RTX 5080 (reasoning, vision, coder, embed)

```powershell
# 2.1 Install Ollama (https://ollama.com/download), point models at a 300+ GB drive
[System.Environment]::SetEnvironmentVariable("OLLAMA_MODELS", "D:\ollama-models", "Machine")

# 2.2 Bind Ollama to all interfaces (so the Pi5 can reach it over Tailscale)
[System.Environment]::SetEnvironmentVariable("OLLAMA_HOST", "0.0.0.0:11434", "Machine")
# Restart the Ollama service for vars to apply.

# 2.3 Pull the node-1 model set (~70 GB)
cd C:\Users\<you>\reclame-oms\scripts\ai
.\pull-models-node1.ps1

# 2.4 Install the Python sidecar
cd ..\sidecar
.\install-node1.ps1
# → Service "reclame-sidecar" starts on boot, exposes :8800
```

Confirm:

```powershell
curl http://localhost:11434/api/tags          # Ollama
curl http://localhost:8800/health             # Sidecar
```

### 3) `ai2` — Win11 + RTX 5080 (image-gen, mesh-gen, asr, tts, rerank, colpali)

Same as node 1 but with the heavier sidecar:

```powershell
[System.Environment]::SetEnvironmentVariable("OLLAMA_MODELS", "D:\ollama-models", "Machine")
[System.Environment]::SetEnvironmentVariable("OLLAMA_HOST", "0.0.0.0:11434", "Machine")
[System.Environment]::SetEnvironmentVariable("HF_HOME", "D:\hf-cache", "Machine")

cd C:\Users\<you>\reclame-oms\scripts\ai
.\pull-models-node2.ps1
cd ..\sidecar
.\install-node2.ps1
```

> First Flux/TRELLIS/ColQwen2 request downloads weights to `HF_HOME` (≈80 GB
> total). After that everything is local.

### 4) `nas` — Pi5 backup target

```bash
sudo apt install -y rsync openssh-server
sudo useradd -m backup
sudo mkdir -p /mnt/oms-backups && sudo chown backup:backup /mnt/oms-backups
# Add the oms host's public key to /home/backup/.ssh/authorized_keys
```

Then on `oms`:

```bash
# .env already has BACKUP_REMOTE_PATH=backup@100.98.202.70:/mnt/oms-backups
sudo crontab -e
# 0 3 * * *  /opt/reclame-oms/scripts/backup.sh
```

---

## Common operations

| Command                              | What it does |
|--------------------------------------|---------------|
| `npm run dev`                        | Vite dev server (LAN-accessible) |
| `npm run build`                      | Production build (adapter-node) |
| `npm run check`                      | svelte-check type-check |
| `npm run test`                       | Vitest unit tests |
| `npm run test:a11y`                  | axe-core accessibility tests |
| `npm run supabase:migrate:create`    | Create a new migration file |
| `npm run supabase:migrate:push`      | Apply pending migrations |
| `npm run crawler -- <url>`           | RAG crawler for external docs |
| `npm run crawler:brand`              | Crawl reclamefabriek.eu |
| `npm run ingestor`                   | Knowledge ingestion worker (run as service in prod) |

---

## Adding a new AI tool (worked example)

Goal: a `glass.thickness_lookup` tool that returns standard glass thicknesses
for a customer-supplied size + load class.

1. **Insert a row** in `ai_tools` (write a migration, or via SQL editor):

   ```sql
   insert into ai_tools (slug, label, description, icon, category, schema, endpoint)
   values ('glass.thickness_lookup', 'Glass thickness lookup',
           'Suggest a glass thickness for a given panel size and load.',
           'square', 'engineering',
           jsonb_build_object(
             'name','glass_thickness',
             'description','...',
             'parameters', jsonb_build_object(
               'type','object',
               'properties', jsonb_build_object(
                 'width_mm',  jsonb_build_object('type','number'),
                 'height_mm', jsonb_build_object('type','number'),
                 'load_kpa',  jsonb_build_object('type','number')),
               'required', jsonb_build_array('width_mm','height_mm'))),
           '/api/ai/engineering/glass-thickness');
   ```

2. **Add an executor** in `src/lib/server/ai/tools-registry/glass.ts`,
   register it in `tools-registry/index.ts`, and add a route at
   `src/routes/api/ai/engineering/glass-thickness/+server.ts`.

3. The orchestrator picks it up automatically on next chat. The toolbox UI
   lists it without redeploying.

---

## Troubleshooting

| Symptom | First check |
|--------|-------------|
| Chat replies but no citations | `/api/ai/swarm` — is `bge-m3` loaded on at least one node? |
| Knowledge stuck in `extracting` | sidecar `/health` on the chosen node; check `SIDE_CAPS` includes `vision` |
| `Swarm: no node could serve…`   | one or both Ollama services down → check `ollama serve` and Tailscale |
| Forge image times out           | first request loads Flux to VRAM (~60 s); subsequent are fast |
| Pi5 OOM during build            | run `npm run build` over SSH while idle — Pi5 8 GB is on the edge |

---

## Roadmap

* tldraw integration on `/ai-lab/canvas/[id]` (drop-in replacement for the
  current sketch component)
* Audio realtime (Whisper streaming) for hands-free station ops
* ColQwen2 retrieval wired into the chat for image-heavy PDFs
* Per-user persona templates with curated tool subsets
* Migrate Pi5 OMS → i7/64 GB Linux box (just IP change in `.env`)

---

License: internal use only.
