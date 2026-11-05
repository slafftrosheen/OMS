# Cabinet entry guidance and production note index

This pass builds on the clock-entry and shared production-sheet release. It does not change payroll policy, permissions, database tables, reporting schedules or chat retention. No additional migration is needed; the existing workforce clock migration must already be installed.

## Daily time entry

The ordinary cabinet still has two monthly cards. The daily form now explains what is needed to enable Save: start time, finish time, valid interval, a note within the length limit, or an actual change to the saved entry. Future dates, full-day absences, loading and in-flight operations have distinct guidance. Copy is available in English, Latvian and Russian.

For a new, untouched day, **Reuse previous shift** shows the source date and exact clock boundaries before the user clicks. It searches the earlier entries already loaded for that user's selected work month. It does not fetch all historical months or promise a suggestion on the first day of a new month. Historical duration-only records are never assigned invented times. Source and target intervals are validated with the existing Riga clock resolver, including missing/repeated DST boundaries.

Reuse copies only start and finish, not notes, actual minutes, credited minutes or pay multipliers. The selected date's preview and existing server save recalculate the result. The action is unavailable while loading/saving, on future/full-absence days, for an existing record, or after the user has typed a draft. Clicking it never saves.

**Discard edits** explicitly restores the selected day's saved times and note (or clears a new draft), then focuses start time. It does not delete a database entry. Saving remains explicit and version-checked. Existing one-same-day-interval and no-automatic-break-deduction behavior remains unchanged.

## Shared production sheet

Read-only sheets identify themselves without presenting the label as an approval decision. Existing edit/approval permissions remain authoritative.

Orders with multiple profiles and any instructions show a collapsed **Profiles with notes** index. Opening it lists only affected profiles and the sections containing instructions. It does not duplicate the actual note text. A button focuses the corresponding profile heading; the existing station warning controls and full notes remain inside that profile. The generic profile-note button now scrolls/focuses locally instead of changing the URL fragment, avoiding unintended draft-navigation prompts.

Free section notes count even when no material part is enabled. Material-specific custom annotations count only for enabled parts, matching `Profile7stVisual.svelte`. Empty/whitespace, malformed and disabled annotations do not produce warnings. A section is listed once even with multiple instructions. If the native form's annotation fields change, update `profile-attention.ts` and its regression fixtures together.

The same component is used by the order reader, editor and station packet. English/Latvian/Russian copy, existing theme tokens, keyboard focus and wrapping styles are retained. The new navigation introduces no automatic changes to order data.

## Verification

Run the dependency-light behavior suite from the repository root after installing the existing development dependencies:

```sh
node --test tests/regression/production-polish.test.cjs
```

The suite loads the actual pure TypeScript modules using the project's TypeScript development dependency. It covers ownership/date isolation, malformed/legacy intervals, DST checks, reuse eligibility, restoring a draft, next-action states, note grouping, localization parity, and source-level wiring of the two components. Source-wiring assertions are not browser interaction tests.

Before production rollout also run the normal project gates:

```sh
npm run test
npm run test:unit
npm run check
npm run build
```

Smoke-check a blank day, typed draft, existing clock entry, legacy hours-only record, full-day absence, and a multi-profile order containing enabled and disabled custom notes. Check keyboard focus and the compact index on a phone in the supported themes.

Authoring verification: 39 focused tests and strict TypeScript checking of the new pure modules passed. Full Svelte diagnostics, production build and browser execution were not available in the source-subset environment used for this pass; they are not claimed as completed. Production deployment remains manual.
