# Calendar day badges

The `/calendar` page combines loading dates, order deadlines, loading-day availability, meetings and notes. Select a date to see its underlying records in the day agenda. Arrow keys move between dates; the month controls and Today button change the visible period.

## Reading a day

| Badge | Meaning |
| --- | --- |
| Loading / truck | Number of distinct scheduled orders or linked loading-event PO references. An open loading day with no orders still shows a Loading day badge. |
| Due / clock | Outstanding orders whose deadline is that date. |
| Overdue / warning | Outstanding orders whose deadline has passed. This badge stays on the original deadline date. |
| Meeting / people | Meetings recorded for the date. |
| Note / document | Notes and reminder records for the date. |
| Loading closed / lock | Loading is blocked for that date. Existing records remain visible so conflicts can be reviewed. |

Badges use icons, labels and counts together. At phone widths, date cells show compact icons and counts; the legend and selected-day agenda retain the full labels. English, Russian and Latvian are supported in the light, dark and high-contrast themes.

Completed, dispatched and archived work does not generate deadline alerts. Cancelled, voided and legacy rejected orders are excluded from due and loading summaries. Known order IDs and PO numbers are deduplicated, including legacy loading-event references.

## Data and actions

The calendar retrieves all advertised order pages, raw loading-day records and events for the visible date range. If a source fails, it marks the schedule incomplete and offers Retry. A failed request is not presented as an empty day. Civil dates are preserved without UTC date shifts.

The agenda's scheduled-order count reflects order loading dates. It is shown separately from the daily capacity setting; it does not claim to be the server's confirmed slot usage. The server checks confirmed event links, capacity, production readiness and quality before accepting an assignment.

RD, Boss and Head of Production users can create loading days and assign eligible orders. Removal is offered only for `READY_TO_LOAD` assignments, matching the existing server operation. Failed writes keep the relevant dialog open with an error. Other users can inspect the calendar and agenda.

Calendar badges do not create phone messages. The separately prepared Telegram channel forwards supported workflow notifications after deployment configuration and individual user opt-in. See [Telegram phone notifications](telegram-notifications.md) for activation and its supported events.

## Shared badges throughout OMS

The same semantic badge component now serves the calendar and order lists, recent orders, order details and review, workstation queues, production station boards, order cards and notification surfaces. An icon and readable localized label accompany every state; counts and date details remain available to assistive technology and tooltips. Long labels wrap in ordinary cards. Compact calendar cells retain their icon/count layout at phone widths.

Order badges derive from the authoritative lifecycle, priority and civil dates. Manual flags remain supported, but a stale manual lifecycle badge cannot override the saved lifecycle. Repeated flags are deduplicated. Unknown lifecycle values remain visible as unknown text instead of being silently labeled Draft.

| Signal | Rule |
| --- | --- |
| Lifecycle | Draft, pending review, confirmed, in production, ready to load, dispatched, archived, cancelled, voided or on hold; legacy aliases are normalized for display. |
| Priority | Urgent/high priorities are shown in compact order summaries. Workstations can show the full priority, including legacy numbered values. |
| Deadline | Overdue before today, Due today on the actual deadline, Due soon within the next three civil days. |
| Loading | Loading today, Loading scheduled, or Loading date passed. A passed loading date never claims that the order was dispatched. |
| Exceptions | Explicit blocked, rework and low-stock flags; R&D designation. |
| Notifications | Order, message, inventory or system category, with explicit read/unread state and specific rework/low-stock indicators. |

Dispatched, archived, completed, cancelled, rejected and voided work does not show active priority, deadline or loading alarms. R&D remains useful historical context. Date signals update across midnight and when returning to the browser.

The order-list data adapter preserves the record UUID separately from the visible PO number, retains lifecycle and priority, and reads every advertised page before replacing the list. A later-page error keeps the last complete list and exposes a refresh error. Account changes cancel stale loads and clear the previous account's rows. Active/completed filters now use lifecycle rather than treating every non-draft as active.

Implementation: `src/lib/badges/catalog.ts`, `SemanticBadge.svelte`, `OrderBadges.svelte`, and `src/lib/order/order-list-data.ts`. Badge rules are presentation logic and are never used to authorize workflow transitions.
