# Release-gate report: NovaSchool RC1

**Verdict: RELEASE CANDIDATE ONLY. Not production-ready.** Several gates are
BLOCKED or NOT TESTED because the server could not be started in the build
environment. No deployment, production validation or live-database change
took place, and none was authorized.

- Baseline audited: `7eca459` (GitHub `main`), plus the unreviewed redesign working copy (`0fcea76`, local).
- Release-candidate branch: `rc/foundation-1` (local only, never pushed).
- Test environment: Node 22.22.0; PostgreSQL 16.15 throwaway local cluster; headless Chromium via Playwright. Synthetic data only.
- Evidence files: `docs/test-results/`.

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
| G14 | Server starts with the new code | BLOCKED | Package downloads blocked (`npm` registry denied by the environment's policy) |
| G15 | API security tests (`tests/api/security.test.js`: 14 cases) | NOT TESTED | Needs G14; run in Termux per `SETUP-AND-TESTING.md` §4 |
| G16 | WebSocket revocation and size limit | NOT TESTED | Needs G14 |
| G17 | Migration runner `db/migrate.js` itself (status, dry run, lock, checksums, rollback order) | NOT TESTED | Needs the `pg` package; the same SQL files were applied by `tests/db/run.sh` |
| G18 | `npm audit` dependency scan | BLOCKED | Registry unavailable |
| G19 | Clean `npm install` from the lockfile | NOT TESTED | Registry unavailable; `package.json` dependencies unchanged |
| G20 | Tenant isolation through the HTTP API, files, exports and background jobs | NOT TESTED | Routes are not wired to school context yet (Phase P3); there are no background jobs |
| G21 | Production configuration, secrets, database roles, backups, monitoring | NOT TESTED | Requires a separate, authorized review |
| G22 | Package opens and matches its checksums | PASS | verified after packaging (see final message) |

## Security findings: closed and open

- **Verified closed by an executed test:** S1 rendering and validation, N1, S6, N4, S5 configuration, S11 snapshot validation, N3 helper.
- **Patched, waiting for the API tests (G15):** S1 route wiring, S2, S3, S4, S5 seed-script guard, S7, S8, S9, S10, S11 socket limit, S12, S13, S14, BUG-1.
- **Still open:** S15 (TLS certificate check), S16 (dependency audit), R1 (token in localStorage, no CSP), R2 (no attendance or invoice creation), R3 (per-process rate limits), full manual review of remaining HTML-building sites.

## Remaining-risk register

| ID | Risk | Likelihood | Impact | Owner action |
| --- | --- | --- | --- | --- |
| R-01 | A route-level fix behaves differently once run (G15 not yet run) | Medium | High | Run `npm run test:api` in Termux before any deploy |
| R-02 | Live `JWT_SECRET` shorter than 32 characters: the new server will refuse to start on Render | Medium | High (outage) | Check Render → Environment before deploying |
| R-03 | Demo accounts with `password123` still on the live database | Unknown | Critical | Remove or rotate after deploy |
| R-04 | Someone enables `ALLOW_RLS_ENFORCEMENT` before Phase P3 | Low | High (all data hidden) | Keep it false; gate 3 in the roadmap |
| R-05 | Render uses more than one proxy hop (rate limits shared by all users) | Unknown | Medium | Check `req.ip` in logs after deploy; set `TRUST_PROXY_HOPS` |
| R-06 | Remaining unescaped HTML sinks in the 7,900-line page | Medium | High | Finish the manual review; move to CSP |
| R-07 | Dependency vulnerability (`npm audit` reported 1 critical earlier) | Unknown | Unknown | Run `npm audit` and send the output |
| R-08 | Database TLS not verified | Low | Medium | Test `PGSSL_REJECT_UNAUTHORIZED=true` on a Neon branch |
| R-09 | Neon's owner role may lack BYPASSRLS, needed for migrations once 0004 is on | Unknown | Medium | Check on a Neon branch before Phase P3 |
| R-10 | `redesign-test` branch connection string was shared in chat | Known | Medium | Delete that Neon branch |

## Production approval needs, separately

A review of: Render environment and secrets, database roles and grants on
Neon, a tested backup and restore, monitoring and alerts, the migration and
rollback run on a copy of production, and the API test results from G15.
