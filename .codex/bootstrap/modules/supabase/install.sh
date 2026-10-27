#!/usr/bin/env bash
source "$(dirname -- "${BASH_SOURCE[0]}")/../../lib/install.sh"
install_supabase() {
  test -x "$BOOTSTRAP_ROOT/node_modules/.bin/supabase" || {
    echo 'Supabase CLI missing after workspace installation; inspect the workspace install log.' >&2
    return 1
  }
}
