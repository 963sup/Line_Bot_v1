#!/usr/bin/env bash
source "$(dirname -- "${BASH_SOURCE[0]}")/detect.sh"
CHECKS_TOTAL=0
CHECKS_FAILED=0
CHECKS_PENDING=0
record_check() {
  local name="$1" actual="$2" expected="${3:-}"
  CHECKS_TOTAL=$((CHECKS_TOTAL + 1))
  if [[ -n "$actual" && (-z "$expected" || "$actual" == "$expected") ]]; then
    printf 'PASS %s: %s\n' "$name" "$actual"
  else
    CHECKS_FAILED=$((CHECKS_FAILED + 1))
    printf 'FAIL %s: expected=%s actual=%s\n' "$name" "${expected:-available}" "${actual:-unavailable}" >&2
  fi
}

check_version() {
  local name="$1" expected="$2" actual
  shift 2
  actual="$(command_version "$@" || true)"
  record_check "$name" "$actual" "$expected"
}

record_pending() {
  CHECKS_PENDING=$((CHECKS_PENDING + 1))
  printf 'PENDING %s: %s\n' "$1" "$2"
}
check_executable() {
  if [[ -x "$2" ]]; then record_check "$1" available; else record_check "$1" ''; fi
}
check_workspace_cli() {
  local name="$1" expected=''
  expected="$(workspace_version "$name" 2>/dev/null || true)"
  if [[ -z "$expected" ]]; then
    record_check "$name-manifest" ''
    return
  fi
  check_version "$name" "$expected" "$BOOTSTRAP_ROOT/node_modules/.bin/$name" --version
}
mcp_configured() {
  python -c 'import sys,tomllib; c=tomllib.load(open(sys.argv[1],"rb")); s=c.get("mcp_servers",{}).get(sys.argv[2],{}); sys.exit(0 if s.get(sys.argv[3]) else 1)' "$BOOTSTRAP_ROOT/.codex/config.toml" "$1" "$2" >/dev/null 2>&1
}
verification_summary() {
  printf '{"scope":"cloud-bootstrap","checks":%s,"failed":%s,"pending":%s,"mcpSession":"unverified"}\n' "$CHECKS_TOTAL" "$CHECKS_FAILED" "$CHECKS_PENDING"
  [[ "$CHECKS_FAILED" -eq 0 ]]
}
