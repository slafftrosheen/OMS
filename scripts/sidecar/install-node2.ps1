#Requires -RunAsAdministrator
<#
.SYNOPSIS
  Install the Reclame AI Lab sidecar on AI node 2 (image-gen / mesh-gen /
  asr / tts / rerank / colpali).

.DESCRIPTION
  Capabilities deployed: image-gen, mesh-gen, asr, tts, rerank, colpali
  Node 2 is the heavy generative node. Diffusion/mesh models are downloaded
  on first request via HuggingFace Hub (~80–120 GB total).

  Prerequisites — install BEFORE running this script:
    1. NVIDIA driver 560+  (includes CUDA 12.x runtime)
    2. CUDA Toolkit 12.4   https://developer.nvidia.com/cuda-12-4-0-download-archive
    3. cuDNN 9.x           https://developer.nvidia.com/cudnn-downloads
    4. Python 3.11 64-bit  https://www.python.org/downloads/  (add to PATH)
    5. Git for Windows     https://git-scm.com/download/win
    6. FFmpeg              https://ffmpeg.org/download.html  → extract → add bin\ to PATH
    7. VS 2022 Build Tools https://aka.ms/vs/17/release/vs_BuildTools.exe
         (select "Desktop development with C++" workload — needed for TRELLIS)
    8. Ollama              https://ollama.com/download
    9. 200+ GB free on C:\ for HF model cache (C:\hf-cache)

  Run from an ADMIN PowerShell:
    Set-ExecutionPolicy Bypass -Scope Process -Force
    Get-ChildItem -Recurse | Unblock-File          # if files came from a zip
    .\install-node2.ps1
#>

$ErrorActionPreference = "Stop"
$Root     = "C:\reclame\sidecar"
$NssmDir  = "C:\tools\nssm"
$NssmExe  = "$NssmDir\nssm.exe"
$HfHome   = "C:\hf-cache"
$TrellisDir = "$Root\TRELLIS-for-windows"

function Info($msg) { Write-Host "  $msg" -ForegroundColor Cyan }
function Ok($msg)   { Write-Host "  OK  $msg" -ForegroundColor Green }
function Warn($msg) { Write-Host "  WARN $msg" -ForegroundColor Yellow }

Write-Host "`nReclame sidecar — node 2 installer" -ForegroundColor Magenta
Write-Host "====================================`n"

# ─── 0. Windows hardening: long paths + Defender exclusions ──────────────────
New-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem" `
    -Name "LongPathsEnabled" -Value 1 -PropertyType DWORD -Force | Out-Null
Ok "Long path support enabled"

Add-MpPreference -ExclusionPath "C:\reclame"      -ErrorAction SilentlyContinue
Add-MpPreference -ExclusionPath "C:\ollama-models" -ErrorAction SilentlyContinue
Add-MpPreference -ExclusionPath "C:\hf-cache"      -ErrorAction SilentlyContinue
Ok "Windows Defender exclusions added"

Get-ChildItem $PSScriptRoot -Recurse -ErrorAction SilentlyContinue | Unblock-File

# ─── 1. Download NSSM if not present ─────────────────────────────────────────
if (-not (Test-Path $NssmExe)) {
    Info "Downloading NSSM..."
    $nssmZip = "$env:TEMP\nssm.zip"
    Invoke-WebRequest -Uri "https://nssm.cc/release/nssm-2.24.zip" `
                      -OutFile $nssmZip -UseBasicParsing
    New-Item -ItemType Directory -Path $NssmDir -Force | Out-Null
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip   = [System.IO.Compression.ZipFile]::OpenRead($nssmZip)
    $entry = $zip.Entries | Where-Object { $_.FullName -like "*/win64/nssm.exe" }
    [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $NssmExe, $true)
    $zip.Dispose()
    Remove-Item $nssmZip
    Ok "NSSM installed → $NssmExe"
}

$syspath = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
if ($syspath -notlike "*$NssmDir*") {
    [System.Environment]::SetEnvironmentVariable("Path", "$syspath;$NssmDir", "Machine")
    $env:Path += ";$NssmDir"
    Ok "NSSM added to PATH"
}

# ─── 2. Copy sidecar files ────────────────────────────────────────────────────
Info "Copying sidecar files to $Root..."
if (-not (Test-Path $Root)) { New-Item -ItemType Directory -Path $Root | Out-Null }
Copy-Item "$PSScriptRoot\*" $Root -Recurse -Force
Ok "Files copied"

# ─── 3. HuggingFace cache dir ────────────────────────────────────────────────
if (-not (Test-Path $HfHome)) { New-Item -ItemType Directory -Path $HfHome | Out-Null }
[System.Environment]::SetEnvironmentVariable("HF_HOME", $HfHome, "Machine")
$env:HF_HOME = $HfHome
Ok "HF_HOME → $HfHome"

# ─── 4. Python virtual environment ───────────────────────────────────────────
Push-Location $Root
try {
    Info "Creating Python venv..."
    python -m venv .venv
    $python = "$Root\.venv\Scripts\python.exe"
    $pip    = "$Root\.venv\Scripts\pip.exe"

    Info "Upgrading pip..."
    & $python -m pip install --upgrade pip --quiet

    Info "Installing PyTorch (CUDA 12.4)..."
    & $pip install torch torchvision torchaudio `
          --index-url https://download.pytorch.org/whl/cu124 --quiet

    Info "Installing sidecar requirements..."
    & $pip install -r requirements.txt --quiet

    Ok "Python environment ready"
} finally {
    Pop-Location
}

