# Reclame AI Lab — model pull for ai1 (reasoning / vision / coder / embed)
#
# Run on the AI node 1 Windows machine (RTX 5080 16 GB).
# Make sure Ollama is installed and running (default: http://127.0.0.1:11434).
#
#   PowerShell:  .\pull-models-node1.ps1
#
# Total disk usage: ~80 GB. Adjust `$Env:OLLAMA_MODELS` to target a 300 GB+
# drive if your default Ollama model dir is on a small SSD.
#
# Verified tool-calling support — Qwen3 family + Command-R7B + Qwen3-VL.
# Sources:
#   * https://ollama.com/library/qwen3
#   * https://ollama.com/library/qwen3-coder
#   * https://ollama.com/library/qwen3-vl
#   * https://ollama.com/library/command-r7b
#   * https://huggingface.co/bartowski/huihui-ai_Qwen3-14B-abliterated-GGUF
#   * https://huggingface.co/mradermacher/Huihui-Qwen3-Coder-30B-A3B-Instruct-abliterated-GGUF
#   * https://huggingface.co/huihui-ai/Huihui-Qwen3-VL-8B-Instruct-abliterated

$ErrorActionPreference = "Stop"
$models = @(
    # --- Router (Cohere RAG/tool-calling specialist + abliterated fallback) -
    "command-r7b:latest",
    "hf.co/bartowski/huihui-ai_Qwen3-4B-abliterated-GGUF:Q5_K_M",

    # --- Reasoning + chat + math (Qwen3 thinking mode handles all three) ---
    # Replaces DeepSeek-R1 (which doesn't reliably do tool calling).
    "hf.co/bartowski/huihui-ai_Qwen3-14B-abliterated-GGUF:Q4_K_M",
    "qwen3:14b",
    # Optional MoE fallback (30B-A3B at Q3 fits 16 GB).
    "hf.co/mradermacher/Huihui-Qwen3-30B-A3B-Instruct-2507-abliterated-GGUF:Q3_K_M",

    # --- Coder / engineering -----------------------------------------------
    "hf.co/mradermacher/Huihui-Qwen3-Coder-30B-A3B-Instruct-abliterated-GGUF:Q4_K_M",
    "qwen3-coder:30b",

    # --- Vision (used here for chat-time image understanding; the heavy
    # extraction pipeline runs through the sidecar on whichever node has
    # capacity) -------------------------------------------------------------
    "huihui_ai/qwen3-vl-abliterated:8b-instruct",
    "qwen3-vl:8b",

    # --- Embeddings --------------------------------------------------------
    "bge-m3",
    "nomic-embed-text"
)

foreach ($m in $models) {
    Write-Host "=== Pulling $m ===" -ForegroundColor Cyan
    ollama pull $m
}

Write-Host "`nAll node 1 models pulled. Run ``ollama list`` to verify." -ForegroundColor Green
Write-Host "Tip: ``ollama show command-r7b --template`` confirms tool-call format." -ForegroundColor DarkGray
