#!/usr/bin/env bash
# The app on its own limited database login (migration 0007), lock OFF, as on
# the live site. THROWAWAY database on a LOCAL PostgreSQL server only.
#   TEST_PG="postgresql://$(whoami)@localhost:5432/postgres" bash tests/api/run-app-login.sh
set -uo pipefail
cd "$(dirname "$0")/../.."
TEST_PG="${TEST_PG:-postgresql://$(whoami)@localhost:5432/postgres}"
case "$TEST_PG" in *@localhost*|*@127.0.0.1*) ;; *) echo "Refusing: TEST_PG must be local." >&2; exit 2 ;; esac
PORT="${APP_LOGIN_PORT:-3007}"
DB="nova_applogin_$(date +%s)"
LOGIN="nova_app_test_$$"
OWNER_URL="${TEST_PG%/*}/$DB"
LOG="${TMPDIR:-/tmp}/nova-app-login-server.log"
export PGOPTIONS="-c client_min_messages=warning"
SECRET="$(node -e "console.log(require('crypto').randomBytes(30).toString('base64url'))")"
SERVER_PID=""; pass=0; fail=0
ok() { echo "PASS  $1"; pass=$((pass+1)); }
bad() { echo "FAIL  $1"; fail=$((fail+1)); }
cleanup() {
  [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null; sleep 1
  psql -X -q "$TEST_PG" -c "DROP DATABASE IF EXISTS $DB" >/dev/null 2>&1
  psql -X -q "$TEST_PG" -c "DROP ROLE IF EXISTS $LOGIN" >/dev/null 2>&1
}
trap cleanup EXIT

psql -X -q "$TEST_PG" -c "CREATE DATABASE $DB" >/dev/null || exit 1
DATABASE_URL="$OWNER_URL" SEED_DEMO=true JWT_SECRET="$SECRET" PORT="$PORT" node server.js >/dev/null 2>&1   # schema + demo, then asks for migrations
MIGRATION_DATABASE_URL="$OWNER_URL" node db/migrate.js --yes | grep -q "applied  0007_app_role.sql" && ok "migrations incl. 0007 (lock stays off)" || bad "migrations"
APP_URL=$(MIGRATION_DATABASE_URL="$OWNER_URL" APP_LOGIN_NAME="$LOGIN" node db/app-login.js | grep '^postgres')
[ -n "$APP_URL" ] && ok "app login created" || { bad "app login"; exit 1; }

# psql fails on purpose for forbidden actions; the output is what we check.
as_app() { psql -X -q -At "$APP_URL" -c "$1" 2>&1; true; }
[ "$(as_app 'SELECT COUNT(*) > 0 FROM students')" = "t" ] && ok "app login reads data" || bad "app login reads data"
as_app "DROP TABLE grades" | grep -q -i "must be owner\|permission denied" && ok "app login cannot drop tables" || bad "drop table"
as_app 'ALTER TABLE users ADD COLUMN x int' | grep -q -i "must be owner\|permission denied" && ok "app login cannot change tables" || bad "alter table"
as_app 'CREATE TABLE sneaky (id int)' | grep -q -i "permission denied" && ok "app login cannot create tables" || bad "create table"
as_app "UPDATE institutions SET name = 'x'" | grep -q -i "permission denied" && ok "app login cannot change school records" || bad "update institutions"
as_app "DELETE FROM schema_migrations" | grep -q -i "permission denied" && ok "app login cannot touch migration history" || bad "schema_migrations"
[ "$(as_app "SELECT rolbypassrls OR rolsuper FROM pg_roles WHERE rolname = current_user")" = "f" ] && ok "app login cannot bypass row-level security" || bad "bypass"

DATABASE_URL="$APP_URL" JWT_SECRET="$SECRET" PORT="$PORT" node server.js > "$LOG" 2>&1 &
SERVER_PID=$!
for i in $(seq 1 30); do curl -s "localhost:$PORT/api/health" | grep -q ok && break; sleep 1; done
grep -q "limited app login" "$LOG" && ok "server starts on the app login and leaves the schema alone" || bad "server start ($(tail -3 "$LOG"))"
if BASE_URL="http://localhost:$PORT" node --test tests/api/security.test.js > "${LOG}.tests" 2>&1; then ok "security API suite on the app login"; else bad "security API suite (see ${LOG}.tests)"; fi
grep -E "^# (pass|fail)|^ℹ (pass|fail)" "${LOG}.tests"
echo; echo "App login checks: $pass passed, $fail failed."
[ "$fail" -eq 0 ]
