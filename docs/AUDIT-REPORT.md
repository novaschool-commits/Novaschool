# Baseline security audit and remediation matrix

- **Audited baseline:** GitHub `main` at commit `7eca459` (live code), plus the unreviewed redesign working copy built on it (local commit `0fcea76` in the release-candidate branch).
- **Method:** static review of all server code, schema and the frontend's data-rendering paths; database tests on a throwaway local PostgreSQL 16; browser tests with headless Chromium; unit tests with Node's built-in runner.
- **Not possible here:** starting the server or running API tests (package downloads are blocked in the audit environment), `npm audit`, anything against live or shared databases.

## How to read the status column

| Status | Meaning |
| --- | --- |
| VERIFIED FIXED | Patched, and a test that exercises the fix **ran here and passed** (plus, where useful, the same test failed on the old code) |
| PATCHED, NOT RUN | Patched; the verifying API test is written but could not run here. Not counted as fixed until it passes in Termux |
| OPEN | Not fixed in this release candidate |

## Findings, most severe first

| ID | Severity | Finding | Files (baseline) | Reproduction (safe) | Remediation in RC1 | Regression test | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| S1 | Critical | Unauthenticated stored XSS: public form `photo_base64` placed unescaped in `<img src>` on admin screens; can steal the admin token from `localStorage` | `routes/common.js` 117, 155; `public/index.html` 3059, 6891, 6925 | `tests/browser/xss_regression.py` against the old `public/`: 4 injected handlers fired | Server accepts only real JPEG/PNG/WebP (magic bytes, strict base64, size cap) and real PDF/Word/image documents; page renders photos through `safeImageSrc` | `tests/unit/validate.test.js`; `tests/browser/xss_regression.py`; `tests/api/security.test.js` (S1 cases) | VERIFIED FIXED for rendering and validation logic; route wiring PATCHED, NOT RUN |
| N1 | High | Stored XSS from any signed-in user: message bodies shown unescaped in admin "Communications oversight" | `public/index.html` (admin messages list) | Same browser test: message body with an `<img onerror>` | Escaped | `tests/browser/xss_regression.py` | VERIFIED FIXED |
| S2 | High | No sign-in rate limit; unlimited password guessing | `routes/auth.js` 33–82 | 9 wrong passwords in a row are all answered 401 | 8 tries per email per IP and 300 per IP per 15 minutes, 429 with Retry-After; constant-time path for unknown emails | `tests/unit/rateLimit.test.js`; API S2 case | Limiter VERIFIED; route PATCHED, NOT RUN |
| S3 | High | Public forms unlimited (6 MB each, stored in rows); failed-login table grows forever | `routes/common.js`; `routes/auth.js` | Repeated public posts all accepted | 5 applications and 10 test submissions per IP per hour; strict size caps; old failed-login rows pruned; index added | `tests/unit/rateLimit.test.js`; API S3 case | Limiter VERIFIED; route PATCHED, NOT RUN |
| S4 | High | Suspension and password change did not end sessions (12 h); WebSocket ignored revocation; tokens without a version accepted | `middleware/auth.js`; `routes/admin.js` 392, 444, 485; `routes/auth.js` 95; `ws/whiteboard.js` 77 | Sign in, suspend, call `/auth/me`: still 200 | `verifySession` re-checks version, role and status on every request and socket join; suspension and password change increase `token_version`; algorithm pinned to HS256 | Source guard; API S4 cases (suspend, password change, forged token, WebSocket) | PATCHED, NOT RUN |
| S5 | High | Normal start created demo accounts (`password123`) on an empty database; `npm run seed` deleted data with `--force` and had no guard | `server.js`; `db/seed.js` | Start on an empty database: 6 demo logins appear | Demo data only with `SEED_DEMO=true`, never in production; seed script refuses without that flag or when production is detected | `tests/unit/config.test.js` (ran); source guard | VERIFIED FIXED (configuration); seed-script guard PATCHED, NOT RUN |
| S6 | High (conditional) | Missing `JWT_SECRET` fell back to a published constant | `middleware/auth.js` 4 | n/a on live (UNKNOWN whether set) | Production refuses to start without a 32+ character secret; development uses a random per-run secret | `tests/unit/config.test.js` | VERIFIED FIXED |
| S7 | Medium | Teachers could set homework, start live classes and assign labs in sections they don't teach, then see those students' work | `routes/teacher.js` 96, 681; `routes/lab.js` 802 | API S7 case | One `teachesSection` check (timetable or class teacher) on all three | Source guard; API S7 case | PATCHED, NOT RUN |
| N2 | Medium | Other database text placed in page HTML unescaped (names, test questions and options, section codes, terms, dates); teacher-entered links allowed `javascript:` | `public/index.html` (about 70 places) | Browser: question text with `<img onerror>` | 76 interpolations escaped; links pass through `safeUrl` (http/https only) | Browser test covers admin lists; others by review | PATCHED; partly VERIFIED |
| N3 | Medium | Database strings placed inside inline `onclick` JavaScript (teacher name, section code, email) | `public/index.html` | Name containing `"` breaks out | `jsArg()` JSON-encodes and attribute-escapes | Browser smoke check of `jsArg` | VERIFIED (helper); call sites by review |
| S8 | Medium | Public entrance tests re-takeable for any application number; scores overwritten | `routes/common.js` 142, 177 | Submit twice: both accepted | One-time 48-character token issued with the application, compared in constant time, cleared on use | API S8 case | PATCHED, NOT RUN |
| S9 | Medium | Test time limit not enforced on the server | `routes/student.js` 309 | Submit long after the limit: accepted | Refused after start + duration + 5 minutes; attempt closed for the teacher to review | none automated yet | PATCHED, NOT RUN |
| S10 | Medium | Any staff member with `settings.view` could read private messages | `routes/admin.js` 233 | Staff role with only `settings.view` | New `messages.oversee` permission (admins only by default); every view audited | API S10 case | PATCHED, NOT RUN |
| S11 | Medium | WebSocket messages had no size limit; any snapshot text stored | `ws/whiteboard.js` | n/a | 2 MB message cap; only real PNG data URLs stored | `tests/unit/validate.test.js` (snapshot check) | Validation VERIFIED; socket PATCHED, NOT RUN |
| BUG-1 | Medium | Auto-marked tests never reached the gradebook (subject not loaded; NOT NULL failure) | `routes/student.js` 364 | Reproduced in SQL: `tests/` evidence A1 | Load `title, subject` | Source guard; API case | PATCHED, NOT RUN |
| N4 | Medium | Startup schema would crash the server once a school column is required (found by the new tests) | `db/schema.sql` (`school_settings` insert) | `tests/db/run.sh` step 11 failed before the fix | Insert only when missing | `tests/db/run.sh` step 11 | VERIFIED FIXED |
| S12 | Low | Public health check showed student count and raw database errors | `server.js` | `curl /api/health` | Returns only `{status}` | API case | PATCHED, NOT RUN |
| S13 | Low | No security headers; CORS open to every site | `server.js` | Response headers | nosniff, frame DENY, referrer, permissions, COOP, HSTS in production; CORS only for `ALLOWED_ORIGINS` | API cases | PATCHED, NOT RUN |
| S14 | Low | Account creation not transactional (orphan logins on failure) | `routes/admin.js` 369–455 | n/a | `withTransaction` for teacher, student and parent creation; parent's student link validated | none | PATCHED, NOT RUN |
| S15 | Low | Database TLS certificate not verified | `db/index.js` | n/a | Now switchable (`PGSSL_REJECT_UNAUTHORIZED`), default unchanged until tested on Neon | none | OPEN |
| S16 | Unknown | Dependency vulnerabilities (your earlier `npm install` reported 1 critical) | `package-lock.json` | `npm audit` | Not possible here | none | OPEN (BLOCKED) |
| R1 | Medium | Login token kept in `localStorage`, so any future XSS can steal it; no Content-Security-Policy (inline scripts) | `public/index.html` | n/a | Not changed in RC1 (needs moving inline scripts to files) | none | OPEN |
| R2 | Medium | No screen creates attendance or invoices; dashboard figures come from demo data | routes (no writer) | grep evidence | Not changed in RC1 | none | OPEN |
| R3 | Low | Rate limits are per process (fine for one Render instance) | `lib/rateLimit.js` | n/a | Documented | none | OPEN (accepted for now) |

## Checked and not found

- SQL injection: every query uses parameters; identifiers built into SQL come from fixed lists (re-checked, including new code).
- CSRF: sessions use an Authorization header, not cookies.
- Parent access to other families' children: blocked on every parent route.
- Lab scoring tampering: state is derived on the server from each event.

## Correction to the earlier review document

The earlier architecture review said the schema has 51 tables. A database
built from it actually has **57** (confirmed with `information_schema` on a
throwaway database). The ownership mapping covered all 57; only the count
was wrong: 49 school-owned, 5 shared catalogs, 3 global.
