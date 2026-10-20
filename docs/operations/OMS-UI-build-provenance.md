# OMS UI release provenance (manual systemd deployments)

OMS does **not** deploy from GitHub when changes are committed. The repository is storage only. The production app is expected to run from `/opt/reclame-oms` under `reclame-oms.service`, serving the **last compiled** SvelteKit `build/` bundle, not current GitHub source.

An explicit user report from October 2026 found blue buttons and an old dashboard layout after manually deploying, despite `main` containing graphite/magenta styles. Do not assume that a pull, restart, browser refresh or successful GitHub commit means the compiled runtime is current.

## New build fingerprint

The Vite config embeds two **compile-time** constants into both app bundles:

- `revision`: git HEAD short SHA at the time Vite compiles (or configured `OMS_SOURCE_REVISION` / `GITHUB_SHA` when git metadata is unavailable).
- `builtAt`: compilation timestamp in UTC.

They are exposed at `GET /api/build-info` with no-cache headers and as a small release reference on the **Settings** page. They cannot update when you merely pull source code or restart an unchanged `build/` bundle. They contain no secrets or environment paths.

Example after a correctly rebuilt deployment:

```json
{
  "revision": "<the SHA from your OMS checkout at build time>",
  "builtAt": "<UTC time from the last compilation>",
  "design": "LUMIGRID graphite/magenta"
}
```

An **HTTP 404 at `/api/build-info`** means the running app still predates this diagnostic (or a proxy serves a different instance). A valid endpoint with an older SHA/timestamp means the compiled application is stale.

## Read-only diagnosis on the OMS host

Run **these first**, before pulling source, building, restarting, or changing configuration:

```sh
cd /opt/reclame-oms
git status --short
git rev-parse --short=12 HEAD
git log -1 --format='%ci %s'
sudo systemctl show reclame-oms.service -p WorkingDirectory -p ExecStart -p MainPID
curl -sS -i http://127.0.0.1:3000/api/build-info
curl -sS 'http://127.0.0.1:3000/brand.css?oms-source-check=20261020' | grep -F -- '#ff2d55' | head -n 3
```

- If the checkout SHA is old, the deployment checked out/pulled a different revision or directory.
- If the checkout is current but `/api/build-info` is 404 or old, the app has not rebuilt/restarted with the current source (or systemd points elsewhere).
- If the app SHA and timestamp are current but the page still looks old, inspect the URL you are actually visiting, its upstream, browser cache, installed PWA versus tab, and the deployed `/brand.css` response.
- The current `static/service-worker.js` is network-only for HTML, JS and CSS; an old service worker or external CDN is possible, but must not be assumed as the root cause without response evidence.

To isolate reverse-proxy mismatch compare `/api/build-info` via the **public/Tailnet URL you open in the browser** with the response on `127.0.0.1:3000`. Responses should match exactly in revision and timestamp. Do not share internal host addresses, secrets or cookies in public logs.

## Manual app-only release after diagnosis

Only if you have confirmed the target is the intended OMS host, reviewed any uncommitted local source edits, and checked the required migrations separately:

```sh
cd /opt/reclame-oms
git fetch origin main
git status --short
git pull --ff-only origin main
# Preserve the host's existing private .env; do not reset or overwrite it.
npm run build
sudo systemctl restart reclame-oms.service
sudo systemctl is-active reclame-oms.service
curl -sS http://127.0.0.1:3000/api/build-info
```

Check `git rev-parse --short=12 HEAD` equals the JSON `revision` (when git metadata was available) and the `builtAt` is from this compilation. The frontend `/brand.css` should contain `--brand: #ff2d55` for DarkVim; avoid treating real blue ORACAL/material swatches as UI chrome.

This is **not a recommendation to blindly apply new SQL migrations**. The codebase has migration-gated order and production changes, documented in `docs/operations/OMS-R26-deployment-readiness.md`. Do not run `git reset --hard`, modify Supabase, or overwrite `.env` as part of a theme release. A successful rebuild of source is not proof of DB compatibility.

## Acceptance gate

No follow-up UX pass is considered visually accepted until a screen capture from the deployed page, the running build fingerprint, and the browser URL's `/brand.css` can be reconciled. Source-commit verification alone is insufficient.
