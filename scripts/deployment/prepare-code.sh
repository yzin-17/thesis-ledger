#!/usr/bin/env bash
set -Eeuo pipefail
app_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
print_error() { printf '%s\n' "$1" >&2; }
require_matching_file() {
  local source_file="$1" container_id="$2" container_file="$3" label="$4"
  local copied_file="$work_dir/preflight-${label//\//-}"

  if ! docker cp "$container_id:$container_file" "$copied_file" >/dev/null 2>&1; then
    printf '无法读取容器内兼容性基线: %s (%s)\n' "$label" "$container_file" >&2
    return 1
  fi
  if cmp -s "$source_file" "$copied_file"; then
    return 0
  fi
  if [[ "$container_file" == /app/package.json ]] &&
    node "$app_dir/scripts/deployment/match-pnpm-server-manifest.mjs" "$source_file" "$copied_file"; then
    return 0
  fi
  printf '%s 与当前容器不一致，不能仅同步代码。\n' "$label" >&2
  print_error '请使用 ./scripts/update.sh 更新依赖或运行时。'
  return 1
}

preflight_thesis_ledger_compatibility() {
  local package package_path runtime_prisma_dir

  require_matching_file \
    "$app_dir/apps/server/package.json" \
    "$container_id" \
    /app/package.json \
    server-package.json

  for package in domain schemas shared; do
    package_path="$(docker exec "$container_id" readlink -f "/app/node_modules/@thesis-ledger/$package")"
    case "$package_path" in
      /app/node_modules/.pnpm/*/node_modules/@thesis-ledger/"$package") ;;
      *)
        printf '无法确认容器内 workspace 包路径: %s -> %s\n' "$package" "$package_path" >&2
        return 1
        ;;
    esac
    require_matching_file \
      "$app_dir/packages/$package/package.json" \
      "$container_id" \
      "$package_path/package.json" \
      "$package-package.json"
  done

  runtime_prisma_dir="$work_dir/runtime-prisma"
  mkdir -p "$runtime_prisma_dir"
  if ! docker cp "$container_id:/app/prisma/." "$runtime_prisma_dir/" >/dev/null 2>&1; then
    print_error '无法读取容器内 Prisma 结构基线。'
    return 1
  fi
  if ! diff -qr "$app_dir/apps/server/prisma" "$runtime_prisma_dir" >/dev/null; then
    print_error 'Prisma Schema、migration 或 raw-owned inventory 与当前容器不一致。'
    print_error '仅代码更新不会修改数据库；请使用 ./scripts/update.sh 执行结构门禁。'
    return 1
  fi
}


build_thesis_ledger_payload() {
  local package output_dir

  printf '在宿主机构建 ThesisLedger Server 及其 workspace 依赖...\n'
  (
    cd "$app_dir"
    pnpm --filter @thesis-ledger/server... build
  )

  mkdir -p "$payload_dir"
  output_dir="$app_dir/apps/server/dist"
  if [[ ! -f "$output_dir/src/main.js" || ! -f "$output_dir/src/backtest/backtest-worker.main.js" ]]; then
    print_error 'ThesisLedger 构建未生成 Server/Worker 入口。'
    return 1
  fi
  mkdir -p "$payload_dir/server-dist"
  cp -R "$output_dir/." "$payload_dir/server-dist/"

  for package in domain schemas shared; do
    output_dir="$app_dir/packages/$package/dist"
    if [[ ! -f "$output_dir/index.js" ]]; then
      printf 'ThesisLedger 构建未生成 workspace 产物: %s\n' "$package" >&2
      return 1
    fi
    mkdir -p "$payload_dir/$package-dist"
    cp -R "$output_dir/." "$payload_dir/$package-dist/"
  done

  # 传入容器的产物由 root 替换，Server 和 Worker 以镜像的非 root 用户读取。
  chmod -R a+rX "$payload_dir"/{server,domain,schemas,shared}-dist
}



case "${1:-}" in
  preflight)
    [[ $# == 3 ]] || exit 2
    container_id="$2"; work_dir="$3"
    command -v pnpm >/dev/null || { print_error '未找到 pnpm'; exit 1; }
    preflight_thesis_ledger_compatibility
    ;;
  payload)
    [[ $# == 2 && "$2" = /* ]] || exit 2
    if [[ -e "$2" ]]; then
      print_error '载荷目录已存在，拒绝覆盖。'
      exit 1
    fi
    payload_dir="$2"
    build_thesis_ledger_payload
    ;;
  *) exit 2 ;;
esac
