# Canvas editing and visual understanding through OpenRouter

## User workflow

Toolkit's assistant now receives a bounded scene inventory instead of only idea-card text. Ask for a layout change, a diagram, edits to labels, connected objects, resized media, or a review of the current drawing. The assistant returns a reviewable set of edits. **Apply all edits** applies the set as a single undo step; individual proposals remain available for smaller changes.

The inventory includes exact shape IDs, parent relationships, page and local geometry, rotation, opacity, native styles, labels, card/document text, asset metadata, selection, and arrow bindings. Technical node inputs and computed outputs are reference evidence. Legacy private chat threads and order-form field values are excluded. The response reports how many shapes were included. Up to 200 shapes are included, prioritizing selection; selecting an omitted shape brings it into the next request.

### Visual context

The **Include drawing and image pixels** option adds actual pixels:

- Native tldraw drawings, text, notes, geometry and arrows are exported through the installed tldraw SVG API, then rasterized locally into a PNG. If anything is selected, the selected shapes and their descendants determine the drawing scope; otherwise the page's native drawings are used. The export is limited to 1600 pixels on each edge and 800 KiB.
- Up to three stored project images are resolved by exact board and asset ID through the authenticated Supabase client. Selected images have priority. Each image must be a verified PNG, JPEG or WebP of at most 4 MiB, with a combined 8 MiB limit.
- HTML nodes, web embeds, video and audio contents are not included in the native drawing export. Their text, geometry and safe metadata remain in scene context. The UI and model receive omitted and skipped counts. A failed/unsupported drawing export falls back to structured context and any available stored images, without claiming the missing drawing was inspected.

PDF reading and image-specific questions continue to use the existing **Ask about selected file** workflow. A PDF preview alone does not imply extracted text. Video/audio playback and embedded web pages are not automatically transcribed or analyzed.

Images and drawing pixels are used for the current request; the provider response remains in the user's private discussion unless the user applies or pins it to the shared board. The pixels are never inserted into shared snapshot data or private chat history.

## Supported edits

| Operation | Result |
| --- | --- |
| Create | Idea card, geometric shape, native text, note, frame, or document/media reference |
| Update | Text/content, supported native styles, position, rotation and opacity |
| Move / resize | Page-coordinate translation or dimensions applied through native editor APIs |
| Connect | Bound arrow between existing eligible shapes, with optional label |
| Duplicate / delete | Copy or remove an explicit bounded set of shapes |
| Group / ungroup | Native group operations |
| Reorder | Front, back, forward or backward in the stacking order |
| Align / distribute | Native edge/center alignment and even horizontal/vertical spacing |
| Revise / layout | Existing idea-card revision and grid/column arrangement |

Media references use the same `canvasLinkShapeProps` URL policy as manual paste. The model cannot supply raw iframe HTML, an arbitrary embed target, an asset owner, a storage path, or `fileId`/`assetId`. YouTube/Vimeo embeds and public image/PDF/video/audio links are derived from the approved URL; other public websites become link cards.

Native style values are allowlisted against the installed tldraw version. Technical node calculations and order data cannot be overwritten by model output. Existing specialized technical tools remain responsible for executing calculations.

## Mutation boundaries and stability

`toolkit-actions.ts` is a JSON-only action contract, validated independently of the model provider. Unsupported fields, enum values, dimensions and targets are rejected. One response contains at most 12 actions, with at most 40 targets per action. A legacy caller that supplies only card IDs retains the original narrow card-action contract.

Every proposal generated from a scene is stamped with the page ID and fingerprints of its targets, descendants and parent chain. The browser rechecks those fingerprints at application time. A deleted target, moved target, changed parent, edited label, newly added group child, or different page rejects the proposal before any mutation. Locked shapes, unknown shape types, private chat nodes and order forms are protected, including through group/parent operations.

The complete action set is preflighted before application. `editor.mark` establishes a history boundary, `editor.run` batches the mutations, and a final mark closes the step. If an editor operation throws, `bailToMark` restores the preceding document. No action can run JavaScript, access a shell, call an OMS endpoint, change asset ownership, remove locks or persist an order form.

The existing shared-board revision conflict gate also blocks Apply. Shared persistence still uses the normal revision-checked canvas endpoint. Discussion proposals are user scoped and can be restored after reopening a project. Restored proposals retain their fingerprints; reopening never silently refreshes a stale proposal into authority to overwrite newer work.

## Provider and request configuration

The existing R&D OpenRouter API-key setting supplies the credential. Text-only requests use the selected server-allowed Toolkit model; requests containing drawing/image pixels use the configured `OPENROUTER_VISION_MODEL`. That model must support image input. The actual routed model remains visible in the assistant UI.

Research remains an explicit skill. Self-hosted SearXNG remains the ordinary research path. Optional OpenRouter web search still requires the administrator's `OPENROUTER_TOOLKIT_WEB_SEARCH=true` gate and the user's Research selection. Visual context does not silently enable web search or PDF OCR.

The assistant endpoint requires Toolkit-manager access, uses the existing AI throttle, and limits the complete streamed request to 2 MiB. Scene text is bounded separately; the native PNG's signature, IHDR dimensions, encoded/decoded size and referenced shape IDs are checked before inference. Board visibility is verified before visual processing, and stored image metadata, byte count and magic signature are checked before sending private bytes. Arbitrary remote asset URLs are never fetched by the visual-context loader. Provider inference has a 90-second timeout and the browser request has a 120-second bound.

## Verification

`tests/unit/canvas-scene-actions.test.ts` exercises full-scene privacy/bounds, selection priority, fingerprints, protected ancestors/descendants, supported property validation, unsafe media rejection, atomic edit/rollback behavior, bound native arrows, image ownership/byte checks, PNG signature/dimension validation and streamed request limits.

The OpenRouter scenario in `tests/e2e/canvas-media.spec.ts` mounts the actual Toolkit page and tldraw editor with API fixtures. It creates real geometry/text shapes, generates a real native drawing PNG, applies content/style/move/resize/connect/group proposals, and verifies that one native Undo restores the preceding document. No live provider call is required for this regression test.
