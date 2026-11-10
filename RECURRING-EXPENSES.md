# Expense Ledger — recurring expenses (build v16)

Authorized 2026-11-10. Expense Ledger only; SpendRecorder remains unchanged.

## Use

On New or Edit, tick **Recurring expense** below Comments. Choose Daily,
Weekly, Every 2 weeks, Monthly, Every 3 months, Yearly, or Custom. Custom
shows **Repeat every** (whole number 1–999) and Days / Weeks / Months / Years.
Save the expense normally. The Date is the schedule's starting date.

Due schedules appear in History and a banner appears on New. Tap **Review &
add**, check the amount and expense date, attach that expense's receipt if
needed, and confirm. Nothing posts automatically or changes totals before
confirmation. Missed dates are reviewed individually in chronological order.
Changes made while reviewing apply only to that occurrence. Edit the original
recurring expense to change future amounts, dates or cadence. Untick recurring
and save to stop repeating; previously recorded expenses remain. Deleting the
original recurring expense also removes its schedule (the existing Undo works).
Deleting a reviewed occurrence does not make its date due again.

A monthly date on the 29th–31st uses the last available day in shorter months
and returns to the original day in later months. Yearly February 29 behaves
similarly. Local calendar dates determine when a schedule is due. No background
job or notification service is introduced.

## Storage and synchronization

The original expense document contains a `recurrence` object: enabled, unit,
every, anchor, lastDate and nextDate. Existing entries need no migration.
Reviewed entries use stable IDs `repeat-<original-id>-<scheduled-date>` and
store recurrenceId and scheduledDate. Receipts are never copied forward.

A shared-cloud confirmation uses a Firestore transaction: read the current
schedule and occurrence, verify that the expected scheduled date is still due,
then write the occurrence and advanced schedule together. Duplicate or stale
reviews fail without overwriting an already recorded expense. Schedule edits
also check that another device has not changed its progress. Shared recurring
saves require a connection; failed saves leave the form available for retry.
Manual Work offline mode does not allow reviews of shared schedules. New local
schedules can be added in that mode and merge using their record IDs. In a
local-only installation, the entire updated expense list is stored in one
localStorage write before the screen changes; failure advances nothing.

Editing the cadence calculates a next date after the latest reviewed scheduled
date, preventing replay. Switching repeating off/on with unchanged dates keeps
the saved next date; missed dates from that point remain available for review.

CSV, Excel and sharing exports retain scheduling identity and progress in a
**Recurring Data** column. Import validates this metadata and skips duplicate
record IDs. Export all entries to back up all schedules; an export filtered to
only reviewed occurrences does not contain an omitted original schedule.
Keep the metadata column intact if you intend to restore recurring schedules.

## Validation

- `node --test tests/*.test.cjs`: date arithmetic, custom validation, edit/stop,
  local/cloud commit paths, storage/write failures, duplicate/concurrent review,
  stale edit and export/import metadata round-trips.
- Cloud transaction tests use a serialized in-memory transaction store, not
  production Firestore. No test expenses were written to the live database.
- Isolated browser test using the real React screen and local-only storage:
  enable Daily in Edit; review overdue date with changed amount; check schedule
  advancement and original amount; edit to every 3 days; reload persistence;
  stop repeating while retaining history; New form controls and ordinary entry.
- JSX compilation and JavaScript syntax checks; service-worker cache bumped to
  v16 and includes recurring.js. No Firebase rules, configuration or other app
  repositories changed.

## Build v17 correction — 2026-11-10

Turning repeating off could incorrectly report that another device changed the
schedule. The edit transaction compared JSON strings, whose object field order
could differ between a local Firestore snapshot and a server map. Firestore
stores map keys in sorted order. The new comparison checks the flat map's full
key set and values independently of insertion order. Real changed, missing or
additional fields still trigger conflict protection.

A regression test first reproduced the exact reported error using differently
ordered server fields, then passed with the correction. Additional assertions
cover every schedule field, disabled state, next-date preservation, unchanged
amount/history, real stale edits and duplicate confirmations. No user expense
records are modified by the fix or its tests.
Reference: https://firebase.google.com/docs/firestore/manage-data/data-types

The recurring script URL is versioned (`recurring.js?v=17`) and the same URL is
pre-cached by the v17 service worker, avoiding an older browser-cached engine.
