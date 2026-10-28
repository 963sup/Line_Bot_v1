#!/usr/bin/env bash
set -euo pipefail
[[ $# -gt 0 ]] || {
  echo 'Usage: bash .codex/bootstrap/exec.sh command [args...]' >&2
  exit 2
}
source "$(dirname -- "${BASH_SOURCE[0]}")/lib/common.sh"
exec "$@"
