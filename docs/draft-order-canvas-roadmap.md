# Draft Order Canvas — Roadmap

Status: **parked.** The form-based draft builder at `src/routes/orders/new/+page.svelte` is the canonical surface for draft creation. The canvas template at `src/lib/components/canvas/templates/DraftOrderTemplate.ts` (tldraw, ~225 lines) stays in tree but is not navigable.

## Why parked

- The form is production-ready: validated, multi-profile config, file upload with PDF preview, delivery presets, server-side drafts → review-queue flow.
- The canvas prototype duplicates fields, has no validation, and no file upload. Maintaining two creation surfaces during the lifecycle overhaul would multiply work.
- The lifecycle changes (DRAFT → PENDING_REVIEW → CONFIRMED → …, server-side notifications, RLS gating, PO assignment by Boss) live entirely in the form path.

## Future direction (if revisited)

The canvas is a strong fit for **Head of Production review** and **production layout / cut-list overview**, not for draft entry. Concrete ideas:

1. **Review canvas** — when an HoP opens an order in review, render the order as a live canvas: Order Details shape (read-only), profile-7st shapes (one per `order_profiles` row), and four production-zone frames (Laser, CNC, Bender, Visuals). Drag-drop CNC/laser/bender output files onto the matching zone to attach them with the correct `target_station` tag.
2. **Cut-list canvas** — auto-generated from confirmed `order_profiles` and `order_materials`, showing nested-sheet placement so the HoP can sanity-check material usage before sending to CNC.
3. **Loading-day canvas** — visual weekly grid where HoPs drag READY_TO_LOAD orders onto loading_day slots; capacity badge (already exposed by the `loading_capacity_overview` view) lights red when overflowing.

## Foundations to keep

- Tldraw engine is already wired (`/ai-lab/canvas`).
- `DraftOrderTemplate.ts` shape definitions are reusable for the review/cut-list canvases above.
- Order fields, profile shape, and zone frames all map cleanly to the existing `draft_orders`, `order_profiles`, and `order_files` schema.

## Definition of "unparked"

Re-open this when:
- a concrete user story demands a visual surface (review/layout/loading), and
- the form-based lifecycle is stable in production for at least one full order cycle.

Until then: **do not link the canvas in nav, do not duplicate form fields into shapes**.
