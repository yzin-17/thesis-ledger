#!/bin/sh
set -eu
stage="$1"
case "$stage" in /tmp/thesis-ledger-code-sync.*) ;; *) exit 2 ;; esac
for package in domain schemas shared; do
  package_path="$(readlink -f "/app/node_modules/@thesis-ledger/$package")"
  case "$package_path" in
    /app/node_modules/.pnpm/*/node_modules/@thesis-ledger/"$package") ;;
    *) printf '同步前 workspace 包路径校验失败\n' >&2; exit 1 ;;
  esac
  case "$package" in
    domain) domain_path="$package_path" ;;
    schemas) schemas_path="$package_path" ;;
    shared) shared_path="$package_path" ;;
  esac
done

replace_dir() {
  source_dir="$1"
  target_dir="$2"
  backup_dir="${target_dir}.code-sync-old"

  test -d "$source_dir"
  rm -rf -- "$backup_dir"
  if [ -e "$target_dir" ]; then
    mv "$target_dir" "$backup_dir"
  fi
  if ! mv "$source_dir" "$target_dir"; then
    if [ -e "$backup_dir" ]; then
      mv "$backup_dir" "$target_dir"
    fi
    return 1
  fi
  rm -rf -- "$backup_dir"
}

replace_dir "$stage/server-dist" /app/apps/server/dist
printf '容器内已替换 Server dist。\n'
replace_dir "$stage/domain-dist" "$domain_path/dist"
printf '容器内已替换 domain dist。\n'
replace_dir "$stage/schemas-dist" "$schemas_path/dist"
printf '容器内已替换 schemas dist。\n'
replace_dir "$stage/shared-dist" "$shared_path/dist"
printf '容器内已替换 shared dist。\n'
rm -rf -- "$stage"
