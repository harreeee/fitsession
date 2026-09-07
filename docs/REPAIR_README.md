# FXA core and booking repair - 2026-09-07

## Status
Application source changes are in this package. They have NOT been pushed to the connected GitHub repair branch and have NOT been deployed. No production Supabase migration was applied.

Base application: harreeee/fitsession main 5702a2c9b3b6738752c8265301970eb4008f5bbc.
The existing remote branch repair/core-booking-20260907 contains the earlier environment-preparation commits, not this application patch.

## Implemented
- QR is a read-only preview until Save & Finish. Deduction, history and required Topic/Content commit in one database transaction. An idempotency key makes save retries safe. Session-storage drafts survive reloads within the same browser tab.
- Camera start mutex, cancellation generation and a stable aspect-ratio frame prevent overlapping starts and late permission responses reviving a stopped camera. Actual device-camera verification remains pending.
- Client creation and renewal write client/package/purchase/initial income atomically. Debt payments and corrections are transactional. Payment states use the real database enum: paid, partial, pending/confirmed as appropriate.
- Client basic-info API verifies permission and the returned row. Staff direct updates are restricted to notes by a database trigger.
- Session history views read Topic + Content + distinct Coach Note without changing their existing presentation containers.
- Active package selection is consistent. Client list debt totals include all non-failed/non-cancelled purchase rows rather than one arbitrary debt.
- Revenue ledger pagination no longer silently stops at 1,000 transactions. Account balances use a full database aggregate. Edits notify the main Revenue view to refresh.
- Toronto dates and reporting-month boundaries are consistent. Marketing loads ignore stale out-of-order responses. Marketing manager lead editing and database policies are aligned; conversion remains restricted to admin/manager.
- Booking: PT weekly windows, one-time blocks, Google free/busy validation, primary PT first, PT-only provider list, client and admin-on-behalf booking, upcoming views, server-side 8-hour cancellation, session reservations, and database locks.
- Google sync: database reservation first, short-lived server-issued slot grant, deterministic event IDs, leased retries, safe cancellation, legacy-event verification, Google error fail-closed behavior.
- OAuth: authenticated POST instead of a token in a URL; browser-bound, one-use, 10-minute state; retained refresh token; connection secrets hidden from authenticated direct reads.

## Actual verification
- 67 automated checks passed: 18 pure logic/pagination tests, 39 SQL integration checks, 10 Google-mock checks.
- 15 real Next.js HTTP -> isolated database integration checks passed.
- TypeScript passed.
- New Booking code scoped ESLint passed. Scanner has no lint errors and 10 warnings. Existing non-Booking core lint findings remain documented; repository-wide lint is NOT certified clean.
- Next.js optimized build passed with test-only Google-font CSS mocks because outbound font fetching is unavailable in the local environment. The application font imports themselves were not changed.
- AST comparison found unchanged className attributes in 10 existing pages/components. This is source-level preservation, not pixel-level visual certification.
- Browser navigation was attempted with agent-browser. The container's managed Chromium blocked localhost with net::ERR_BLOCKED_BY_ADMINISTRATOR. No successful browser or real-device camera test is claimed.

## Important limits / release gates
1. The SQL fixture is a simplified compatibility schema derived from inspected production columns and the record_staff_session contract. It is NOT a full production backup. Live Supabase RLS, Storage, Auth and all historical data have not been end-to-end tested with this migration.
2. Google tests use a mock. Actual OAuth consent, real free/busy calendars and email invitation delivery remain unverified.
3. PGlite uses a single local database session. Collision and retry rules were executed, but a multi-connection PostgreSQL race test remains required.
4. Google sync is attempted immediately, retried on page visits and manually from PT schedule. An independent scheduled reconciliation worker is not configured. A persistent Google outage may leave invitations/cancellations pending until retry.
5. New payment receipts have no invented bank/cash account assignment. Where the existing form does not identify an account, the ledger receipt remains unallocated. Do not mistake the income total for a reconciled bank balance. No historical payments were backfilled or silently corrected.
6. Existing financial numeric-correction procedures outside this patch and legacy data need separate reconciliation before financial certification.
7. The migration revokes direct access to the old charge-first scanner RPC and tightens writes. Apply it only with the matching application version in staging first. Plan coordinated production rollout and staff browser refresh; applying it alone to the live old app can interrupt old scanner clients.
8. Public/private session-review features were not added in this repair.

## Reproduce locally (Node 22)
```sh
npm ci
npm ci --prefix tests --ignore-scripts
npm run test:repair
npm run typecheck
node tests/run-isolated.cjs
```
The isolated runner forces synthetic credentials and local URLs, starts a disposable database fixture and a local Next.js server, then closes them. It does not deploy or write to production.
For an offline environment only:
```sh
FXA_OFFLINE_FONTS=1 node tests/run-isolated.cjs
```
The checked-in CI workflow runs the same isolated suite without font mocks on the repair branch and does not contain deployment steps. That new workflow is supplied, not executed remotely in this session.

## Apply
Use a clean, non-production local branch and apply the supplied patch, or use the guarded installer with its manifest. The installer defaults to dry-run and refuses main/master. Review the complete diff and migration before testing on staging.
Do not use the older incomplete booking audit package.
