#!/usr/bin/env bash
verify_browser() {
  local executable='' dependencies=''
  check_version playwright "$PLAYWRIGHT_VERSION" "$BOOTSTRAP_PREFIX/bin/playwright" --version
  executable="$(node -e 'const {chromium}=require(process.argv[1]); console.log(chromium.executablePath())' "$BOOTSTRAP_PREFIX/lib/node_modules/playwright" 2>/dev/null || true)"
  check_executable chromium-binary "$executable"
  if [[ -x "$executable" ]] && command -v ldd >/dev/null && dependencies="$(LC_ALL=C ldd "$executable" 2>&1)" && [[ "$dependencies" != *'not found'* ]]; then
    record_check chromium-shared-libraries available
  else
    record_check chromium-shared-libraries '' 'Chromium system dependencies'
  fi
  record_pending browser-runtime 'Binary presence is not a launch or UI check; use the opt-in smoke test and the affected page.'
}
