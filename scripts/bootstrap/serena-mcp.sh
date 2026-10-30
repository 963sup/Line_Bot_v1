#!/usr/bin/env bash
set -euo pipefail
source "$(dirname -- "${BASH_SOURCE[0]}")/cloud-env.sh"
cd "$CLOUD_REPO_ROOT"
serena_executable="$UV_TOOL_DIR/serena-agent/bin/serena"
if [[ ! -x "$serena_executable" ]]; then
  echo "Serena is missing. Run scripts/bootstrap/codex-cloud.sh first." >&2
  exit 1
fi
exec "$serena_executable" "$@"
