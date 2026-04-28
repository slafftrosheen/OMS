#Requires -RunAsAdministrator
<#
.SYNOPSIS
  Install the Reclame AI Lab sidecar on AI node 1 (reasoning / vision / embed).

.DESCRIPTION
  Capabilities deployed: vision, embed, rerank, asr
  (image-gen, mesh-gen, tts, colpali are on node 2)

  Prerequisites — install BEFORE running this script:
    1. NVIDIA driver 560+  (includes CUDA 12.x runtime)
    2. CUDA Toolkit 12.4   https://developer.nvidia.com/cuda-12-4-0-download-archive
    3. cuDNN 9.x           https://developer.nvidia.com/cudnn-downloads  (zip → copy to CUDA dir)
    4. Python 3.11 64-bit  https://www.python.org/downloads/  (add to PATH during install)
    5. Git for Windows     https://git-scm.com/download/win
    6. FFmpeg              https://ffmpeg.org/download.html  → extract → add bin\ to system PATH
    7. Ollama              https://ollama.com/download  (already running on :11434)

  Run from an ADMIN PowerShell:
    Set-ExecutionPolicy Bypass -Scope Process -Force
    Get-ChildItem -Recurse | Unblock-File          # if files came from a zip
    .\install-node1.ps1
#>

$ErrorActionPreference = "Stop"
$Root     = "C:\reclame\sidecar"
$NssmDir  = "C:\tools\nssm"
$NssmExe  = "$NssmDir\nssm.exe"

# ─── Helper ──────────────────────────────────────────────────────────────────
function Info($msg) { Write-Host "  $msg" -ForegroundColor Cyan }
function Ok($msg)   { Write-Host "  OK  $msg" -ForegroundColor Green }
function Warn($msg) { Write-Host "  WARN $msg" -ForegroundColor Yellow }

Write-Host "`nReclame sidecar — node 1 installer" -ForegroundColor Magenta
Write-Host "====================================`n"

# ─── 0. Windows hardening: long paths + Defender exclusions ──────────────────
# Python venvs + HF caches blow past Windows' 260-char path limit. Enable
# long-path support (no reboot needed for new processes).
New-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem" `
    -Name "LongPathsEnabled" -Value 1 -PropertyType DWORD -Force | Out-Null
Ok "Long path support enabled"

# Defender real-time scan slows pip/torch dramatically; exclude the model dirs.
Add-MpPreference -ExclusionPath "C:\reclame"      -ErrorAction SilentlyContinue
Add-MpPreference -ExclusionPath "C:\ollama-models" -ErrorAction SilentlyContinue
Ok "Windows Defender exclusions added"

# Unblock any files that came from a downloaded zip
Get-ChildItem $PSScriptRoot -Recurse -ErrorAction SilentlyContinue | Unblock-File

# ─── 1. Download NSSM if not present ─────────────────────────────────────────
if (-not (Test-Path $NssmExe)) {
    Info "Downloading NSSM (Non-Sucking Service Manager)..."
    $nssmZip = "$env:TEMP\nssm.zip"
    # NSSM 2.24 — stable release from nssm.cc
    Invoke-WebRequest -Uri "https://nssm.cc/release/nssm-2.24.zip" `
                      -OutFile $nssmZip -UseBasicParsing
    New-Item -ItemType Directory -Path $NssmDir -Force | Out-Null
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = [System.IO.Compression.ZipFile]::OpenRead($nssmZip)
    $entry = $zip.Entries | Where-Object { $_.FullName -like "*/win64/nssm.exe" }
    [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $NssmExe, $true)
    $zip.Dispose()
    Remove-Item $nssmZip
    Ok "NSSM installed → $NssmExe"
} else {
    Ok "NSSM already present at $NssmExe"
}

# Add NSSM to the system PATH if it isn't there yet
$syspath = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
if ($syspath -notlike "*$NssmDir*") {
    [System.Environment]::SetEnvironmentVariable("Path", "$syspath;$NssmDir", "Machine")
    $env:Path += ";$NssmDir"
    Ok "Added $NssmDir to system PATH"
}

# ─── 2. Copy sidecar files ────────────────────────────────────────────────────
Info "Copying sidecar files to $Root..."
if (-not (Test-Path $Root)) { New-Item -ItemType Directory -Path $Root | Out-Null }
Copy-Item "$PSScriptRoot\*" $Root -Recurse -Force
Ok "Files copied"

# ─── 3. Python virtual environment ───────────────────────────────────────────
Push-Location $Root
try {
    Info "Creating Python venv..."
    python -m venv .venv
    $python = "$Root\.venv\Scripts\python.exe"
    $pip    = "$Root\.venv\Scripts\pip.exe"

    Info "Upgrading pip..."
    & $python -m pip install --upgrade pip --quiet

    # PyTorch MUST be installed first with the CUDA 12.4 wheel index.
    Info "Installing PyTorch (CUDA 12.4)..."
    & $pip install torch torchvision torchaudio `
          --index-url https://download.pytorch.org/whl/cu124 --quiet

    Info "Installing sidecar requirements..."
    & $pip install -r requirements.txt --quiet

    Ok "Python environment ready"
} finally {
    Pop-Location
}

