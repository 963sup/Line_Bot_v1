#!/usr/bin/env bash
set -euo pipefail
source "$(dirname -- "${BASH_SOURCE[0]}")/../lib/common.sh"
source "$BOOTSTRAP_DIR/lib/detect.sh"
# Explicit opt-in; no installs, downloads, provider mutation or application service startup.
# Selecting browser also runs a short local Chromium launch/page check below.
while IFS= read -r file; do bash -n "$file"; done < <(find "$BOOTSTRAP_DIR" -type f -name '*.sh' | sort)
bash "$BOOTSTRAP_DIR/verify.sh"
bash "$BOOTSTRAP_DIR/tests/docker.test.sh"
if [[ " $(selected_tools) " == *browser* ]]; then
  node - "$BOOTSTRAP_PREFIX/lib/node_modules/playwright" <<'JS'
const assert = require('node:assert/strict');
const { chromium } = require(process.argv[2]);
(async () => {
  const browser = await chromium.launch({headless: true});
  try {
    const page = await browser.newPage();
    await page.setContent('<title>Codex Cloud</title>');
    assert.equal(await page.title(), 'Codex Cloud');
    console.log('Chromium launch and local page smoke passed; application UI is not covered.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
JS
fi
python - "$BOOTSTRAP_ROOT/.codex/config.toml" <<'PY'
import pathlib, sys, tomllib
config = tomllib.loads(pathlib.Path(sys.argv[1]).read_text())
root = pathlib.Path(sys.argv[1]).resolve().parent.parent
for name in ("serena", "next-devtools", "shadcn"):
    server = config["mcp_servers"][name]
    assert server["command"] == "bash", name
    assert server["args"][0] == ".codex/bootstrap/install.sh", name
    assert (root / server["args"][0]).is_file(), name
print("Bootstrap syntax, local prerequisites and launcher paths checked; host handshakes are not covered.")
PY
