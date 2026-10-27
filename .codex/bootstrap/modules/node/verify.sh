#!/usr/bin/env bash
verify_node() {
  check_version node "$(node_pin)" node --version
  check_version npm '' npm --version
  local expected
  expected="$(pnpm_pin 2>/dev/null || true)"
  if [[ -n "$expected" ]]; then
    check_version pnpm "$expected" pnpm --version
  else
    record_check pnpm '' 'Node prerequisite'
  fi
}
