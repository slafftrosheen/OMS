# Voice messages in team and order chats

## User flow

Voice recording is available in the built-in human chat surfaces: the chat page, chat drawer, compact chat views and order discussions. The shared recorder supports start, stop, preview, discard and send. Text remains available alongside it. Recording never starts automatically, and sending requires an explicit action after recording.

The recorder negotiates a browser-supported WebM, Ogg or MP4 audio format. Each message allows at most **five minutes** and **15 MiB**. The server measures the audio itself before accepting it; a browser-supplied duration is not authoritative. Microphone permission errors, unavailable devices, unsupported browsers and insecure origins receive an actionable message. A failed send retains the recording for a retry. Changing account or conversation cancels the local recording lifecycle and prevents a late response from appearing in another conversation.

The same voice player renders stored recordings in channels, direct conversations and order discussions. It shows the retention deadline and replaces expired audio with a visible expired-message marker. There is no automatic transcription or AI processing of chat recordings.

## Retention and text history

The database assigns a voice recording's deadline as its sent time plus **three calendar months in UTC**, rather than a fixed 90-day duration. The deadline does not move when a user opens or plays a message. Month-end dates follow PostgreSQL calendar-month arithmetic.

Playback checks the authenticated user, conversation access and the database deadline on every request. An expired recording cannot be fetched through the playback endpoint while waiting for storage cleanup. Private, non-cacheable playback avoids issuing a long-lived client storage URL. Browser audio range requests use the same permission and expiry checks.

The production retention worker deletes expired audio through the Supabase Storage API. It polls every minute and claims batches of up to 20 objects with five-minute database leases. Completion records allow safe retries after process restarts, storage failures or uncertain responses; a failed removal is retried with bounded backoff. Abandoned staged uploads are also eligible for cleanup after 24 hours. Audio bytes are removed separately from the conversation record, preserving an explanation of the expired message in its original context.

**Text messages have no automatic retention limit.** The voice worker does not delete text messages, captions, order discussion history or complete conversations. Existing deliberate delete/archive behavior remains separate from voice retention. Metadata and text remain in the database until deliberately removed through the applicable database or application operation.

## Access and persistence

`POST /api/chat/voice` accepts a multipart request containing one conversation identifier (`roomId` or `orderId`), a recording, its client duration and a UUID retry identifier. Optional text and reply context are validated with the conversation. The server authorizes the current active user before staging storage, verifies the actual file type and audio duration, and atomically binds the finished upload to its message. A retry with the same request identity returns the same committed message rather than duplicating it.

The voice bucket is private. The service-role key remains on the server, and browser clients cannot choose arbitrary storage paths or write a voice attachment into another person's message. `GET /api/chat/voice/[id]` is the authenticated playback boundary. General room responses use `attachments`; the legacy order response retains its existing attachment URLs and adds a separate `voiceAttachments` collection.

Order voice sends create the usual notification for the active order creator and assignees, excluding the sender. Notification insertion and optional existing Telegram outbox enqueueing occur in the same transaction as the message commit. Replaying a successful send creates neither another message nor another notification.

Generic chat file uploads also pass through the authorized server storage path and require its service configuration. Audio signatures and container stream checks prevent an audio-only recording from being stored indefinitely as an ordinary file with a misleading MIME label. Valid non-audio files keep their existing attachment behavior. Direct client writes to chat attachment metadata and these storage paths are denied independently of older permissive policies.

Direct-message creation uses an authorized database operation so ordinary active workers can open a conversation with an active colleague without receiving broad room-management permissions. The operation creates only the intended two-person membership and reuses the existing conversation on retry.

## Deployment

Apply `supabase/migrations/20261031000004_chat_voice_retention.sql` through the normal reviewed migration procedure after confirming the target database and backing it up. A build, commit or app restart does not install this schema or change a live storage bucket.

The production app needs:

- Its existing `PUBLIC_SUPABASE_URL` and private `SUPABASE_SERVICE_ROLE_KEY` for validated voice storage and cleanup.
- A running Supabase Storage service and the migration's private voice bucket and policies.
- `ffprobe` on the OMS service's executable path. Docker installs the `ffmpeg` package in the runtime stage. A host/systemd deployment must install that package separately; `ffprobe -version` should succeed as the service user. A missing processor returns a setup error and does not accept unverified audio.
- The existing upload configuration: `BODY_SIZE_LIMIT=32M` in the actual OMS process environment and, where applicable, `client_max_body_size 32m;` in its reverse proxy. A private example file or Docker default does not update an existing systemd environment.
- An **HTTPS** browser URL, or localhost for local development. Plain HTTP on a LAN hostname or IP cannot request a microphone. The app permits `microphone=(self)` in its Permissions Policy; the browser still asks the user for microphone access.

