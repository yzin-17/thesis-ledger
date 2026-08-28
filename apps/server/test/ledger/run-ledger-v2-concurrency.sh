#!/bin/sh
set -eu

database=thesis_ledger_codex_ledger_v2
psql_base="psql -v ON_ERROR_STOP=1 -U thesis_ledger -d $database"

$psql_base -f /tmp/ledger_v2_concurrency_setup.sql >/tmp/ledger_v2_setup.out

same_started=$(date +%s)
$psql_base -f /tmp/ledger_v2_lock_account_a.sql >/tmp/ledger_v2_same_1.out &
same_pid_1=$!
$psql_base -f /tmp/ledger_v2_lock_account_a.sql >/tmp/ledger_v2_same_2.out &
same_pid_2=$!
wait "$same_pid_1"
wait "$same_pid_2"
same_elapsed=$(($(date +%s) - same_started))
same_revision=$($psql_base -tAc \
  "SELECT \"ledgerRevision\" FROM \"AccountLedgerState\" WHERE \"accountId\" = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'")

$psql_base -f /tmp/ledger_v2_concurrency_setup.sql >/tmp/ledger_v2_setup.out

cross_started=$(date +%s)
$psql_base -f /tmp/ledger_v2_lock_account_a.sql >/tmp/ledger_v2_cross_a.out &
cross_pid_a=$!
$psql_base -f /tmp/ledger_v2_lock_account_b.sql >/tmp/ledger_v2_cross_b.out &
cross_pid_b=$!
wait "$cross_pid_a"
wait "$cross_pid_b"
cross_elapsed=$(($(date +%s) - cross_started))
cross_revisions=$($psql_base -tAc \
  "SELECT string_agg(\"ledgerRevision\"::text, ', ' ORDER BY \"accountId\") FROM \"AccountLedgerState\" WHERE \"accountId\" IN ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')")

test "$same_revision" = "2"
test "$same_elapsed" -ge 4
test "$cross_revisions" = "1, 1"
test "$cross_elapsed" -lt 4

echo "same_account_revision=$same_revision same_account_elapsed_seconds=$same_elapsed"
echo "cross_account_revisions=$cross_revisions cross_account_elapsed_seconds=$cross_elapsed"