# ─── 5. TRELLIS (community Windows build) ────────────────────────────────────
# The official microsoft/TRELLIS repo is Linux-only. Use the community
# Windows fork: https://github.com/sdbds/TRELLIS-for-windows
#
# Requires: VS 2022 C++ Build Tools + CUDA Toolkit (already in prereqs).
# First-run download of model weights (~10 GB) happens on first /mesh/generate request.
if (-not (Test-Path $TrellisDir)) {
    Info "Cloning TRELLIS-for-windows community fork..."
    git clone --recurse-submodules `
        https://github.com/sdbds/TRELLIS-for-windows.git $TrellisDir
} else {
    Info "Updating TRELLIS-for-windows..."
    Push-Location $TrellisDir
    git pull
    Pop-Location
}

Push-Location $TrellisDir
try {
    Info "Installing TRELLIS Python package (this may take several minutes)..."
    & "$Root\.venv\Scripts\pip.exe" install -e . --no-build-isolation --quiet
    Ok "TRELLIS installed"
} catch {
    Warn "TRELLIS install failed: $_"
    Warn "Mesh generation (/mesh/generate) will return 501 until TRELLIS is fixed."
    Warn "See: https://github.com/sdbds/TRELLIS-for-windows/issues"
} finally {
    Pop-Location
}

# ─── 6. Windows Firewall ─────────────────────────────────────────────────────
Info "Adding Windows Firewall inbound rules..."
foreach ($r in @(
    @{ Name = "Reclame Ollama (11434 TCP)"; Port = 11434 },
    @{ Name = "Reclame Sidecar (8800 TCP)"; Port = 8800  }
)) {
    if (-not (Get-NetFirewallRule -DisplayName $r.Name -ErrorAction SilentlyContinue)) {
        New-NetFirewallRule -DisplayName $r.Name `
            -Direction Inbound -Protocol TCP -LocalPort $r.Port `
            -Action Allow -Profile @("Domain","Private") | Out-Null
        Ok "Firewall: $($r.Name)"
    }
}

# ─── 7. Ollama environment variables ─────────────────────────────────────────
[System.Environment]::SetEnvironmentVariable("OLLAMA_HOST",   "0.0.0.0:11434",  "Machine")
[System.Environment]::SetEnvironmentVariable("OLLAMA_MODELS", "C:\ollama-models","Machine")
Warn "Restart the Ollama service to pick up OLLAMA_HOST / OLLAMA_MODELS."

# ─── 8. Install / update Windows service ─────────────────────────────────────
$svcName = "reclame-sidecar"
$python  = "$Root\.venv\Scripts\python.exe"

$existing = Get-Service -Name $svcName -ErrorAction SilentlyContinue
if ($existing) {
    & $NssmExe stop $svcName confirm 2>$null
    & $NssmExe remove $svcName confirm
}

Info "Installing $svcName service..."
& $NssmExe install $svcName $python "-m" "uvicorn" "server:app" `
          "--host" "0.0.0.0" "--port" "8800"
& $NssmExe set $svcName AppDirectory   $Root
& $NssmExe set $svcName DisplayName    "Reclame AI Sidecar (node 2)"
& $NssmExe set $svcName Description    "FastAPI sidecar: image-gen, mesh-gen, asr, tts, rerank, colpali"
& $NssmExe set $svcName Start          SERVICE_AUTO_START

& $NssmExe set $svcName AppEnvironmentExtra `
    "SIDE_CAPS=image-gen,mesh-gen,asr,tts,rerank,colpali" `
    "SIDE_PORT=8800" `
    "SIDE_DEVICE=cuda" `
    "HF_HOME=$HfHome"

& $NssmExe set $svcName AppStdout "$Root\logs\stdout.log"
& $NssmExe set $svcName AppStderr "$Root\logs\stderr.log"
& $NssmExe set $svcName AppRotateFiles 1
& $NssmExe set $svcName AppRotateBytes 10485760

New-Item -ItemType Directory -Path "$Root\logs" -Force | Out-Null

& $NssmExe start $svcName
Ok "Service '$svcName' started"

# ─── Done ─────────────────────────────────────────────────────────────────────
Write-Host "`n=== Node 2 sidecar installed ===" -ForegroundColor Green
Write-Host ""
Write-Host "Health check (wait ~15 s for startup):"
Write-Host "  curl http://localhost:8800/health"
Write-Host ""
Write-Host "First Flux request downloads ~12 GB to $HfHome — allow 10-20 min."
Write-Host "First TRELLIS request downloads ~10 GB — similar wait."
Write-Host ""
Write-Host "Log file:  $Root\logs\stdout.log"
Write-Host "Service:   sc query reclame-sidecar"
Write-Host ""
Write-Host "Next step: run scripts\ai\pull-models-node2.ps1 to pull Ollama models."
