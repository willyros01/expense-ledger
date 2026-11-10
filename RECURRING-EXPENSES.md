# Expense Ledger — recurring expenses (build v18)

Authorized 2026-11-10. Expense Ledger only; SpendRecorder remains unchanged.

## Use

On **New** or **Edit**, tick **Recurring expense** below Comments. Choose Every
day, Every week, Every 2 weeks, Every month, Every 3 months, Every year, or
Custom. Custom shows **Repeat every** (whole number 1–999) and Days / Weeks /
Months / Years. Save the expense normally. Its Date anchors the schedule.

Recurring expenses are posted automatically while the app is open and visible,
on opening/resuming, and when the cloud connection returns. All missed dates
are caught up, with one recorded expense per scheduled date. There is no review
panel, confirmation button or manual posting step. While the app is fully
closed, posting waits until it next opens; no server scheduler is introduced.

Each posted expense can be edited normally. Editing a posted occurrence changes
that record only. Edit the original recurring expense to change future amounts
or frequency. Untick recurring and save to stop future posting; recorded
expenses remain. Deleting the original also removes its schedule (the existing
Undo remains available). Deleting a posted occurrence does not make its date
due again. Receipt photos are not copied to future expenses.

Dates on the 29th–31st use the last day of shorter months, returning to the
original day in later months. Yearly February 29 behaves similarly. The device's
local calendar determines which dates are due. The app checks once a minute
while visible, as well as on resume/focus/connection changes.

## Storage and duplicate prevention

The original expense document contains `recurrence`: enabled, unit, every,
anchor, lastDate and nextDate. Existing entries need no migration. Automatically
posted entries use deterministic IDs `repeat-<original-id>-<scheduled-date>` and
store recurrenceId, scheduledDate and autoPosted. Existing v16/v17 schedules are
used directly; already-processed dates are not posted again.

Cloud posting reads the authoritative original and occurrence in one Firestore
transaction, then writes the new expense and advances the schedule together.
Concurrent devices, resume events and transaction retries cannot post the same
date twice. If an imported stale schedule points to an existing occurrence, the
pointer advances without overwriting that expense. A changed currency causes
another rate lookup before posting. Amounts and future defaults come from the
current original document. Ordinary status/vendor/category updates preserve the
server's current recurrence progress.

Local-only posting reads and writes the complete committed snapshot inside a
browser-wide Web Lock when supported. A failed storage write advances nothing.
Shared-cloud posting pauses while disconnected or in manual Work offline mode,
and catches up when online shared storage resumes. Local-only installations
can post without connectivity. No pending user form is overwritten. Posting
pauses while editing, saving, importing, merging or deleting with Undo.

Catch-up processes up to 50 dates per pass and continues automatically in small
chunks. Failures leave schedules due, show a readable message and retry
automatically. Rate lookup uses the existing dated lookup/fallback behavior,
with a 10-second bound for automatic posting; cached or placeholder rates keep
the existing History rate indicator so entries can be corrected later.

CSV, Excel and sharing exports retain scheduling identity and progress in the
**Recurring Data** column. Imports validate metadata and skip duplicate IDs.
Export all entries to back up all schedules; an export filtered to occurrences
alone cannot restore an omitted original schedule. Preserve this column when
editing exports intended for restoration.

The recurring script URL and service-worker pre-cache both use
`recurring.js?v=18` to avoid an older cached engine.

## Validation and limits

`node --test tests/*.test.cjs` covers calendar/custom cadence, cloud map ordering,
turning recurrence off, catch-up/chunking, duplicate and concurrent posting,
write failure/retry, stale currency and schedule edits, disabled/deleted
schedules, existing occurrences, preserved historical amounts and receipts,
interrupting catch-up during editing/disconnection, and export/import metadata.
Cloud transaction tests use a serialized in-memory store, not production
Firestore. No test expense is written to the live database.

Browser QA uses the real React screen with isolated local storage: opening adds
three overdue dates automatically; reopening adds no duplicates; the review
controls are absent; posted amounts remain editable; turning recurring off and
reloading preserves both that choice and the recorded history. JSX compilation,
JavaScript syntax and diff checks complete the release checks.

## Previous correction retained (build v17)

The first implementation incorrectly compared JSON insertion order for schedule
maps, causing a false "changed on another device" error. Field-order-independent
comparison remains in place, with reordered cloud-map regression tests.
Reference: https://firebase.google.com/docs/firestore/manage-data/data-types
