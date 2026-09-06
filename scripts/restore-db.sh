#!/usr/bin/env bash
set -euo pipefail

backup_file="${1:?用法: restore-db.sh <backup.dump>}"
if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL 未配置" >&2
  exit 1
fi
if [[ ! -f "$backup_file" ]]; then
  echo "备份文件不存在: $backup_file" >&2
  exit 1
fi
if [[ -f "$backup_file.sha256" ]]; then
  shasum -a 256 -c "$backup_file.sha256"
fi
pg_restore --clean --if-exists --no-owner --dbname "$DATABASE_URL" "$backup_file"
expected_schema_version='20260905000000_fresh_database_baseline'
actual_schema_version="$(psql "$DATABASE_URL" -Atqc 'SELECT "version" FROM "SchemaVersion" WHERE "id" = 1 LIMIT 1')"
if [[ "$actual_schema_version" != "$expected_schema_version" ]]; then
  echo "备份恢复后的 Schema marker 不匹配: 期望 $expected_schema_version，实际 ${actual_schema_version:-<missing>}" >&2
  exit 1
fi
echo "恢复完成，请运行 integrity check 和核心 E2E。"
