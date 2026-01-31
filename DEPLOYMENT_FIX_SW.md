# Service Worker Deployment Fix (2025-01-31)

## Issue
Users were experiencing 404 errors for JavaScript chunks (e.g., `_app/immutable/entry/start.Bn_YglvG.js`) after new deployments.

## Cause
The issue was caused by the custom Service Worker (`static/service-worker.js`) aggressively caching the App Shell (`index.html`) using a "Cache-First" strategy.

1.  The Service Worker cached `/` (index.html) during the `install` phase.
2.  When a user visited the site, the Service Worker served the stale `index.html` from the cache.
3.  The stale `index.html` referenced old JavaScript chunks (hashed filenames) from the previous build.
4.  Because Vercel deployments are immutable and might not serve old hashed files indefinitely (or if the deployment URL changed), these requests returned 404.
5.  This prevented the SvelteKit app from hydrating, causing a blank screen or broken functionality.

## Fix
We updated `static/service-worker.js` to:

1.  **Bump `CACHE_VERSION`**: Changed to `oms-v1.0.2` to ensure the new Service Worker installs and invalidates old caches.
2.  **Remove `/` from `STATIC_ASSETS`**: The App Shell (`index.html`) is no longer pre-cached.
3.  **Network-First for Navigation**: Navigation requests (visiting a page) now fall through to the `networkFirstStrategy`. This ensures the browser always tries to fetch the latest `index.html` from the server.
    -   If online: The server returns the latest `index.html` (referencing valid JS chunks). The SW caches this new HTML.
    -   If offline: The SW falls back to the cached version (from the last successful visit) or the offline page.

## Additional Cleanup
-   Deleted `static/sw.js`: This was a duplicate/unused Service Worker file that could cause confusion.

## Verification
After deployment, users might need to refresh the page twice or close and reopen the tab to get the new Service Worker activated. Once active, future deployments should work seamlessly without 404s.
