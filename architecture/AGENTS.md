# Architecture authority scope

`architecture/` 保存 machine-readable architecture truth 與 pinned GitHub FPT domain truth。本目錄的變更是 authority / topology / domain-truth contract 變更，不是一般 implementation shortcut。

## Governing files

修改本目錄前必須先讀取並遵守：

- `architecture/README.md`
- `architecture/data-topology.json`
- `architecture/implementation-topology.json`
- `architecture/domain/fpt/*.json`
- `architecture/domain/fpt-source.json`
- `architecture/semantic-model.json`
- `.dependency-cruiser.mjs`
- `biome.json`
- `knip.jsonc`

## Local constraints

- `architecture/README.md` 只 routing / explanation；不得建立第二套 machine truth。
- `domain/fpt/*.json` 是 GitHub-derived domain semantics 的 authority；只能由單一 reviewed upstream revision 原樣更新。`semantic-model.json` 只擁有 Line_Bot_v1 本地 semantic owner、relationship、capability、invariant、policy、integration mode 與 implementation expectation，不得重寫 FPT。
- `implementation-topology.json` 是 module path、module kind、semantic owner mapping 與 dependency direction 的 authority；`modules` / `applications` 是 current executable workspaces，`targetModules` 是 selected-target、non-runtime package boundaries，兩者不得混為 current runtime truth。Target responsibility 只能以 vendored FPT 的 exact `fptRoots`（`file` + `symbol`）定位，不得用本地 description 重寫 GitHub semantics。
- `data-topology.json` 是 persisted relation ownership、projection / reference 與 physical schema mapping 的 authority。
- `domain/fpt-source.json` 只保存 upstream provenance / blob integrity，不建立第二套 domain semantics。
- `.dependency-cruiser.mjs`、`biome.json`、`knip.jsonc` 是 implementation/tooling guards；不得因 local source 或 CI violation 而放寬。
- Architecture change 必須先證明 Root Cause、Owner、Source of Truth、Boundary / Dependency，再同步 consumer、exports、schemas、guards、tests 與 evidence。
- Selected-target module 不得建立 `package.json`、runtime source、route、schema 或 current workspace dependency；真正 promotion 時必須一次收斂 semantic/data/runtime ownership，不得只改名稱或 topology 製造表面完成。
- Guard / implementation 與 authority 不一致時，先判定是 implementation violation、guard drift 或 authority change；不得直接選擇改規則讓錯誤消失。
- Nested `AGENTS.md` 只能增加 local constraints，不能削弱 root governing set。

## Validation

Architecture 變更至少執行 `pnpm semantic check`、`pnpm architecture`、`pnpm architecture:test`、`pnpm boundaries` 與適用 repository validation；merge / release 前 `pnpm validate`。
