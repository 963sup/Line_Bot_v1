# Architecture guards

本文件描述目前 repository 的可執行架構守門責任；實際規則仍以 `scripts/architecture/check-architecture.mjs` 與 `.dependency-cruiser.mjs` 為準。

## 目前守門範圍

Guard 目前至少檢查：

- `apps/web/src/app` 根目錄只允許既定 route groups 與基礎檔案。
- compatibility routes 必須留在 system continuation 位置，不能重新長出產品實作。
- Web `modules` 不可任意跨 feature 讀取 private implementation。
- feature composition 不得彼此依賴。
- package public surface 以各 package `package.json` 的 `exports` 為準；跨 workspace 只能走公開 package specifier，不得用 relative path 穿透另一個 workspace 的 private source。
- Workspace-to-workspace source edge 必須符合 `architecture/implementation-topology.json#allowedWorkspaceDependencies`；Dependency Cruiser 從該 topology 派生規則，不能用手寫 duplicate allowlist 漂移。
- Context-local `domain` / `contracts` / `application` 不得反向依賴同 owner 的 adapters、agents、testing、database 或 migration implementation；domain / contracts 也不得反向依賴 application。
- Browser client graph 不得可達 server-only、database、secret、Node-only private runtime 或 test fixture。
- 舊 persistence／LINE 路徑不可重新出現，避免 legacy 位置復活。

## 修改規則

修改 architecture guard 時必須同時具備：

1. 合法 consumer case。
2. 能直接暴露規則根因的違規反例。
3. 明確 owner / dependency direction 理由。
4. 不放寬 authorization、runtime isolation 或 package public surface。

Guard 失敗時先判斷是程式違反 architecture，還是 rule 已與採用架構不一致；禁止直接加入 blanket exception。

## Module exceptions

少數跨 feature Web dependency 以明確檔案 responsibility allowlist 表達，而不是允許整個 module。新增例外前先確認是否應改成 shared mechanism、application port 或外層 composition。

## Runtime safety

`.server.ts`、資料夾名稱或 TypeScript `type` import 本身都不是安全邊界；Guard 需要檢查實際可達 dependency graph，避免 client 透過間接或 type-only 路徑碰到 server responsibility。

## Verification entry

一般修改依 repository script 驗證；完整驗證由 `pnpm validate` 執行 architecture checks、反例與其他工程檢查。文件本身不宣稱某次 CI 已通過，具日期證據留 acceptance/history owner。
