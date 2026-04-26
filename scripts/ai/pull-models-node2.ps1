# Reclame AI Lab — model pull for ai2 (image-gen / mesh-gen / asr / tts /
# rerank / colpali). The heavy generative + media node.
#
# Generative models live in the Python sidecar (ComfyUI / diffusers / TRELLIS
# / faster-whisper / Kokoro / BGE reranker / ColQwen2) — see
# scripts/sidecar/server.py and scripts/sidecar/install-node2.ps1.
#
# Ollama on node 2 still needs a few small models (router/embed) so the swarm
# can fall back when node 1 is busy.

$ErrorActionPreference = "Stop"
$models = @(
    "hf.co/huihui-ai/Qwen2.5-7B-Instruct-1M-abliterated:Q5_K_M",
    "hf.co/huihui-ai/Llama-3.2-3B-Instruct-abliterated:Q5_K_M",
    "hf.co/huihui-ai/Qwen3-14B-abliterated-GGUF:Q4_K_M",
    "bge-m3",
    "nomic-embed-text"
)

foreach ($m in $models) {
    Write-Host "=== Pulling $m ===" -ForegroundColor Cyan
    ollama pull $m
}

Write-Host "`nNode 2 Ollama models pulled. Now run install-node2.ps1 for the sidecar." -ForegroundColor Green
