#!/usr/bin/env bash
set -euo pipefail

output_dir="${1:-backups}"
mkdir -p "$output_dir"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
version="$(node -p "require('./package.json').version")"
file="$output_dir/thesis-ledger-${version}-${timestamp}.dump"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL 未配置" >&2
  exit 1
fi

pg_dump --format=custom --no-owner --file "$file" "$DATABASE_URL"
shasum -a 256 "$file" > "$file.sha256"
printf 'backup=%s\nversion=%s\nchecksum=%s\n' "$file" "$version" "$file.sha256"
