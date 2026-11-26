#!/usr/bin/env bash
set -euo pipefail
app_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
if (($# > 1)) || [[ "${1:-}" != '' && "${1:-}" != --check-only ]]; then exit 2; fi
if ! grep -Fq 'REVOKE UPDATE, DELETE ON TABLE %I FROM %I' "$app_dir/infra/docker/bootstrap-app-role.sql"; then
  printf 'app role init SQL 未收紧 LedgerEvent UPDATE/DELETE。\n' >&2
  exit 1
fi
if ! grep -Fq 'REVOKE INSERT, UPDATE, DELETE ON TABLE %I FROM %I' "$app_dir/infra/docker/bootstrap-app-role.sql"; then
  printf 'app role init SQL 未保护 SchemaVersion。\n' >&2
  exit 1
fi

if [[ "${1:-}" == --check-only ]]; then
  printf '业务表权限静态保护断言通过；未创建隔离数据库。\n'
  exit 0
fi

baseline_sql="$app_dir/apps/server/prisma/migrations/20260905000000_fresh_database_baseline/migration.sql"
role_sql="$app_dir/infra/docker/bootstrap-app-role.sql"
run_init_failure_case() {
  local container_name="$1"
  local owner_user="$2"
  local app_user="$3"
  local state exit_code

  docker rm -fv "$container_name" >/dev/null 2>&1 || true
  if ! docker run -d \
    --name "$container_name" \
    -e POSTGRES_USER=thesis_owner_test \
    -e POSTGRES_PASSWORD=owner-secret-test \
    -e POSTGRES_DB=thesis_ledger_test \
    -e POSTGRES_OWNER_USER="$owner_user" \
    -e POSTGRES_APP_USER="$app_user" \
    -e POSTGRES_APP_PASSWORD=app-secret-test \
    -v "$baseline_sql:/docker-entrypoint-initdb.d/001-current-baseline.sql:ro" \
    -v "$role_sql:/docker-entrypoint-initdb.d/002-app-role.sql:ro" \
    postgres:17-alpine >/dev/null; then
    printf '无法启动角色校验临时容器: %s\n' "$container_name" >&2
    return 1
  fi

  local deadline=$((SECONDS + 60))
  while ((SECONDS < deadline)); do
    state="$(docker inspect --format '{{.State.Status}}' "$container_name" 2>/dev/null || true)"
    if [[ "$state" == exited || "$state" == dead ]]; then
      exit_code="$(docker inspect --format '{{.State.ExitCode}}' "$container_name")"
      if [[ "$exit_code" == 0 ]]; then
        docker logs "$container_name" >&2 || true
        docker rm -fv "$container_name" >/dev/null 2>&1 || true
        printf '角色校验本应失败但临时 init 成功: %s\n' "$container_name" >&2
        return 1
      fi
      docker rm -fv "$container_name" >/dev/null 2>&1 || true
      return 0
    fi
    sleep 2
  done

  docker logs --tail 120 "$container_name" >&2 || true
  docker rm -fv "$container_name" >/dev/null 2>&1 || true
  printf '角色校验临时 init 超时: %s\n' "$container_name" >&2
  return 1
}

run_init_failure_case thesis-ledger-role-empty-20260902 '' thesis_app_test
run_init_failure_case thesis-ledger-role-same-20260902 thesis_owner_test thesis_owner_test

printf '业务表权限及数据库角色初始化失败保护通过。\n'
