# Install the sidecar on AI node 2 (image/mesh/asr/tts/rerank/colpali).
# Caps: image-gen, mesh-gen, asr, tts, rerank, colpali
#
# Same prerequisites as node 1, plus:
#   * 100+ GB free for diffusion + mesh model cache (HF_HOME → fast NVMe)
#   * NSSM installed and on PATH (https://nssm.cc/)

$ErrorActionPreference = "Stop"
$Root = "C:\reclame\sidecar"
if (-not (Test-Path $Root)) { New-Item -ItemType Directory -Path $Root | Out-Null }
Copy-Item "$PSScriptRoot\*" $Root -Recurse -Force

Push-Location $Root
try {
    python -m venv .venv
    .\.venv\Scripts\Activate.ps1
    python -m pip install --upgrade pip
    pip install torch --index-url https://download.pytorch.org/whl/cu124
    pip install -r requirements.txt

    # TRELLIS install from source (one-time)
    if (-not (Test-Path "$Root\TRELLIS")) {
        git clone https://github.com/microsoft/TRELLIS "$Root\TRELLIS"
        Push-Location "$Root\TRELLIS"
        .\setup.sh   # use Git Bash if running PowerShell pure
        Pop-Location
    }

    [System.Environment]::SetEnvironmentVariable("SIDE_CAPS", "image-gen,mesh-gen,asr,tts,rerank,colpali", "Machine")
    [System.Environment]::SetEnvironmentVariable("SIDE_PORT", "8800", "Machine")
    # Point HF cache at a dedicated 300+ GB drive
    [System.Environment]::SetEnvironmentVariable("HF_HOME", "D:\hf-cache", "Machine")

    nssm install reclame-sidecar "$Root\.venv\Scripts\python.exe" "-m" "uvicorn" "server:app" "--host" "0.0.0.0" "--port" "8800"
    nssm set reclame-sidecar AppDirectory $Root
    nssm set reclame-sidecar Start SERVICE_AUTO_START
    nssm start reclame-sidecar
} finally {
    Pop-Location
}
Write-Host "Node 2 sidecar installed → http://<this-node>:8800/health" -ForegroundColor Green
