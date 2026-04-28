# Reclame AI Lab — model pull for ai2 (image-gen / mesh-gen / asr / tts /
# rerank / colpali). The heavy generative + media node.
#
# Hardware:    Windows 11, NVIDIA RTX 5080 16 GB VRAM
# Disk usage:  ~25 GB on C:\ollama-models (sidecar models live in C:\hf-cache)
# Run as:      Administrator PowerShell
# Prereqs:     Ollama installed and running on :11434 (https://ollama.com/download)
#
#   Set-ExecutionPolicy Bypass -Scope Process -Force
#   .\pull-models-node2.ps1
#
# Note: heavy diffusion/mesh/whisper/kokoro/colqwen models live in the
# Python sidecar — see scripts/sidecar/server.py and install-node2.ps1.
# Ollama on node 2 only needs a small router/embed/chat/vision set so the
# swarm can fall back when node 1 is busy.
#
# Sources:
#   * https://ollama.com/huihui_ai/qwen3-abliterated
#   * https://ollama.com/huihui_ai/qwen3-vl-abliterated

# --- Self-elevate to admin if not already -----------------------------------
if (-not ([Security.Principal.WindowsPrincipal] `
        [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
        [Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "Elevating to admin..." -ForegroundColor Yellow
    Start-Process powershell -Verb RunAs -ArgumentList `
        "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
    exit
}

$ErrorActionPreference = "Stop"

try {
    Invoke-WebRequest -Uri "http://127.0.0.1:11434/api/tags" `
        -UseBasicParsing -TimeoutSec 3 | Out-Null
} catch {
    Write-Host "ERROR: Ollama not reachable on :11434." -ForegroundColor Red
    Write-Host "  Install from https://ollama.com/download, then re-run." -ForegroundColor Red
    exit 1
}

$models = @(
    # Lightweight router for fallback duty when node 1 is saturated
    "huihui_ai/qwen3-abliterated:4b",

    # Mid-weight chat fallback
    "huihui_ai/qwen3-abliterated:14b",

    # Vision fallback (8B Q4 ≈ 5 GB, fits alongside Flux/TRELLIS in VRAM)
    "huihui_ai/qwen3-vl-abliterated:8b-instruct",

    # Embeddings — needed locally so the sidecar can rerank without a
    # round-trip to node 1
    "bge-m3",
    "nomic-embed-text"
)

foreach ($m in $models) {
    Write-Host "=== Pulling $m ===" -ForegroundColor Cyan
    ollama pull $m
}

Write-Host "`nNode 2 Ollama models pulled (~25 GB)." -ForegroundColor Green
Write-Host "Now run install-node2.ps1 to install the sidecar." -ForegroundColor DarkGray
