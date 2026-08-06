#!/usr/bin/env bash
set -euo pipefail

source_url="${SOURCE_DATABASE_URL:?请设置 SOURCE_DATABASE_URL 指向迁移前数据库}"
target_url="${TARGET_DATABASE_URL:?请设置 TARGET_DATABASE_URL 指向已创建的 thesis_ledger 数据库}"
backup_dir="${THESIS_LEDGER_BACKUP_DIR:-backups}"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
dump_file="$backup_dir/investment-os-to-thesis-ledger-$timestamp.dump"

mkdir -p "$backup_dir"

if [[ "$source_url" == "$target_url" ]]; then
  echo "源数据库和目标数据库不能相同" >&2
  exit 1
fi

target_tables="$(psql "$target_url" -tAc "select count(*) from pg_tables where schemaname = 'public'")"
if [[ "${target_tables//[[:space:]]/}" != "0" ]]; then
  echo "目标数据库不是空库，拒绝覆盖: $target_tables 张 public 表" >&2
  exit 1
fi

pg_dump --format=custom --no-owner --file "$dump_file" "$source_url"
shasum -a 256 "$dump_file" > "$dump_file.sha256"
pg_restore --no-owner --exit-on-error --dbname "$target_url" "$dump_file"

DATABASE_URL="$target_url" pnpm --filter @thesis-ledger/server prisma migrate deploy

source_accounts="$(psql "$source_url" -tAc 'select count(*) from "Account"')"
target_accounts="$(psql "$target_url" -tAc 'select count(*) from "Account"')"
source_ledger="$(psql "$source_url" -tAc 'select count(*) from "LedgerEvent"')"
target_ledger="$(psql "$target_url" -tAc 'select count(*) from "LedgerEvent"')"

if [[ "${source_accounts//[[:space:]]/}" != "${target_accounts//[[:space:]]/}" ]]; then
  echo "Account 数量校验失败: source=$source_accounts target=$target_accounts" >&2
  exit 1
fi
if [[ "${source_ledger//[[:space:]]/}" != "${target_ledger//[[:space:]]/}" ]]; then
  echo "LedgerEvent 数量校验失败: source=$source_ledger target=$target_ledger" >&2
  exit 1
fi

printf '迁移完成\nbackup=%s\nchecksum=%s.sha256\naccounts=%s\nledgerEvents=%s\n' \
  "$dump_file" "$dump_file" "${target_accounts//[[:space:]]/}" "${target_ledger//[[:space:]]/}"
printf 'Redis 未迁移；请使用新 thesis-ledger key 命名空间重新生成缓存。\n'
