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
