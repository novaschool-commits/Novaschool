# Setup, tests, migrations and deployment readiness

All commands below are for Termux on Android. Nothing here touches the live
site unless a step says so explicitly.

## 1. Install the release candidate in a separate folder

```bash
cd ~ && rm -rf nova-rc && mkdir nova-rc && cd nova-rc
unzip -q ~/storage/downloads/nova-school-app.zip
cd nova-school-app
sha256sum -c CHECKSUMS.sha256 | grep -v ': OK' ; echo "checksum check done"
npm install
```

## 2. Unit tests (no database needed)

```bash
npm test
```
Expected: 33 tests, 0 failures.

## 3. Database tests (local throwaway PostgreSQL)

```bash
pkg install postgresql
initdb ~/pgtest && pg_ctl -D ~/pgtest -l ~/pgtest/log start
TEST_PG="postgresql://$(whoami)@localhost:5432/postgres" npm run test:db
```
Expected: 14 steps PASS. The script creates and deletes its own database and refuses any non-local server.

## 4. API tests (local server on a disposable database)

```bash
createdb nova_api_test
export DATABASE_URL="postgresql://$(whoami)@localhost:5432/nova_api_test"
export JWT_SECRET="$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")"
SEED_DEMO=true npm start            # first start: schema + demo data, then it asks for migrations
MIGRATION_DATABASE_URL="$DATABASE_URL" npm run migrate -- --yes
nohup npm start > ~/nova-api-test.log 2>&1 &
sleep 5
BASE_URL=http://localhost:3000 npm run test:api
```
Expected: all tests pass (one may be skipped if the demo teacher does not teach the demo student's section). Stop the server afterwards with `pkill -f "node server.js"` and drop the database with `dropdb nova_api_test`.

Never point these tests at the live database or the `redesign-test` branch: they create accounts and suspend them.

## 4b. Two-school isolation test (row-level security ON)

```bash
TEST_PG="postgresql://$(whoami)@localhost:5432/postgres" bash tests/api/run-tenancy.sh
```
Builds a throwaway database with the demo school and a synthetic second school, applies every migration including the
gated row-level security ones, runs the server as a restricted `nova_app` login and runs the cross-school tests plus the
whole security suite. Expected: 25 pass. Everything is deleted afterwards.

## 5. Browser test (optional, needs Python + Playwright)

```bash
python3 tests/browser/xss_regression.py public
```

## 6. Migrations

- `npm run migrate:status` lists applied, pending and gated files.
- `npm run migrate -- --dry-run` shows what would run.
- `npm run migrate -- --yes` applies 0001–0003. 0004 (row-level security) is skipped unless `ALLOW_RLS_ENFORCEMENT=true`, which must stay off until the app sets a school context on every request.
- `npm run migrate -- --rollback 0003 --yes` runs a rollback (latest first).

## 7. Deployment readiness checklist (all must be true before any live deploy)

1. All of steps 2–4 pass on your phone, and you have read `docs/RELEASE-GATE-REPORT.md`.
2. Render has `JWT_SECRET` of 32+ random characters (the server now refuses to start without it). Check in Render → Environment before deploying.
3. Render does **not** have `SEED_DEMO=true`.
4. A Neon backup point exists: create a branch of production named `before-rc1` right before deploying.
5. The 6 demo accounts on the live database are removed or their passwords rotated.
6. Migrations 0001–0003 are run against production only after 1–5, by you, with `--yes`, from a separate step after the code deploy, and only after a successful run on a fresh Neon branch copied from production.
7. After deploy: sign in as each role, submit one test admission with a real photo, and confirm `/api/health` shows `{"status":"ok"}`.
