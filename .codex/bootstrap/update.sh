#!/usr/bin/env bash
set -euo pipefail
[[ $# -eq 0 ]] || { echo 'Usage: bash .codex/bootstrap/update.sh' >&2; exit 2; }
source "$(dirname -- "${BASH_SOURCE[0]}")/lib/common.sh"
require_command sha256sum
# Reconcile pinned inputs/missing prerequisites; never upgrade latest or edit pins.
expected="$(bootstrap_fingerprint)"
if [[ -f "$BOOTSTRAP_PREFIX/installed.sha256" && "$(cat "$BOOTSTRAP_PREFIX/installed.sha256")" == "$expected" ]]; then
  if bash "$BOOTSTRAP_DIR/verify.sh"; then
    echo 'Pinned inputs are unchanged and local prerequisites are available.'
    exit 0
  fi
fi
exec bash "$BOOTSTRAP_DIR/install.sh"
