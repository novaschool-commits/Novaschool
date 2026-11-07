#!/usr/bin/env bash
# Database tests: migrations, backfill, module foundations, tenant isolation
# (row-level security) and rollback. Uses a THROWAWAY database on a LOCAL
# PostgreSQL server only; refuses anything else.
#
#   TEST_PG="postgresql://postgres@localhost:5432/postgres" bash tests/db/run.sh
#
# Needs psql and pg_dump on PATH and a role allowed to CREATE DATABASE and
# CREATE ROLE (a local superuser). Termux: pkg install postgresql.
set -euo pipefail
cd "$(dirname "$0")/../.."

TEST_PG="${TEST_PG:-postgresql://postgres@localhost:5432/postgres}"
case "$TEST_PG" in
  *@localhost*|*@127.0.0.1*|*host=/*|postgresql:///*|*@/*) ;;
  *) echo "Refusing: TEST_PG must point at a local server, not a shared or live database." >&2; exit 2 ;;
esac

DB="nova_test_$(date +%s)_$$"
DB2="${DB}_guard"
base="${TEST_PG%/*}"
URL="$base/$DB"; URL2="$base/$DB2"
PSQL=(psql -X -q -v ON_ERROR_STOP=1 --set=SHOW_CONTEXT=never)
export PGOPTIONS="-c client_min_messages=warning"
OUT="${TEST_OUT:-tests/db/last-run}"; mkdir -p "$OUT"
pass=0; fail=0
step() { printf '%-62s' "$1"; }
ok() { echo "PASS"; pass=$((pass+1)); }
bad() { echo "FAIL"; fail=$((fail+1)); }
cleanup() { psql -X -q "$TEST_PG" -c "DROP DATABASE IF EXISTS $DB" -c "DROP DATABASE IF EXISTS $DB2" >/dev/null 2>&1 || true; }
trap cleanup EXIT

psql -X -q "$TEST_PG" -c "CREATE DATABASE $DB" -c "CREATE DATABASE $DB2" >/dev/null

run_file() { "${PSQL[@]}" "$1" -f "$2" >>"$OUT/log.txt" 2>&1; }
migrations() { # mirrors db/migrate.js. $1 = "ungated" (normal run) or "gated" (RLS files only)
  local applied=0
  for f in db/migrations/[0-9][0-9][0-9][0-9]_*.sql; do
    if head -1 "$f" | grep -q '^-- requires: ALLOW_RLS_ENFORCEMENT'; then g=gated; else g=ungated; fi
    [ "$g" = "$1" ] || continue
    run_file "$URL" "$f" || return 1
    applied=$((applied+1))
  done
  [ "$applied" -gt 0 ] # a step that applied nothing is a failure, not a pass
}
: > "$OUT/log.txt"

step "1  legacy schema applies to an empty database";      run_file "$URL" db/schema.sql && ok || bad
step "2  legacy schema re-applies cleanly (server restart)"; run_file "$URL" db/schema.sql && ok || bad
step "3  synthetic school A loads (old app shape)";         run_file "$URL" tests/db/fixtures_school_a.sql && ok || bad
pg_dump -s -x -O "$URL" | grep -v -e '^--' -e '^\\restrict' -e '^\\unrestrict' | sed '/^$/d' | sort > "$OUT/schema-before.sql"
step "4  ungated migrations apply (0001-0003, 0005, 0007)";   migrations ungated && ok || bad
step "5  backfill checks (test_backfill.sql)";              run_file "$URL" tests/db/test_backfill.sql && ok || bad
step "6  module foundation checks (test_modules.sql)";      run_file "$URL" tests/db/test_modules.sql && ok || bad
step "7  legacy schema still re-applies after migrations";  run_file "$URL" db/schema.sql && ok || bad
step "8  gated 0004, 0006 row-level security applies";            migrations gated && ok || bad
step "9  synthetic school B loads";                          run_file "$URL" tests/db/fixtures_school_b.sql && ok || bad
step "10 tenant isolation as nova_app (test_tenancy.sql)";  run_file "$URL" tests/db/test_tenancy.sql && ok || bad
step "11 legacy schema still re-applies with RLS on";       run_file "$URL" db/schema.sql && ok || bad
step "12 rollback 0007 down to 0001 in order";
  ( for id in 0007 0006 0005 0004 0003 0002 0001; do run_file "$URL" db/migrations/rollback/${id}_*.down.sql || exit 1; done ) && ok || bad
pg_dump -s -x -O "$URL" | grep -v -e '^--' -e '^\\restrict' -e '^\\unrestrict' | sed '/^$/d' | sort > "$OUT/schema-after.sql"
step "13 schema after rollback equals schema before";
  if diff -u "$OUT/schema-before.sql" "$OUT/schema-after.sql" > "$OUT/schema-diff.txt"; then ok; else bad; fi
step "14 backfill refuses when two schools already exist";
  run_file "$URL2" db/schema.sql
  run_file "$URL2" db/migrations/0001_tenancy_expand.sql
  "${PSQL[@]}" "$URL2" -c "INSERT INTO institutions (id, slug, name) VALUES (2, 'second', 'Second')" >>"$OUT/log.txt" 2>&1
  if "${PSQL[@]}" "$URL2" -f db/migrations/0002_tenancy_backfill.sql >"$OUT/guard.txt" 2>&1; then bad
  elif grep -q 'Backfill assumes exactly one institution' "$OUT/guard.txt"; then ok; else bad; fi

echo
echo "Database tests: $pass passed, $fail failed. Log: $OUT/log.txt"
[ "$fail" -eq 0 ]
