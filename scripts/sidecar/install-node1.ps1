# Install the sidecar on AI node 1 (text/vision auxiliaries).
# Caps: vision, embed (rerank optional)
#
# Prerequisites:
#   * Windows 11
#   * NVIDIA driver 555+ (CUDA 12.x runtime)
#   * Python 3.11 64-bit installed and on PATH
#   * Ollama installed and running on :11434
#
# This script creates a venv at C:\reclame\sidecar, installs requirements,
# and registers a Windows service that starts the sidecar on boot.

$ErrorActionPreference = "Stop"
$Root = "C:\reclame\sidecar"
$Repo = (Split-Path -Parent $PSScriptRoot)

if (-not (Test-Path $Root)) { New-Item -ItemType Directory -Path $Root | Out-Null }
Copy-Item "$PSScriptRoot\*" $Root -Recurse -Force

Push-Location $Root
try {
    python -m venv .venv
    .\.venv\Scripts\Activate.ps1
    python -m pip install --upgrade pip
    # Install PyTorch first (cuda 12.4 wheels)
    pip install torch --index-url https://download.pytorch.org/whl/cu124
    pip install -r requirements.txt

    # Capability set for node 1
    [System.Environment]::SetEnvironmentVariable("SIDE_CAPS", "vision,embed,rerank", "Machine")
    [System.Environment]::SetEnvironmentVariable("SIDE_PORT", "8800", "Machine")

    # Service install via NSSM (https://nssm.cc/) — must already be on PATH.
    nssm install reclame-sidecar "$Root\.venv\Scripts\python.exe" "-m" "uvicorn" "server:app" "--host" "0.0.0.0" "--port" "8800"
    nssm set reclame-sidecar AppDirectory $Root
    nssm set reclame-sidecar Start SERVICE_AUTO_START
    nssm start reclame-sidecar
} finally {
    Pop-Location
}
Write-Host "Node 1 sidecar installed → http://<this-node>:8800/health" -ForegroundColor Green
