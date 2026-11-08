#!/usr/bin/env bash
# Tenant isolation through the HTTP API with row-level security ON (Phase P3).
# Builds a THROWAWAY database on a LOCAL PostgreSQL server only:
#   demo school A + synthetic school B, all migrations incl. the gated ones,
#   then runs the server as a login role inside nova_app (cannot bypass
#   row-level security) and runs tests/api/tenancy.test.js and the whole
#   security suite against it. Everything is deleted afterwards.
#
#   TEST_PG="postgresql://$(whoami)@localhost:5432/postgres" bash tests/api/run-tenancy.sh
set -uo pipefail
cd "$(dirname "$0")/../.."

TEST_PG="${TEST_PG:-postgresql://$(whoami)@localhost:5432/postgres}"
case "$TEST_PG" in
  *@localhost*|*@127.0.0.1*) ;;
  *) echo "Refusing: TEST_PG must point at a local server." >&2; exit 2 ;;
esac
PORT="${TENANCY_PORT:-3003}"
DB="nova_tenancy_$(date +%s)"
ROLE="nova_app_test_$$"
base="${TEST_PG%/*}"
OWNER_URL="$base/$DB"
hostpart="${base#postgresql://}"; hostpart="${hostpart#*@}"
APP_URL="postgresql://$ROLE:apptestpw@$hostpart/$DB"
LOG="${TMPDIR:-/tmp}/nova-tenancy-server.log"
export PGOPTIONS="-c client_min_messages=warning"
SECRET="$(node -e "console.log(require('crypto').randomBytes(30).toString('base64url'))")"
SERVER_PID=""

cleanup() {
  [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null; [ -n "${MOCK_PID:-}" ] && kill "$MOCK_PID" 2>/dev/null; sleep 1
  psql -X -q "$TEST_PG" -c "DROP DATABASE IF EXISTS $DB" >/dev/null 2>&1
  psql -X -q "$TEST_PG" -c "DROP ROLE IF EXISTS $ROLE" >/dev/null 2>&1
}
trap cleanup EXIT
fail() { echo "FAILED: $1"; exit 1; }

psql -X -q "$TEST_PG" -c "CREATE DATABASE $DB" >/dev/null || fail "create database"

echo "1. legacy schema, catalogs and demo school A (as owner)"
DATABASE_URL="$OWNER_URL" node -e "
  const db = require('./db');
  (async () => {
    await db.migrate();
    await require('./db/seed-permissions').seedPermissions();
    await require('./db/seed-lab').seedLabExperiments();
    await require('./db/seed').seed({ force: false });
    await db.pool.end();
  })().catch(e => { console.error(e.message); process.exit(1); });" >/dev/null || fail "schema and demo data"

echo "2. migrations 0001-0006 including row-level security (as owner)"
MIGRATION_DATABASE_URL="$OWNER_URL" ALLOW_RLS_ENFORCEMENT=true node db/migrate.js --yes | grep -E "applied|skipped|rror" || fail "migrations"

echo "3. synthetic school B"
psql -X -q -v ON_ERROR_STOP=1 "$OWNER_URL" -f tests/api/fixtures_school_b.sql >/dev/null || fail "school B fixture"

echo "4. app login role inside nova_app (no BYPASSRLS)"
psql -X -q -v ON_ERROR_STOP=1 "$OWNER_URL" -c "CREATE ROLE $ROLE LOGIN PASSWORD 'apptestpw' NOSUPERUSER NOBYPASSRLS IN ROLE nova_app" >/dev/null || fail "app role"
bypass=$(psql -X -At "$OWNER_URL" -c "SELECT rolbypassrls OR rolsuper FROM pg_roles WHERE rolname = '$ROLE'")
[ "$bypass" = "f" ] || fail "app role can bypass row-level security"

echo "5. server as the app role on port $PORT"
# A stand-in for GitHub serves the textbook fixtures (tests/fixtures/curriculum).
MOCK_PORT="${MOCK_GITHUB_PORT:-3013}"; MOCK_TOKEN="mock-$$"
node tests/fixtures/mock-github.js "$MOCK_PORT" "$MOCK_TOKEN" > /dev/null 2>&1 &
MOCK_PID=$!
CURRICULUM_TOKEN="$MOCK_TOKEN" CURRICULUM_API_BASE="http://127.0.0.1:$MOCK_PORT" \
DATABASE_URL="$APP_URL" JWT_SECRET="$SECRET" PORT="$PORT" MIGRATE_ON_START=false node server.js > "$LOG" 2>&1 &
SERVER_PID=$!
for i in $(seq 1 30); do curl -s "localhost:$PORT/api/health" | grep -q ok && break; sleep 1; done
curl -s "localhost:$PORT/api/health" | grep -q ok || { tail -20 "$LOG"; fail "server did not start"; }

echo "6. tests"
# One file at a time: the security suite signs the demo teacher out on purpose.
TENANCY_TEST=true BASE_URL="http://localhost:$PORT" node --test --test-concurrency=1 tests/api/tenancy.test.js tests/api/security.test.js
status=$?
grep -E "used after the request|commit failed|row-level security" "$LOG" | head -5
exit $status
