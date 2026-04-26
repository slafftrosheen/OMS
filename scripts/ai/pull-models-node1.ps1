# Reclame AI Lab — model pull for ai1 (reasoning / vision / coder / embed)
#
# Run on the AI node 1 Windows machine (RTX 5080 16 GB).
# Make sure Ollama is installed and running (default: http://127.0.0.1:11434).
#
#   PowerShell:  .\pull-models-node1.ps1
#
# Total disk usage: ~70 GB. Adjust `$Env:OLLAMA_MODELS` to target a 300 GB+
# drive if your default Ollama model dir is on a small SSD.

$ErrorActionPreference = "Stop"
$models = @(
    # Router (fast classifier)
    "hf.co/huihui-ai/Qwen2.5-7B-Instruct-1M-abliterated:Q5_K_M",
    "hf.co/huihui-ai/Llama-3.2-3B-Instruct-abliterated:Q5_K_M",

    # Reasoning + chat (RAG synthesis, tool calling)
    "hf.co/huihui-ai/DeepSeek-R1-Distill-Qwen-14B-abliterated-v2-GGUF:Q4_K_M",
    "hf.co/mradermacher/DeepSeek-R1-Distill-Qwen-32B-abliterated-GGUF:Q3_K_M",
    "hf.co/huihui-ai/Qwen3-14B-abliterated-GGUF:Q4_K_M",
    "hf.co/huihui-ai/Qwen2.5-14B-Instruct-abliterated-v2-GGUF:Q4_K_M",

    # Coder / engineering math
    "hf.co/huihui-ai/Qwen2.5-Coder-14B-Instruct-abliterated-GGUF:Q4_K_M",
    "hf.co/bartowski/Qwen2.5-Coder-32B-Instruct-GGUF:Q3_K_M",
    "hf.co/huihui-ai/Qwen2.5-Math-7B-Instruct-abliterated-GGUF:Q5_K_M",
    "deepseek-math:7b",

    # Vision
    "hf.co/unsloth/Qwen2.5-VL-7B-Instruct-GGUF:Q5_K_M",
    "hf.co/bartowski/MiniCPM-V-2_6-GGUF:Q5_K_M",

    # Embeddings
    "bge-m3",
    "nomic-embed-text"
)

foreach ($m in $models) {
    Write-Host "=== Pulling $m ===" -ForegroundColor Cyan
    ollama pull $m
}

Write-Host "`nAll node 1 models pulled. Run ``ollama list`` to verify." -ForegroundColor Green
