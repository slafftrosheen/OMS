# Reclame AI Lab — model pull for ai2 (image-gen / mesh-gen / asr / tts /
# rerank / colpali). The heavy generative + media node.
#
# Generative models live in the Python sidecar (diffusers / TRELLIS /
# faster-whisper / Kokoro / BGE reranker / ColQwen2) — see
# scripts/sidecar/server.py and scripts/sidecar/install-node2.ps1.
#
# Ollama on node 2 still gets a small set of router/embed/chat models so the
# swarm can fall back when node 1 is busy.
#
# Sources:
#   * https://ollama.com/library/qwen3
#   * https://ollama.com/library/command-r7b
#   * https://ollama.com/library/qwen3-vl

$ErrorActionPreference = "Stop"
$models = @(
    # Lightweight router + embed for fallback duty
    "command-r7b:latest",
    "qwen3:4b",
    "bge-m3",
    "nomic-embed-text",

    # Mid-weight chat model for quick questions when ai1 is saturated
    "qwen3:14b",

    # Vision — node 2 also serves multimodal chat when ai1 is busy
    "qwen3-vl:8b"
)

foreach ($m in $models) {
    Write-Host "=== Pulling $m ===" -ForegroundColor Cyan
    ollama pull $m
}

Write-Host "`nNode 2 Ollama models pulled. Now run install-node2.ps1 for the sidecar." -ForegroundColor Green
