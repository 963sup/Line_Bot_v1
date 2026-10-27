#!/usr/bin/env bash
verify_supabase() {
  mkdir -p "$BOOTSTRAP_PREFIX/supabase-home"
  HOME="$BOOTSTRAP_PREFIX/supabase-home" check_workspace_cli supabase
  local result
  mkdir -p "$BOOTSTRAP_ROOT/.artifacts/codex-cloud"
  if node "$BOOTSTRAP_ROOT/packages/integration-supabase/scripts/local-stack.mjs" verify >"$BOOTSTRAP_ROOT/.artifacts/codex-cloud/supabase-verify.log" 2>&1; then
    result=ready
  else
    result=''
  fi
  record_check supabase-stack "$result" ready
}
