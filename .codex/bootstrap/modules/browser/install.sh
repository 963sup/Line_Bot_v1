#!/usr/bin/env bash
browser_executable() {
  node -e 'const {chromium}=require(process.argv[1]); console.log(chromium.executablePath())' "$BOOTSTRAP_PREFIX/lib/node_modules/playwright"
}

install_browser() {
  local executable dependencies=''
  if [[ "$(command_version "$BOOTSTRAP_PREFIX/bin/playwright" --version || true)" != "$PLAYWRIGHT_VERSION" ]]; then
    run_stage playwright-install npm install --global --prefix "$BOOTSTRAP_PREFIX" "playwright@$PLAYWRIGHT_VERSION" --no-audit --no-fund
  fi
  # Playwright checks its own cache; this only downloads missing matching binaries.
  run_stage chromium-install "$BOOTSTRAP_PREFIX/bin/playwright" install chromium
  executable="$(browser_executable)"
  if command -v ldd >/dev/null && dependencies="$(LC_ALL=C ldd "$executable" 2>&1)"; then
    if [[ "$dependencies" != *'not found'* ]]; then return 0; fi
  fi
  if [[ "$(id -u)" -eq 0 ]]; then
    run_stage chromium-system-dependencies env DEBIAN_FRONTEND=noninteractive "$BOOTSTRAP_PREFIX/bin/playwright" install-deps chromium
  else
    require_command sudo
    run_stage chromium-system-dependencies sudo -n --preserve-env=HTTP_PROXY,HTTPS_PROXY,NO_PROXY,http_proxy,https_proxy,no_proxy env PATH="$PATH" DEBIAN_FRONTEND=noninteractive "$BOOTSTRAP_PREFIX/bin/playwright" install-deps chromium
  fi
}
