# Release-gate report: NovaSchool RC1

**Verdict: RELEASE CANDIDATE ONLY. Not production-ready.** The server, API and dependency gates were run on the owner's phone on
2026-10-12; remaining NOT TESTED gates are listed below. No deployment, production validation or live-database change
took place, and none was authorized.

- Baseline audited: `7eca459` (GitHub `main`), plus the unreviewed redesign working copy (`0fcea76`, local).
- Release-candidate branch: `rc/foundation-1` (local only, never pushed).
- Test environment: Node 22.22.0; PostgreSQL 16.15 throwaway local cluster; headless Chromium via Playwright. Synthetic data only.
- Evidence files: `docs/test-results/`.

## Deployment record

- 2026-10-20, 20:51 PKT: the owner explicitly approved and pushed commit `fa9c63a` (RC1 code from the phone-tested copy, with the
  `npm audit fix` lockfile) to GitHub `main`; Render auto-deployed it to novaschool.pk.
- Before the push: Neon backup branch `before-rc1` (no auto-delete), demo logins locked, `JWT_SECRET` 40 characters,
  migrations rehearsed on a production copy.
- After deploy: the new design loads on novaschool.pk and admin sign-in shows the existing data.
- Live checks (Render address): health `{"status":"ok"}` with no count; HSTS, nosniff and frame DENY headers present;
  demo login with `password123` refused (401). The custom domain returned "connection reset" from the phone's network
  once while the Render address worked; recheck.
- 2026-10-20, 21:02 PKT: the owner ran migrations 0001–0003 on production (host `ep-lively-truth-…`); all three applied,
  0004 skipped as designed. Row-level security is NOT enabled.

## Follow-up change: parents can download a child's result card (not yet deployed)

- New `GET /api/parent/report-card/:studentId`: parent role only, child must be linked in `student_parent_map`
  (403 otherwise, 400 for a bad id). Report card logic moved unchanged from `routes/student.js` to
  `lib/reportCard.js`, shared by the student and parent routes.
