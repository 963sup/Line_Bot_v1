#!/usr/bin/env bash
verify_supabase() {
  mkdir -p "$BOOTSTRAP_PREFIX/supabase-home"
  HOME="$BOOTSTRAP_PREFIX/supabase-home" check_workspace_cli supabase
}
