#!/usr/bin/env bash
set -euo pipefail
source "$(dirname -- "${BASH_SOURCE[0]}")/../lib/common.sh"
# Explicit opt-in; no installs, downloads, provider mutation or service startup.
while IFS= read -r file; do bash -n "$file"; done < <(find "$BOOTSTRAP_DIR" -type f -name '*.sh' | sort)
bash "$BOOTSTRAP_DIR/verify.sh"
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