# ─── 4. Windows Firewall — open Ollama + sidecar ports ───────────────────────
Info "Adding Windows Firewall inbound rules..."
$fwRules = @(
    @{ Name = "Reclame Ollama (11434 TCP)"; Port = 11434 },
    @{ Name = "Reclame Sidecar (8800 TCP)"; Port = 8800  }
)
foreach ($r in $fwRules) {
    $exists = Get-NetFirewallRule -DisplayName $r.Name -ErrorAction SilentlyContinue
    if (-not $exists) {
        New-NetFirewallRule -DisplayName $r.Name `
            -Direction Inbound -Protocol TCP -LocalPort $r.Port `
            -Action Allow -Profile @("Domain","Private") | Out-Null
        Ok "Firewall rule added: $($r.Name)"
    } else {
        Ok "Firewall rule already exists: $($r.Name)"
    }
}

# ─── 5. Ollama environment variables ─────────────────────────────────────────
# These require an Ollama service restart to take effect.
Info "Setting Ollama environment variables (machine scope)..."
[System.Environment]::SetEnvironmentVariable("OLLAMA_HOST",   "0.0.0.0:11434",  "Machine")
[System.Environment]::SetEnvironmentVariable("OLLAMA_MODELS", "C:\ollama-models","Machine")
Warn "Restart the Ollama service for OLLAMA_HOST / OLLAMA_MODELS to take effect."
Warn "  In Services.msc: find 'Ollama' → Restart"

# ─── 6. Install / update the Windows service via NSSM ────────────────────────
$svcName = "reclame-sidecar"
$python  = "$Root\.venv\Scripts\python.exe"

# Remove stale service if it exists
$existing = Get-Service -Name $svcName -ErrorAction SilentlyContinue
if ($existing) {
    Info "Removing existing $svcName service..."
    & $NssmExe stop $svcName confirm 2>$null
    & $NssmExe remove $svcName confirm
}

Info "Installing $svcName service..."
& $NssmExe install $svcName $python "-m" "uvicorn" "server:app" `
          "--host" "0.0.0.0" "--port" "8800"
& $NssmExe set $svcName AppDirectory   $Root
& $NssmExe set $svcName DisplayName    "Reclame AI Sidecar (node 1)"
& $NssmExe set $svcName Description    "FastAPI sidecar: vision, embed, rerank, asr"
& $NssmExe set $svcName Start          SERVICE_AUTO_START

# Set env vars directly on the service so they don't need a machine restart
& $NssmExe set $svcName AppEnvironmentExtra `
    "SIDE_CAPS=vision,embed,rerank,asr" `
    "SIDE_PORT=8800" `
    "SIDE_DEVICE=cuda"

& $NssmExe set $svcName AppStdout "$Root\logs\stdout.log"
& $NssmExe set $svcName AppStderr "$Root\logs\stderr.log"
& $NssmExe set $svcName AppRotateFiles 1
& $NssmExe set $svcName AppRotateBytes 10485760

New-Item -ItemType Directory -Path "$Root\logs" -Force | Out-Null

& $NssmExe start $svcName
Ok "Service '$svcName' started"

# ─── Done ─────────────────────────────────────────────────────────────────────
Write-Host "`n=== Node 1 sidecar installed ===" -ForegroundColor Green
Write-Host "Health check (wait ~10 s for startup):"
Write-Host "  curl http://localhost:8800/health"
Write-Host ""
Write-Host "Log file:  $Root\logs\stdout.log"
Write-Host "Service:   sc query reclame-sidecar"
Write-Host ""
Write-Host "Next step: run scripts\ai\pull-models-node1.ps1 to pull Ollama models."