- Parent dashboard: "Result card" box with overall %, grade, Download PDF and a preview.
- New API test "Parent result card: own child only" (own child 200, another family's child 403, bad id 400,
  student role 403, student's own card still 200). It needs the local server, so it runs on the owner's phone.
- Rendered with mock data at phone and desktop width, including hostile text: no errors, no handlers fired.

## Limited database login for the app (not yet deployed)

- 2026-11-07: owner ran 0007 and created `nova_app_login` on production. Its first two passwords appeared in chat and
  were rotated; the last rotation (17:08 PKT) printed no password. Render still uses the owner connection; switching
  `DATABASE_URL` is a separate, approved step (run `npm run db:app-login` again then to get a fresh string).

- Migration `0007_app_role` (ungated): role `nova_app` with data privileges only (no create/alter/drop, no bypass,
  read-only school and migration records, default privileges for future tables). `npm run db:app-login` creates the
  login `nova_app_login` (random 192-bit password, printed once, never stored) and verifies it is limited.
  `npm run db:schema` applies schema.sql and catalogs as the owner; the server skips them when it is not the owner.
- Tests (local PostgreSQL 16): `tests/api/run-app-login.sh` 11/11 (incl. security suite 15/15 on the app login);
  database tests 14/14 (rollback 0007→0001 restores the schema); two schools with the lock on 25/25; unit 36/36.

## Phase P3: school context on every request (not yet deployed)

- Code: `db/index.js` (request scope, savepoint-aware `withTransaction`), `middleware/auth.js` (membership per token),
  `routes/auth.js` (sign-in picks the school), account creation adds memberships, admin security page scoped to the
  school, whiteboard messages scoped, startup refuses to run without the multi-school tables.
- Migrations: `0005_membership_backfill` (ungated: memberships for logins made since 0002; refuses with two schools),
  `0006_users_rls` (gated: login-row security, catalogs read-only). Rollbacks provided.
- Tests: unit 36/36; database 14/14 (incl. new T13 login-row checks, rollback 0006→0001 restores the schema);
  API with the lock OFF as on live today: 15/15; API with the lock ON and two schools: 25/25; XSS browser test PASS.
- Rehearsal 2026-11-07 on Neon branch `p3-rehearsal` (copy of production): 0005 applied, 0004/0006 skipped, admin
  sign-in and overview correct. The log showed "Database used after the request finished" for requests the browser had
  abandoned (phone to Neon is slow). Fixes: such requests are now rolled back with a one-line note instead of a stack
  trace; BEGIN and the school settings go in one round trip; the session check is one query; the admin messages list
  went from up to 400 queries to 1. Re-tested: two schools 25/25, lock off 15/15, unit 36/36; with 120 ms added
  database latency the admin dashboard's 19 parallel requests all succeed and abandoned requests roll back cleanly.
- 2026-11-07, 16:04 PKT: the owner ran migration 0005 on production (host `ep-lively-truth-…`): applied; 0004 and
  0006 skipped. Additive only; the running site (commit `995606f`) is unaffected.
- 2026-11-07, 16:09 PKT: owner approved and pushed commit `10c6420` (Phase P3) to GitHub `main`; Render auto-deploys.
- 2026-11-07, 16:17 PKT: P3 live on novaschool.pk; admin sign-in, overview figures and live classes confirmed by the owner.
- Live keeps row-level security OFF. Before deploying the P3 code, migration 0005 must run on production
  (rehearse on a Neon branch first), otherwise logins created after 0002 cannot sign in.

## Second deployment

- 2026-10-20, 22:31 PKT: owner approved and pushed commit `5f3dfaa` (Option B admin, brand, result card, assignments,
  tests, live class, XSS fix N5) to GitHub `main`; Render auto-deploys it. Front-end only; no database change.

## Follow-up change: admin overview "Option B"

- Owner chose design Option B on 2026-10-20. Changed: `public/index.html` (overview markup, headline,
  approvals, sections and live-class renderers) and `public/css/nova-os.css` (new `ovb-` styles). No server change.
- Checked in a headless browser at phone (390 px) and desktop (1280 px) width with mock data; no script errors;
  hostile names, labels and section codes in approvals, sections and live classes did not run (0 handlers).
- Unit tests 33/33 and the stored-XSS browser test pass.
- Same release, second commit: brand and panels. NS monogram (cut from the owner's `assets/logo.jpg`) as transparent
  `assets/ns-mark.png` / `ns-mark-light.png`, Playfair Display "Novaschool.pk" wordmark on the public bar, footer, sign-in
  pages and every sidebar; favicon added. Public sections colour-coded; student, parent, teacher and staff dashboards get a
  navy greeting band, colour-coded summary tiles and quick-action tiles. The old gold/green logo files are kept, unused.
  Checked by rendering the public page, sign-in and all four dashboards at 390 px and 1280 px with mock data: no script errors.

## Follow-up change: result card, tests, assignments, live class

- **Security fix (N5, stored XSS, teacher views):** a student's test answer was placed in the teacher's marking
  view without escaping (two places), and subject and section names went into drop-downs unescaped. Now escaped;
  guarded by a new unit test (34/34 pass).
- **Result card:** A4 report card built from recorded marks (subject totals, %, grade A+ to F, remark, attendance,
  overall, grading scale, assessment record on page 2, remarks and signature lines). "Download PDF" opens the
  browser's print window, where Android Chrome offers "Save as PDF". Checked by producing the PDF in headless Chromium.
  Grade bands are a default (90/80/70/60/50/40) and can be changed in `RC_SCALE`.
- **Teachers:** new Assignments page (create with due date, marks, instructions and an optional file; review each
  submission's answer and file; marks with feedback). The API already existed; the screen did not. Test builder now
  uses separate option boxes with a tick for the correct answer instead of comma-separated text.
- **Students:** tests and assignments shown as cards with status and due-date hints; test screen has a sticky timer
  (amber under 5 minutes, red under 1), answered-count progress, large tap targets and a warning before submitting
  with blanks.
- **Live class:** teacher panel with section, "Open whiteboard classroom", live state; student card turns red with a
  clear Join button while a class is live.
- All screens rendered at 390 px and 1280 px with mock data, including hostile text: no script errors, no handlers fired.
  No server code changed.

## Gates

| # | Gate | Result | Evidence |
| --- | --- | --- | --- |
| G1 | JavaScript syntax of every server, test and tool file | PASS | `test-results/syntax-check.txt` (31 files) |
| G2 | Page integrity: inline script parses, no duplicate ids, balanced markup | PASS | `test-results/page-integrity.txt` (items listed there also exist in the previous version) |
| G3 | Unit tests: upload validation, rate limiter, startup config, source regression guards, lab catalog | PASS (33/33) | `test-results/unit-tests.tap` |
| G4 | Legacy schema on empty database, and re-applied (server restart) | PASS | `test-results/db-tests.txt` steps 1–2 |
| G5 | Migrations 0001–0003 apply on single-school data | PASS | step 4 |
| G6 | Backfill: no rows without a school, counts unchanged, one membership per user, orphans listed not altered, transition default works | PASS | step 5 |
| G7 | Backfill refuses to run when two schools already exist | PASS | step 14 |
| G8 | Module foundations: translation fallback serves only reviewed text, endorsement needs evidence, verified mapping needs a person, codes not wording, planned engines cannot be "available", unreviewed items cannot publish | PASS | step 6 |
| G9 | Tenant isolation as the app role (13 test groups, 36 assertions: reads, guessed IDs, file content, search, export join, updates, deletes, cross-school inserts and moves, no context, unknown school, context leak after commit and rollback, shared catalogs, multi-school member, default deny for other roles, fail-closed inserts) | PASS | step 10 |
| G10 | Negative control: weakening the policies makes G9 fail | PASS (G9 failed as expected with `USING (true)`) | run recorded during development; reproducible by editing 0004 |
| G11 | Legacy schema still re-applies after migrations and with row-level security on | PASS (after fixing N4, which this gate found) | steps 7, 11 |
| G12 | Rollback 0004→0001 restores the exact starting schema | PASS | steps 12–13 |
| G13 | Stored XSS regression in admin screens | PASS (old code fails the same test: 4 handlers fired) | `test-results/browser-xss.txt` |
| G14 | Server starts with the new code | PASS (owner's phone, 2026-10-12) | Termux, local PostgreSQL 18.6, port 3001; health returned `{"status":"ok"}` with no count |
| G15 | API security tests (`tests/api/security.test.js`: 14 cases) | PASS 14/14 (owner's phone) | Includes suspension, password change, forged tokens, teacher scope, entrance-test token, rate limits, grade fix |
| G16 | WebSocket revocation and size limit | Revocation PASS (owner's phone); size limit NOT TESTED | API case S4/S11 |
| G17 | Migration runner `db/migrate.js` itself (status, dry run, lock, checksums, rollback order) | PARTLY PASS (owner's phone, 2026-10-12): status, apply and gating ran on Neon branch `rc1-rehearsal` (copy of production); 0001–0003 applied, 0004 skipped. Dry run, lock and rollback through the runner not yet run | Termux output |
| G18 | `npm audit` dependency scan | PASS after `npm audit fix` (owner's phone): 4 findings (1 critical `proxy-addr`, 3 moderate `qs`/`body-parser`/`express`) fixed within semver; now 0 | Updated `package-lock.json` lives in the owner's copy |
| G19 | Clean `npm install` from the lockfile | PASS (owner's phone, 101 packages) | |
| G20 | Tenant isolation through the HTTP API, files, exports and WebSocket | PASS (Phase P3, local PostgreSQL 16, 2026-10-21): `tests/api/run-tenancy.sh`, two schools, app as a `nova_app` login without BYPASSRLS, all 6 migrations: 10 cross-school tests + 15 security tests = 25/25. Negative control: same tests with row-level security off and the app as owner: 8 of 10 fail (leaks detected) | No background jobs exist |
| G21 | Production configuration, secrets, database roles, backups, monitoring | NOT TESTED | Requires a separate, authorized review |
| G22 | Package opens and matches its checksums | PASS | verified after packaging (see final message) |

## Security findings: closed and open

- **Verified closed by an executed test:** S1 rendering and validation, N1, S6, N4, S5 configuration, S11 snapshot validation, N3 helper.
- **Verified closed by the API tests on the owner's phone (G15):** S1 route wiring, S2, S3, S4 (incl. WebSocket revocation), S7, S8, S10, S12, S13, BUG-1, S16 (dependencies, after `npm audit fix`).
- **Patched, no executed test yet:** S5 seed-script guard, S9 (time limit), S11 socket size limit, S14 (transactions).
- **Still open:** S15 (TLS certificate check), R1 (token in localStorage, no CSP), R2 (no attendance or invoice creation), R3 (per-process rate limits), full manual review of remaining HTML-building sites.

## Remaining-risk register

| ID | Risk | Likelihood | Impact | Owner action |
| --- | --- | --- | --- | --- |
| R-01 | Behaviour on Render differs from the phone (proxy, Postgres 16 vs 18, Neon TLS) | Low | Medium | Rehearsed 2026-10-12: RC started on Neon branch `rc1-rehearsal` (production copy, migrations 0001–0003 applied), health ok, admin sign-in and overview, sections and timetable showed existing data. Render proxy still unverified |
| R-02 | Live `JWT_SECRET` shorter than 32 characters: the new server will refuse to start on Render | Medium | High (outage) | Check Render → Environment before deploying |
| R-03 | Demo accounts with `password123` still on the live database | Closed | — | 2026-10-20: owner locked the 5 demo logins on production (random unknown passwords, data kept); all 6 accounts verified not `password123`. Rehearsed first on `rc1-rehearsal`. Neon backup branch `before-rc1` (no auto-delete) taken just before |
| R-04 | Row-level security switched on in production before the app uses a `nova_app` login and `MIGRATE_ON_START=false` | Low | High (startup or all data fails) | P3 code is ready; enabling on Neon is a separate, approved step |
| R-05 | Render uses more than one proxy hop (rate limits shared by all users) | Unknown | Medium | Check `req.ip` in logs after deploy; set `TRUST_PROXY_HOPS` |
| R-06 | Remaining unescaped HTML sinks in the 7,900-line page | Medium | High | Finish the manual review; move to CSP |
| R-07 | Updated lockfile exists only on the owner's phone | Medium | Medium | Commit the phone copy's `package-lock.json` with the release |
| R-08 | Database TLS not verified | Low | Medium | Test `PGSSL_REJECT_UNAUTHORIZED=true` on a Neon branch |
| R-09 | Neon's owner role may lack BYPASSRLS, needed for migrations once 0004 is on | Unknown | Medium | Check on a Neon branch before switching the lock on (the app itself now has its own limited login) |
| R-10 | `redesign-test` branch connection string was shared in chat | Closed | — | Branch no longer exists in Neon (confirmed 2026-10-12) |

## Production approval needs, separately

A review of: Render environment and secrets, database roles and grants on
Neon, a tested backup and restore, monitoring and alerts, the migration and
rollback run on a copy of production, and the API test results from G15.
