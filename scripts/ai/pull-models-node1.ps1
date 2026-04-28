# Reclame AI Lab — model pull for ai1 (reasoning / vision / coder / embed)
#
# Hardware:    Windows 11, NVIDIA RTX 5080 16 GB VRAM
# Disk usage:  ~70 GB on C:\ollama-models
# Run as:      Administrator PowerShell (right-click PowerShell -> "Run as administrator")
# Prereqs:     Ollama installed and running on :11434 (https://ollama.com/download)
#
#   Set-ExecutionPolicy Bypass -Scope Process -Force
#   .\pull-models-node1.ps1
#
# All models are Qwen3-era and uncensored ("abliterated" — refusal-vector
# ablated). All quants are sized to fit a 16 GB RTX 5080 with room for
# context. Tool calling is verified for every chat-side model.
#
# Sources:
#   * https://ollama.com/huihui_ai/qwen3-abliterated
#   * https://ollama.com/huihui_ai/qwen3-coder-abliterated
#   * https://ollama.com/huihui_ai/qwen3-vl-abliterated
#   * https://ollama.com/library/bge-m3
#   * https://ollama.com/library/nomic-embed-text

# --- Self-elevate to admin if not already (Ollama on Windows installs into
# program files; the model dir env-var also needs admin) ---------------------
if (-not ([Security.Principal.WindowsPrincipal] `
        [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
        [Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "Elevating to admin..." -ForegroundColor Yellow
    Start-Process powershell -Verb RunAs -ArgumentList `
        "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
    exit
}

$ErrorActionPreference = "Stop"

# Sanity check: Ollama reachable?
try {
    Invoke-WebRequest -Uri "http://127.0.0.1:11434/api/tags" `
        -UseBasicParsing -TimeoutSec 3 | Out-Null
} catch {
    Write-Host "ERROR: Ollama not reachable on :11434." -ForegroundColor Red
    Write-Host "  Install from https://ollama.com/download, then re-run." -ForegroundColor Red
    exit 1
}

$models = @(
    # --- Router (small, fast, tool-calling) -------------------------------
    "huihui_ai/qwen3-abliterated:4b",

    # --- Reasoning + general chat + math (Qwen3 thinking mode) -----------
    # 14B Q4_K_M = ~9 GB, fits 16 GB with 32k context
    "huihui_ai/qwen3-abliterated:14b",

    # --- Reasoning fallback (MoE 30B-A3B at Q3 = ~13 GB, still fits) -----
    "huihui_ai/qwen3-abliterated:30b-a3b-instruct-2507-q3_K_M",

    # --- Coder / engineer (MoE 30B-A3B Coder at Q3 = ~14.7 GB) -----------
    # Q4_K_M is 18.7 GB — does NOT fit 16 GB VRAM, do not pull it.
    "huihui_ai/qwen3-coder-abliterated:30b-a3b-instruct-q3_K_M",

    # --- Vision (chat-time image understanding; PDF extraction goes
    # through the sidecar's Qwen2.5-VL pipeline) --------------------------
    "huihui_ai/qwen3-vl-abliterated:8b-instruct",

    # --- Embeddings (no abliteration needed — these are encoders only) ---
    "bge-m3",
    "nomic-embed-text"
)

foreach ($m in $models) {
    Write-Host "=== Pulling $m ===" -ForegroundColor Cyan
    ollama pull $m
}

Write-Host "`nAll node 1 models pulled. Run 'ollama list' to verify." -ForegroundColor Green
Write-Host "Total disk: ~70 GB at C:\ollama-models." -ForegroundColor DarkGray