The retention loop starts from `hooks.server.ts` only in the running production server. It is disabled during builds, development and unit tests. Voice playback rejects expired audio independently of whether this loop is currently healthy. Physical deletion requires the loop and Storage to be available, so operators should investigate repeated cleanup errors rather than treating an expired UI marker as evidence that a storage object was removed.

Look for `Expired voice recordings removed` and `Voice recording cleanup is waiting for recovery` in the application logs. The worker reports counts and sanitized failure categories; it does not log recordings, message text, private notes or credentials. The `chat_voice_cleanup_jobs` ledger retains attempts, availability, leases and completion for operational investigation. Deleting an attachment record also queues its binary path so a database cascade cannot leave an untracked audio object.

Existing legacy attachments need review during migration validation. The migration identifies audio attachment rows, derives their deadlines from the original message or attachment timestamps, and makes the legacy attachment bucket private; it does not grant old audio a fresh three-month window. New recordings use the private voice path. Previously downloaded recordings cannot be recalled from another device, and historically issued links require the applicable storage policies and object cleanup; application UI alone cannot revoke an old public copy.

## Verification

Run the standard source/unit tests, Svelte diagnostics, build and `git diff --check`, plus the focused voice browser and isolated database checks. Test the actual production HTTPS endpoint with a real microphone after deployment; local browser fixtures do not prove microphone permission, real hardware, proxy limits or the deployed Supabase configuration.

The focused scenarios cover recording/preview/discard/send, denied and late microphone permission, context changes, failed-send retry, expiry display, text preservation, private room/order access, staged uploads, atomic commit, measured duration, and cleanup retry behavior. Run Svelte check and build sequentially because both update `.svelte-kit`.

```sh
npx playwright test --config tests/ui/playwright.config.ts chat-voice.spec.ts
node scripts/chat/verify-voice-retention.mjs
```

The isolated verifier uses `@electric-sql/pglite` and generates synthetic clips with `ffmpeg`. When PGlite is installed outside the checkout, set `OMS_CHAT_PGLITE_MODULE` to its absolute `dist/index.js` path. It executes the actual migration against disposable canonical chat/profile tables, replaces a private clock helper only inside that fixture, and exercises real `ffprobe` validation for WebM/Opus, Ogg/Opus and fragmented MP4/AAC. It never connects to the configured Supabase server, records a microphone or deletes real storage.

Browser requirements are described in [MDN's getUserMedia documentation](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia). Server probing and protocol limits follow the [ffprobe](https://ffmpeg.org/ffprobe.html) and [FFmpeg protocol](https://ffmpeg.org/ffmpeg-protocols.html) documentation.

## Conversation history and daily use

The order discussion uses a bounded panel so its message list scrolls independently and loading older pages cannot push the composer below the entire conversation.

The room page, drawer, station panel, compact topbar chat, and order discussion expose **Load earlier messages** above the message list. The API returns at most 100 messages plus an opaque next-page cursor. It orders by the full PostgreSQL `created_at` timestamp and message UUID, so messages sharing a timestamp cannot be skipped at a page boundary. The legacy `before` timestamp parameter remains supported; new clients use the cursor and reject an ambiguous room/order target. Reads continue through the caller's RLS-scoped database client.

Loading an earlier page preserves the reader's scroll position. A live refresh keeps already loaded earlier pages and reconciles the refreshed newest page. If a long offline interval leaves a gap between cached messages and the new latest window, pagination restarts at that window so the unseen middle interval remains reachable. Errors show a retry control; they are not displayed as an empty conversation or a completed history. Realtime edits and deletes update already loaded older messages, and revision guards prevent an in-flight history page from undoing those changes. Earlier-page insertion anchors the visible message rather than counting total scroll-height growth, so a concurrent new arrival does not move the reader.

Room composers provide an explicit Send button as well as Enter to send and Shift+Enter for a new line. Text and selected mentions remain in the composer until the server confirms the message, including after a failed request. A pending send disables duplicate submission. The human chat surfaces share one account-scoped, in-memory draft for each room. Closing a drawer or popover, or switching away and returning, retains the draft and its pending-send lock; a confirmation clears only the unchanged draft that was sent. Failed sends remain available for retry, including after reopening. Account changes clear these drafts. Drafts are not persisted to browser storage. Mobile full chat has a labeled conversation picker, including direct messages and production stations.

Voice players retain native browser controls, offer 1×/1.25×/1.5×/2× playback, and pause the previous voice recording when another starts, including a recording preview. The availability label includes the exact expiry date and time in Europe/Riga. Playback policy and cleanup remain three calendar months from send time; text is unaffected.
