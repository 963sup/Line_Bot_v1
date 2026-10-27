#!/usr/bin/env bash
set -euo pipefail
[[ $# -eq 0 ]] || { echo 'Usage: bash .codex/bootstrap/verify.sh' >&2; exit 2; }
source "$(dirname -- "${BASH_SOURCE[0]}")/lib/verify.sh"
validate_mcp_selection
tools="$(selected_tools)"
for tool in $tools; do
  source "$BOOTSTRAP_DIR/modules/$tool/verify.sh"
  "verify_$tool"
done
source "$BOOTSTRAP_DIR/mcp/verify.sh"
verify_mcp
verification_summary
