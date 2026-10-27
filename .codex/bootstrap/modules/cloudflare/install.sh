#!/usr/bin/env bash
source "$(dirname -- "${BASH_SOURCE[0]}")/../../lib/install.sh"
install_cloudflare() {
  if [[ "$(command_version "$BOOTSTRAP_PREFIX/bin/wrangler" --version || true)" == "$CLOUDFLARE_VERSION" ]]; then return 0; fi
  run_stage cloudflare-install npm install --global --prefix "$BOOTSTRAP_PREFIX" "wrangler@$CLOUDFLARE_VERSION" --no-audit --no-fund
}
