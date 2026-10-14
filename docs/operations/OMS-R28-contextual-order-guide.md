# OMS-R28 — Order workflow tips, helpers and contextual assistant UX

A small, persistent **Order Guide** is now included in both the New Order
the saved-order editor and the order-detail overview. This is intentionally
a **UX-only** batch:
no migration, no additional provider request, and no order write outside
the existing human-controlled Save Draft workflow.

## Interaction design

The compact guide highlights the **current section** and the **next suggested
step**; staff can expand it to inspect four workflow steps, or minimize it
to reclaim workspace space. The design uses small buttons, inline text and
existing theme tokens, with mobile stacking and no blocking walkthrough.

The steps are:
- **Order brief:** Client name and due date are present. Title, delivery,
  measurements and notes still need human verification.
- **Production profiles:** A quantity/profile row exists. Missing template
  assignments are shown as **check**, not a hard validation failure.
- **Customer files:** No files, some files, or unknown count are separate
  states. New Order's locally selected files are explicitly described as
  *not yet uploaded*; saved-order count says nothing about readable content.
- **Review and handoff:** Always **check**; an AI answer or field count is
  not evidence of approved manufacturing readiness.

Counts mean only "basic signals present", never "N% production ready".
The steps do not write to the database, change authorization, approve orders
or bypass attachment persistence.

## Contextual assistant entry

In a saved order, **Ask about this step** takes the staff member to the
order-scoped assistant with a localized, prefilled question. It does not send
any provider request, grant consent or switch into apply mode. The user still
reviews and sends the question explicitly, with R27's consent, RBAC, rate
limits and version checks intact.

The existing chat stays mounted across workspace tabs, so a suggested
question enters the same conversation, rather than spawning a new session.
AI actions never write fields directly. Profile-step navigation scrolls to
the profile controls; other workflow links use the canonical workspace
sections. The New Order screen has **no Ask action** because it contains
unsaved customer data, and a user must first create/save the draft for the
R27 server-side assistant to have a trusted, authorized order snapshot.

Inline hints vary between Details, Files, Intake, Readiness, Canvas, Revisions,
Approvals and Assistant sections, encouraging the next specific action rather
than generic "AI can help" messaging.

The order-detail overview additionally shows **lifecycle-specific tips**:
draft, pending review, confirmed handoff, active production, loading, hold,
dispatch and archive. Users authorized for this order's R27 assistant see
a direct assistant link; all lifecycle writes still use existing dedicated
workflow controls. Operators do not receive an unauthorized assistant shortcut.

## Language and accessibility

Every guide heading, signal, explanation, action and suggested assistant
question has dedicated EN/RU/LV copy. Buttons are native keyboard controls;
the guide uses expanded state, descriptive labels, visible status text and
no reliance on color alone. On narrow screens step buttons stack.

## Verification checklist

1. Run `npm run check`, `npx vitest run
   tests/unit/oms-r28-order-guidance.test.ts`, `npm run build`.
2. On New Order, change client/deadline, add/remove profiles and select/delete
   files. The guide should update immediately and should never call OpenRouter.
3. Test missing, zero and positive saved attachment counts. Unknown counts
   must remain **unknown**, never show a green file-passed state.
4. In the saved editor, switch across all eight sections. Hints change,
   while the assistant conversation remains intact when switching tabs.
5. Click "Ask about this step": chat must open with a prepared question but
   no OpenRouter call, consent grant or auto-save. The staff member then sends
   through the R27 endpoint after checking consent.
6. Test owner/manager/operator permission cases. Unauthorized users should
   not see an enabled assistant action; the server remains authoritative.
7. Test unsaved fields and stale order versions. Guide reflects local state,
   R27 assistant explicitly uses last saved order and refuses stale proposals.
8. From the order-detail overview, check lifecycle hints in DRAFT,
   PENDING_REVIEW, CONFIRMED, IN_PRODUCTION, READY_TO_LOAD, ON_HOLD,
   DISPATCHED and ARCHIVED. Operators must not receive a forbidden
   assistant shortcut.
9. Test portrait mobile, keyboard-only navigation, minimized/reopened coach,
   and RU/LV/EN language changes mid-workflow.

No deployed/browser verification or Vitest/build was run in this GitHub-only
session. These remain required before production release.
