#!/usr/bin/env bash
set -Eeuo pipefail
infra_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../thesis-ledger-infra" && pwd)"
if (($# != 5)); then
  printf '用法：bash scripts/dsa-target-recovery.sh <正式备份目录> <原镜像快照> <DG2a 报告> <DG2b 报告> <新私有结果目录>\n' >&2
  exit 1
fi
exec node "$infra_dir/scripts/infra.mjs" locked -- node "$infra_dir/../thesis-ledger/scripts/local-runtime/dsa-target-recovery.mjs" @update-lock "$@"
