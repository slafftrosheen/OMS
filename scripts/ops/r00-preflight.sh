#!/usr/bin/env bash
# Read-only server checklist. Never reads or echoes the contents of .env.
set -euo pipefail
cd "$(dirname "$0")/../.."
failed=0
fail() { printf 'FAIL: %s\n' "$*" >&2; failed=1; }
warn() { printf 'WARN: %s\n' "$*" >&2; }

if git ls-files --error-unmatch -- .env >/dev/null 2>&1; then
    fail ".env is still tracked by Git"
fi
if [[ ! -s .env ]]; then
    fail "Runtime .env missing or empty; restore the secured copy before restarting"
fi
if command -v curl >/dev/null 2>&1; then
    if ! curl --fail --silent --show-error --max-time 5 http://127.0.0.1:3000/api/healthz >/dev/null; then
        warn "OMS liveness probe unavailable (service may not yet run the new build)"
    fi
fi
if [[ "$failed" -ne 0 ]]; then exit 1; fi
printf 'PASS: Git excludes .env; local runtime configuration present\n'
