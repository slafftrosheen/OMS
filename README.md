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

## Models — full catalogue (uncensored, Qwen3-era only)

Every task has a **PRIMARY** model and a **FALLBACK**. The swarm router
falls back automatically on timeout, OOM, or model-not-found errors.

**All chat-side models support native tool calling** — verified against the
model cards. DeepSeek-R1 distills are NOT used: they don't reliably do
native function/tool calling and break the orchestrator's tool loop. Qwen3's
built-in **thinking mode** (`/think` / `/no_think`) gives the same chain-of-
thought quality with working tool calls — see [Qwen3 on GitHub](https://github.com/QwenLM/Qwen3)
and [Ollama tool-calling docs](https://docs.ollama.com/capabilities/tool-calling).

Every chat/reasoning/coder/vision model is the **abliterated** (refusal-
removed) Qwen3 line from [huihui-ai](https://ollama.com/huihui_ai),
served as native Ollama tags so there is no `hf.co/...` indirection. Quants
are pinned so each model fits in 16 GB VRAM with a 32 K context — see the
"VRAM budget" column. **Do NOT pull 30B at Q4_K_M** (~18.7 GB) — it OOMs
on a 16 GB RTX 5080. We use Q3_K_M for every 30B variant.

| Role              | Primary | Fallback | VRAM @ load | Why |
|-------------------|---------|----------|-------------|-----|
| Router            | [`huihui_ai/qwen3-abliterated:4b`](https://ollama.com/huihui_ai/qwen3-abliterated:4b) | [`huihui_ai/qwen3-abliterated:8b`](https://ollama.com/huihui_ai/qwen3-abliterated:8b) | ~3 GB | Tiny, fast, tool-calling intent classifier |
| Reasoning         | [`huihui_ai/qwen3-abliterated:14b`](https://ollama.com/huihui_ai/qwen3-abliterated:14b) | [`huihui_ai/qwen3-abliterated:30b-a3b-instruct-2507-q3_K_M`](https://ollama.com/huihui_ai/qwen3-abliterated:30b-a3b-instruct-2507-q3_K_M) | ~9 GB / ~13 GB | Thinking mode + tool calling |
| General chat      | [`huihui_ai/qwen3-abliterated:14b`](https://ollama.com/huihui_ai/qwen3-abliterated:14b) | [`huihui_ai/qwen3-abliterated:8b`](https://ollama.com/huihui_ai/qwen3-abliterated:8b) | ~9 GB / ~5 GB | Snappy replies under load |
| Coder / engineer  | [`huihui_ai/qwen3-coder-abliterated:30b-a3b-instruct-q3_K_M`](https://ollama.com/huihui_ai/qwen3-coder-abliterated:30b-a3b-instruct-q3_K_M) | [`huihui_ai/qwen3-abliterated:14b`](https://ollama.com/huihui_ai/qwen3-abliterated:14b) | ~14.7 GB / ~9 GB | Qwen3-Coder MoE — tool calling verified |
| Vision (PDF/img)  | [`huihui_ai/qwen3-vl-abliterated:8b-instruct`](https://ollama.com/huihui_ai/qwen3-vl-abliterated:8b-instruct) | [`huihui_ai/qwen3-vl-abliterated:8b-thinking`](https://ollama.com/huihui_ai/qwen3-vl-abliterated:8b-thinking) | ~5 GB | Qwen3-VL: vision + tools + 32-language OCR |
| Math / brainstorm | (alias → reasoning) | (alias → reasoning) | — | Qwen3 thinking handles math at the same quality |
| Embed (text)      | [`bge-m3`](https://ollama.com/library/bge-m3) (1024d, NL/EN/DE) | [`nomic-embed-text`](https://ollama.com/library/nomic-embed-text) (768d) | ~1 GB | Multilingual encoder; abliteration N/A (no chat) |
| Embed (image)     | [`nomic-ai/nomic-embed-vision-v1.5`](https://huggingface.co/nomic-ai/nomic-embed-vision-v1.5) (768d) | (same) | ~1 GB | Cross-modal: text query → matching photos |
| Reranker          | [`BAAI/bge-reranker-v2-m3`](https://huggingface.co/BAAI/bge-reranker-v2-m3) | [`jinaai/jina-reranker-v2-base-multilingual`](https://huggingface.co/jinaai/jina-reranker-v2-base-multilingual) | ~1 GB | Sub-100 ms cross-encoder |
| Document-as-image | [`vidore/colqwen2-v1.0`](https://huggingface.co/vidore/colqwen2-v1.0) | (same) | ~7 GB | Late interaction over rendered PDF pages |
| ASR               | faster-whisper [`large-v3-turbo`](https://huggingface.co/Systran/faster-whisper-large-v3) | `large-v3` | ~3 GB | 8× faster than large-v3, near-equal accuracy |
| TTS               | [`hexgrad/Kokoro-82M`](https://huggingface.co/hexgrad/Kokoro-82M) | [`rhasspy/piper`](https://github.com/rhasspy/piper) | ~0.5 GB | Tiny, CPU-capable |
| Image gen         | [`black-forest-labs/FLUX.1-dev`](https://huggingface.co/black-forest-labs/FLUX.1-dev) (FP8) | [`black-forest-labs/FLUX.1-schnell`](https://huggingface.co/black-forest-labs/FLUX.1-schnell) | ~12 GB | dev = quality, schnell = 4-step real-time |
| Mesh gen          | [`microsoft/TRELLIS-image-large`](https://huggingface.co/microsoft/TRELLIS-image-large) | [`tencent/Hunyuan3D-2.1`](https://huggingface.co/tencent/Hunyuan3D-2.1) | ~10 GB | Image → GLB; TRELLIS = cleaner topology |
| Background remove | [`briaai/RMBG-2.0`](https://huggingface.co/briaai/RMBG-2.0) | [`ZhengPeng7/BiRefNet`](https://huggingface.co/ZhengPeng7/BiRefNet) | ~1 GB | One-click cut-outs |
| Music / SFX       | [`facebook/musicgen-small`](https://huggingface.co/facebook/musicgen-small) | (same) | ~2 GB | Optional — product-video soundbeds |

Disk budget: **~70 GB Ollama models on node 1**, **~25 GB Ollama on node 2 +
~120 GB sidecar weights at `C:\hf-cache`** (everything stays on the C: drive
— there is no D: requirement). Pull scripts: `scripts/ai/pull-models-node1.ps1`
and `scripts/ai/pull-models-node2.ps1`.

> **Ollama version note:** Qwen3 tool calling requires Ollama ≥ 0.5. If you
> see malformed tool args, update Ollama and re-pull the model.

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

### 1) `oms` — Raspberry Pi 5 / Bookworm (Supabase + frontend + ingestor)

**Hardware:** Pi5 8 GB · 1 TB NVMe via the official Pi5 PCIe HAT (e.g.
Pimoroni NVMe Base, Geekworm X1001). Raspberry Pi OS Bookworm 64-bit.

#### 1.1 Enable the NVMe (only needed once)

The PCIe slot is **disabled by default** on Bookworm. Enable it and force
Gen 3 (the connection is rated at Gen 2 but Gen 3 is stable in practice and
nearly doubles throughput — ~900 MB/s on Samsung 980/990).

```bash
sudo nano /boot/firmware/config.txt
# Add these two lines at the bottom:
dtparam=pciex1
dtparam=pciex1_gen=3

sudo reboot
lsblk            # → nvme0n1 should appear
```

If `lsblk` shows the drive, optionally set it as the boot device with the
Pi imager (`sudo rpi-eeprom-config --edit` → `BOOT_ORDER=0xf416`).

#### 1.2 Install Tailscale (NOT in apt — add the official repo first)

`sudo apt install tailscale` does **not** work on Bookworm; the package is
not in the Debian repos. Add Tailscale's signed apt source first:

```bash
# Add Tailscale's GPG key + repo
curl -fsSL https://pkgs.tailscale.com/stable/debian/bookworm.noarmor.gpg | \
    sudo tee /usr/share/keyrings/tailscale-archive-keyring.gpg >/dev/null
curl -fsSL https://pkgs.tailscale.com/stable/debian/bookworm.tailscale-keyring.list | \
    sudo tee /etc/apt/sources.list.d/tailscale.list

sudo apt update
sudo apt install -y tailscale
sudo tailscale up                    # opens an auth URL in the terminal
tailscale ip -4                      # → write this down (e.g. 100.98.202.69)
```

> Same procedure on the `nas` Pi5. On the two Windows AI nodes, install
> Tailscale via the official Windows installer (https://tailscale.com/download/windows)
> and sign in with the same tailnet account.

#### 1.3 Base packages, repo, env

```bash
sudo apt update && sudo apt install -y \
    curl git build-essential nano \
    docker.io docker-compose-v2 \
    nodejs npm

sudo usermod -aG docker $USER && newgrp docker

sudo mkdir -p /opt && sudo chown $USER:$USER /opt
cd /opt && git clone https://github.com/slafftrosheen/OMS.git reclame-oms
cd reclame-oms
cp .env.example .env && nano .env    # fill in keys + the 4 Tailscale IPs
```

#### 1.4 Self-hosted Supabase (Postgres + Auth + Storage + Realtime)

The Supabase docker bundle ships a `.env.example` with ~70 variables. Most
have safe defaults, but **8 secrets/credentials must be changed before
`docker compose up`** — leaving the defaults exposes the dashboard, the
JWT signing key, and the Postgres superuser to anyone on your tailnet.

```bash
git clone --depth 1 https://github.com/supabase/supabase /opt/supabase
cd /opt/supabase/docker
cp .env.example .env
```

##### Generate the secrets in one shot

The bundle includes `utils/generate-keys.sh` which mints `JWT_SECRET`,
`ANON_KEY`, `SERVICE_ROLE_KEY`, and `SECRET_KEY_BASE` for you. Run it,
then fill in the four credentials it does NOT generate:

```bash
# 1. Auto-generate JWT secret + anon key + service-role key + Realtime key
sh ./utils/generate-keys.sh        # writes JWT_SECRET, ANON_KEY,
                                   # SERVICE_ROLE_KEY, SECRET_KEY_BASE
                                   # into ./.env

# 2. Generate POSTGRES_PASSWORD and VAULT_ENC_KEY manually (32+ chars)
echo "POSTGRES_PASSWORD=$(openssl rand -hex 24)"  >> /tmp/sb-extra
echo "VAULT_ENC_KEY=$(openssl rand -hex 16)"      >> /tmp/sb-extra
# Open /tmp/sb-extra, copy the two lines into .env, replacing the defaults.

# 3. Pick a dashboard login (Studio is exposed on :3000 over the tailnet)
nano .env
```

##### Variables that MUST be changed

| Variable | What it is / how to set it |
|----------|----------------------------|
| `POSTGRES_PASSWORD` | Postgres superuser password. **Default is `your-super-secret-and-long-postgres-password` — change it.** Use the `openssl rand -hex 24` value from above. |
| `JWT_SECRET` | HS256 signing secret for every JWT (≥32 chars). Set by `generate-keys.sh`. **Never reuse this anywhere else.** |
| `ANON_KEY` | Public JWT for browser/PWA clients (signed with `JWT_SECRET`). Set by `generate-keys.sh`. |
| `SERVICE_ROLE_KEY` | Server-side JWT with full DB access (signed with `JWT_SECRET`). Set by `generate-keys.sh`. **Server-only, never sent to the browser.** |
| `SECRET_KEY_BASE` | Used by Realtime + Supavisor (Phoenix `secret_key_base`). Set by `generate-keys.sh`. |
| `VAULT_ENC_KEY` | Symmetric key for Supabase Vault (DB-stored secrets). Must be exactly 32 hex chars (`openssl rand -hex 16`). |
| `DASHBOARD_USERNAME` | Login for Studio at `:3000`. Default `supabase` — pick your own. |
| `DASHBOARD_PASSWORD` | Studio password. **Default is `this_password_is_insecure_and_should_be_updated` — change it.** |

##### Variables that MUST point at the Pi5 (not localhost)

The defaults assume `localhost`. Since the OMS frontend lives on the Pi5
itself and AI nodes / browsers reach it via the tailnet, set these to the
Pi5's tailscale IP (replace `<PI5_IP>` with the value from `tailscale ip -4`):

| Variable | Value |
|----------|-------|
| `SITE_URL`            | `http://<PI5_IP>` |
| `API_EXTERNAL_URL`    | `http://<PI5_IP>:8000` |
| `SUPABASE_PUBLIC_URL` | `http://<PI5_IP>:8000` |
| `ADDITIONAL_REDIRECT_URLS` | `http://<PI5_IP>,http://<PI5_IP>/login` |

Ports — leave as defaults unless they clash with something else on the Pi5:
`KONG_HTTP_PORT=8000` (REST/Auth gateway), `KONG_HTTPS_PORT=8443`,
`POSTGRES_PORT=54322` (mapped from container's 5432), `STUDIO_PORT=3000`.

SMTP (optional — only needed if you want password-reset emails). Leave
blank to disable mail entirely. If used, set `SMTP_HOST`, `SMTP_PORT`,
`SMTP_USER`, `SMTP_PASS`, `SMTP_SENDER_NAME`, `SMTP_ADMIN_EMAIL` — same
pattern as any other SMTP relay.

##### Bring it up

```bash
docker compose pull           # pulls all 14 images (~2 GB)
docker compose up -d
docker compose ps             # every service should be "running" / "healthy"
```

##### Mirror the same values into the OMS .env

The OMS reads its own `/opt/reclame-oms/.env` — it doesn't share the
Supabase one. Copy these four values across (use the values you just
generated, NOT the defaults):

```bash
cd /opt/reclame-oms
nano .env                     # set:
#   PUBLIC_SUPABASE_URL=http://<PI5_IP>:8000
#   PUBLIC_SUPABASE_ANON_KEY=<ANON_KEY from /opt/supabase/docker/.env>
#   SUPABASE_SERVICE_ROLE_KEY=<SERVICE_ROLE_KEY from /opt/supabase/docker/.env>
#   DATABASE_URL=postgresql://postgres:<POSTGRES_PASSWORD>@localhost:54322/postgres
#     ↑ must be localhost — Docker binds postgres on Pi5's loopback only
```

> **Studio access:** browse to `http://<PI5_IP>:3000` from any tailnet
> machine, log in with `DASHBOARD_USERNAME` / `DASHBOARD_PASSWORD`. Use
> Studio's SQL editor for ad-hoc queries; the OMS migrations run via the
> CLI in step 1.5 below.

#### 1.5 Migrations + build + systemd services

The migration script applies SQL files via `psql` against `DATABASE_URL`
from your `.env`, tracking applied versions in `supabase_migrations.schema_migrations`
(the same table the Supabase CLI uses). Install the client first:

```bash
sudo apt install -y postgresql-client    # provides psql

npm install
npm run supabase:migrate:push         # applies pgvector + AI Lab schema
                                      # via DATABASE_URL from .env
npm run build                         # production bundle (adapter-node)

# Service: SvelteKit app
sudo tee /etc/systemd/system/reclame-oms.service >/dev/null <<'EOF'
[Unit]
Description=Reclame Fabriek OMS (SvelteKit adapter-node)
After=network-online.target docker.service
[Service]
WorkingDirectory=/opt/reclame-oms
EnvironmentFile=/opt/reclame-oms/.env
ExecStart=/usr/bin/node build/index.js
Restart=on-failure
[Install]
WantedBy=multi-user.target
EOF

# Service: knowledge ingestor worker
sudo tee /etc/systemd/system/reclame-ingestor.service >/dev/null <<'EOF'
[Unit]
Description=Reclame AI Lab ingestion worker
After=reclame-oms.service
[Service]
WorkingDirectory=/opt/reclame-oms
EnvironmentFile=/opt/reclame-oms/.env
ExecStart=/usr/bin/npx tsx src/workers/ingestor/index.ts
Restart=on-failure
[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now reclame-oms reclame-ingestor
```

The OMS is now reachable at `http://<pi5-tailscale-ip>` over the tailnet.
The AI Lab is at `http://<pi5-tailscale-ip>/ai-lab`.

---

### Windows prerequisites (applies to BOTH `ai1` and `ai2`)

PowerShell scripts are blocked by default on a fresh Windows 11 install,
and downloaded files carry a "Mark of the Web" that prevents execution.
Do these steps **once per machine** before running any `.ps1` in this repo.

#### W.1 Install software (in this order)

1. **NVIDIA driver 560+** (includes CUDA 12 runtime) — https://www.nvidia.com/Download/index.aspx
2. **CUDA Toolkit 12.4** — https://developer.nvidia.com/cuda-12-4-0-download-archive
3. **cuDNN 9.x for CUDA 12** — https://developer.nvidia.com/cudnn-downloads (zip → copy `bin/`, `lib/`, `include/` over the matching CUDA dirs)
4. **Python 3.11 64-bit** — https://www.python.org/downloads/  (tick *"Add python.exe to PATH"*)
5. **Git for Windows** — https://git-scm.com/download/win
6. **FFmpeg (full build)** — https://www.gyan.dev/ffmpeg/builds/  → extract to `C:\ffmpeg`, add `C:\ffmpeg\bin` to system PATH
7. **VS 2022 Build Tools** (node 2 only — required for TRELLIS C++ extensions) — https://aka.ms/vs/17/release/vs_BuildTools.exe → select "Desktop development with C++"
8. **Ollama** — https://ollama.com/download
9. **Tailscale** — https://tailscale.com/download/windows (sign in with the same account as the Pi5)

#### W.2 Open an Administrator PowerShell

Right-click PowerShell → **Run as administrator**. Then:

```powershell
# Allow PowerShell scripts (this session only — safe)
Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope Process -Force

# Clone the repo (git-cloned files are NOT marked-of-the-web — no unblock needed)
cd C:\
git clone https://github.com/slafftrosheen/OMS.git reclame-oms
cd reclame-oms

# If you instead extracted a zip, every .ps1 has the "downloaded" flag and
# Windows will block them. Strip the flag:
Get-ChildItem -Recurse | Unblock-File
```

> The `install-node*.ps1` scripts auto-elevate to admin, enable long-path
> support, and add `C:\reclame`, `C:\ollama-models`, `C:\hf-cache` to
> Defender exclusions for you. Do not skip the Administrator step on the
> very first invocation — UAC needs to grant elevation.

---

### 2) `ai1` — Win11 + RTX 5080 16 GB (reasoning, vision, coder, embed)

```powershell
# (in the same Administrator PowerShell from W.2, inside C:\reclame-oms)

# 2.1 Tell Ollama to keep its model files on C:\ and listen on the tailnet
[System.Environment]::SetEnvironmentVariable("OLLAMA_MODELS", "C:\ollama-models", "Machine")
[System.Environment]::SetEnvironmentVariable("OLLAMA_HOST",   "0.0.0.0:11434",    "Machine")

# Restart Ollama so it picks up the env vars
Restart-Service Ollama -ErrorAction SilentlyContinue
# (or: Services.msc → "Ollama" → Restart)

# 2.2 Pull the node-1 model set (~70 GB to C:\ollama-models)
cd C:\reclame-oms\scripts\ai
.\pull-models-node1.ps1

# 2.3 Install the Python sidecar (creates a Windows service "reclame-sidecar")
cd ..\sidecar
.\install-node1.ps1
```

Verify:

```powershell
curl http://localhost:11434/api/tags          # Ollama models loaded
curl http://localhost:8800/health             # Sidecar OK
```

### 3) `ai2` — Win11 + RTX 5080 16 GB (image-gen, mesh-gen, asr, tts, rerank, colpali)

Same flow, just the heavier sidecar. **All caches stay on C:\.** Make sure
C:\ has at least **300 GB** free for `C:\hf-cache` (Flux + TRELLIS + ColQwen2
+ Whisper + Kokoro weights total ~120 GB; allow headroom for upgrades).

```powershell
[System.Environment]::SetEnvironmentVariable("OLLAMA_MODELS", "C:\ollama-models", "Machine")
[System.Environment]::SetEnvironmentVariable("OLLAMA_HOST",   "0.0.0.0:11434",    "Machine")
[System.Environment]::SetEnvironmentVariable("HF_HOME",       "C:\hf-cache",      "Machine")
Restart-Service Ollama -ErrorAction SilentlyContinue

cd C:\reclame-oms\scripts\ai
.\pull-models-node2.ps1
cd ..\sidecar
.\install-node2.ps1
```

> First Flux / TRELLIS / ColQwen2 request downloads weights to `C:\hf-cache`
> (≈80 GB total, 10–20 min on a 1 Gb link). After that everything is local.

### 4) `nas` — Pi5 backup target

```bash
# Same prereqs as the oms Pi5: NVMe enabled in /boot/firmware/config.txt,
# Tailscale installed via the official repo (steps 1.1 and 1.2 above).

sudo apt install -y rsync openssh-server
sudo useradd -m backup
sudo mkdir -p /mnt/oms-backups && sudo chown backup:backup /mnt/oms-backups

# On oms, generate an SSH key and copy the public key to nas:
#   ssh-keygen -t ed25519 -f ~/.ssh/oms-backup -N ""
#   ssh-copy-id -i ~/.ssh/oms-backup.pub backup@<nas-tailscale-ip>
```

Then on `oms`:

```bash
# .env has BACKUP_REMOTE_PATH=backup@<nas-ip>:/mnt/oms-backups
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
