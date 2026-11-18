#!/usr/bin/env bash
# Собирает Lighthouse-отчёт и сводку. Отчёт пишется только в переданный каталог:
# в CI это $RUNNER_TEMP/audit, локально — игнорируемый audit/.
set -euo pipefail

url="${1:?Использование: collect.sh <url> [out-dir]}"
out="${2:-audit}"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

mkdir -p "$out"

npx --yes lighthouse@13.6.0 "$url" \
  --output=json \
  --output=html \
  --output-path="$out/lighthouse" \
  --chrome-flags="--headless=new --no-sandbox --disable-dev-shm-usage" \
  --only-categories=performance,accessibility,best-practices,seo \
  --quiet

node "$script_dir/summarize.mjs" "$out/lighthouse.report.json" --out-dir "$out"
