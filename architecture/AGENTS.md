# Architecture authority scope

`architecture/` 保存 machine-readable architecture truth 與 pinned external semantic evidence。本目錄的變更是 authority / topology / benchmark contract 變更，不是一般 implementation shortcut。

## Governing files

修改本目錄前必須先讀取並遵守：

- `architecture/README.md`
- `architecture/data-topology.json`
- `architecture/implementation-topology.json`
- `architecture/semantic-benchmark.json`
- `architecture/semantic-model.json`
- `.dependency-cruiser.mjs`
- `biome.json`
- `knip.jsonc`

## Local constraints

- `architecture/README.md` 只 routing / explanation；不得建立第二套 machine truth。
- `semantic-model.json` 是 adopted product semantics、semantic owner、relationship、capability、invariant、policy 與 integration mode 的 authority。
- `implementation-topology.json` 是 module path、module kind、semantic owner mapping 與 workspace dependency allowlist 的 authority。
- `data-topology.json` 是 persisted relation ownership、projection / reference 與 physical schema mapping 的 authority。
- `semantic-benchmark.json` 只保存 pinned external benchmark evidence；不得直接成為 product authority。
- `.dependency-cruiser.mjs`、`biome.json`、`knip.jsonc` 是 implementation/tooling guards；不得因 local source 或 CI violation 而放寬。
- Architecture change 必須先證明 Root Cause、Owner、Source of Truth、Boundary / Dependency，再同步 consumer、exports、schemas、guards、tests 與 evidence。
- Guard / implementation 與 authority 不一致時，先判定是 implementation violation、guard drift 或 authority change；不得直接選擇改規則讓錯誤消失。
- Nested `AGENTS.md` 只能增加 local constraints，不能削弱 root governing set。

## Validation

Architecture 變更至少執行 `pnpm semantic check`、`pnpm architecture`、`pnpm architecture:test`、`pnpm boundaries` 與適用 repository validation；merge / release 前 `pnpm validate`。
