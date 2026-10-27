#!/usr/bin/env bash
source "$(dirname -- "${BASH_SOURCE[0]}")/../../lib/install.sh"
install_vercel() {
  test -x "$BOOTSTRAP_ROOT/node_modules/.bin/vercel" || {
    echo 'Vercel CLI missing after workspace installation; inspect the workspace install log.' >&2
    return 1
  }
}
