# Canvas controls and embedded media

## Editing surface

Toolkit now has one bottom-center toolbar. The previous large top tool row and
the duplicate native tldraw toolbar/menu controls are removed only for Toolkit.
The order canvas keeps its existing interface.

The main dock contains select, pen, arrow and text, followed by Insert and More
tools. Insert opens files, website/media links, idea cards, material studies and
technical nodes. More tools includes pan, highlighter, eraser, geometric shapes,
line, frame, undo/redo, fit, layout, grouping, duplication and layer order. The
project header retains project creation, Save, Export brief and the assistant.
The existing native style panel still controls the selected object's appearance.
Native drawing and keyboard shortcuts use the same tldraw editor state as the
dock; selecting tools with the keyboard updates the dock's active indicator.

The dock works at 320 px without adding a second toolbar. Popovers have bounded
height, keyboard focus and Escape dismissal. EN/RU/LV labels follow the app's
selected language. Upload/link results are visible even when the assistant is
closed.

## Files and playback

Apply `supabase/migrations/20261022000004_canvas_media.sql` after the existing
Toolkit migrations. It extends the existing private `toolkit-assets` bucket and
metadata MIME constraint with MP4, WebM, MP3, WAV, Ogg and M4A. Existing PNG,
JPEG, WebP, GIF and PDF files remain supported. The per-file limit remains
25 MiB; existing deployment prerequisites (`BODY_SIZE_LIMIT=32M`, adequate proxy
and Supabase Storage limits) still apply.

The upload picker, file drop and clipboard file paste use the same persistent
private upload path. MIME selection handles known browser aliases and missing
types conservatively; server magic-byte checks reject files whose contents do
not match their declared media format. Uploaded videos and audio render native
playback controls; no automatic playback occurs. Codec support is determined by
the browser. Files remain available in Saved files if placing a shape fails or
if an editor later removes the shape.

GET and HEAD `/api/toolkit/assets/:board/:asset` enforce the existing Toolkit
manager role and metadata scope. GET supports a single byte range and returns
206/Content-Range for seeking, or 416 for invalid ranges. Files are fetched from
private Storage, verified against the registered byte count, and served with
`private, no-store`, `nosniff` and same-origin resource policy. At the current
25 MiB bound, the server retrieves the private object before slicing a requested
range; this is not a streaming CDN service.

Unicode filenames use an ASCII `Content-Disposition` fallback and RFC 5987
UTF-8 `filename*`, so Russian and Latvian names do not break Node's response
headers. The original filename is preserved for clients that support it.

OMS server session loading now rejects profiles whose `is_active` flag is not
explicitly true, including still-valid Auth sessions for deactivated accounts.
This blocks those sessions from authenticated OMS routes, including Toolkit
files and previews. It does not rewrite `is_admin()` or existing database and
Storage RLS policies: clients using Supabase directly retain those inherited
policy boundaries. This change is not a comprehensive deactivation RLS audit.

## Website and external media links

Paste an HTTP(S) URL onto the canvas or enter it under Insert. Website cards show
a title, description, optional preview image, source and a link to the original.
If a website refuses metadata retrieval, the URL card still remains usable.
Known direct image, PDF, video and audio URLs use the corresponding viewer. An
external site may impose CORS, authentication or hotlinking restrictions; private
uploads avoid those dependencies.

YouTube and Vimeo URLs create an embedded-video card. The player loads only when
the viewer chooses Play video. The iframe URL is derived from a validated video
ID and an allowlisted provider; arbitrary iframe HTML, scripts or a supplied
`embedUrl` are never executed. YouTube uses its `youtube-nocookie.com` player,
and Vimeo uses its `dnt=1` player option. Loading or playing an external asset
still connects the browser to that provider.

POST `/api/toolkit/link-preview` is authenticated and requires a project that the
manager can access. The preview fetch is bounded to 768 KiB and eight seconds,
with at most three redirects. Every redirect is revalidated, every DNS answer
must be public, and the chosen address is pinned into the socket lookup. No
cookies or authorization headers are forwarded. Returned metadata is plain text
plus validated URLs. Per-user preview requests use a separate 12/minute bucket
from model inference calls. The URL constructor rejects active schemes,
credentials, nonstandard ports, IP literals and common intranet names.

## Regression coverage

`tests/unit/canvas-media.test.ts` exercises URL/provider rules, metadata parsing,
private/mixed DNS rejection, MIME signatures, persistent video placement,
byte-range parsing, authenticated range responses, HEAD behavior and Russian/
Latvian response filenames. `tests/unit/session-active-account.test.ts` covers
inactive/missing-active rejection and preservation of active role/station data.

`tests/integration/canvas-media-migration.mjs` executes the exact migration in
isolated PostgreSQL/WASM, including repeat application, accepted media, rejected
active content, preserved existing files and unchanged private/size limits:

```sh
OMS_PGLITE_MODULE=/path/to/@electric-sql/pglite/dist/index.js \
  node tests/integration/canvas-media-migration.mjs
```

The Playwright fixture `tests/ui/canvas-media.html` mounts the actual Toolkit
page and actual tldraw editor with mocked application APIs. It covers the single
toolbar, native drawing, website/embed/private video insertion, persistence,
native editing after media insertion, clipboard URLs, small-screen layout and
the three app themes. The media fixture uses controlled response bytes; it does
not validate every browser codec or contact a live provider.
