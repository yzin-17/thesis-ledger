#!/usr/bin/env bash
set -Eeuo pipefail
infra_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../thesis-ledger-infra" && pwd)"
if (($# != 2)); then
  printf '用法：bash scripts/dsa-target-acceptance.sh <正式备份目录> <新的绝对报告路径>\n' >&2
  exit 1
fi
export NODE_USE_ENV_PROXY=0
exec node "$infra_dir/scripts/infra.mjs" locked -- node "$infra_dir/../thesis-ledger/scripts/local-runtime/dsa-target-acceptance.mjs" @update-lock "$@"
