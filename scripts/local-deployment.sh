#!/usr/bin/env bash
# 应用维护的本地部署准备接口；容器变更仍由 infra 正式入口执行。
set -Eeuo pipefail
app_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
mode="${1:-}"
shift || true
case "$mode" in
  sync-preflight) bash "$app_dir/scripts/deployment/prepare-code.sh" preflight "$@" ;;
  sync-payload) bash "$app_dir/scripts/deployment/prepare-code.sh" payload "$@" ;;
  validate-image) [[ $# == 0 ]] || exit 2; node "$app_dir/scripts/deployment/image-contract.mjs" ;;
  verify-state-switch) [[ $# == 1 ]] || exit 2; node "$app_dir/scripts/database/verify-named-v1-state-switch.mjs" "$1" ;;
  verify-switch-recovery-images) [[ $# == 3 ]] || exit 2; node "$app_dir/scripts/database/verify-named-v1-recovery-images.mjs" "$@" ;;
  *) printf '用法：local-deployment.sh <sync-preflight|sync-payload|validate-image|verify-state-switch|verify-switch-recovery-images> <参数>\n' >&2; exit 2 ;;
esac
