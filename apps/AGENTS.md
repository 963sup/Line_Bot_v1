# Application delivery boundary

`apps/` 擁有 application host、delivery 與 composition；business authority 仍在 `packages/<owner>`。頁面、API、route group、Bottom Navigation 或 provider session 都不建立新的 Domain owner。

## Boundary

- 正式 route / HTTP entry 只做 transport、layout、presentation 與最外層 dependency composition；不複製 owner use case。
- Web feature module 可以呈現 owner capability，但不得取得另一 owner 的 private model、table 或 authorization。
- `shared` 只保存真正跨 feature 且無 business authority 的 Web mechanism；多處引用本身不是 shared evidence。
- Browser state、URL、query、layout 與 navigation intent 不授權；protected operation 由 server 重新建立可信 Principal / qualification / scope。

Current URL、route partition、app-shell 與 runtime contract 以 [Web runtime](../docs/reference/runtime/routes.md) 加實際 `apps/web/src/app` source 為準；本檔不複製 route inventory。

## External benchmarks

GitHub-like FPT 只提供 resource / relationship / locator / lifecycle 的 semantic benchmark；pinned provenance 與採用狀態分別由 [Semantic benchmark](../architecture/semantic-benchmark.json) 與 [Semantic model](../architecture/semantic-model.json) 擁有。GitHub Mobile 只可作 UX / information hierarchy benchmark，不能從上游畫面推導本產品的 owner、permission、route 或已啟用 capability。

## Nested routing

| Scope | Responsibility |
| --- | --- |
| [Web](web/AGENTS.md) | Next.js/runtime 入口 |
| [app](web/src/app/AGENTS.md) | URL、route group、delivery、composition |
| [modules](web/src/modules/AGENTS.md) | Feature presentation / interaction / HTTP projection |
| [shared](web/src/shared/AGENTS.md) | 無 business authority 的共用機制 |

先讀父層，再沿目標路徑讀最近 AGENTS；子檔只補 local invariant。

## Change rules

1. 先核對現行 route、consumer、owner public contract、tests、trust boundary 與 current capability status。
2. URL / entry 變更同步 page/route、Link/back、login/LIFF continuation、Rich Menu entry、tests 與 canonical locator；已發布 URL 先查 consumer/compatibility。
3. Owner / capability 語意改變時先修 `architecture/semantic-model.json`；module dependency/path 改變才修 `implementation-topology.json`。
4. 未啟用能力不得用 fake data、disabled shell 或空 route 冒充完成。
5. 文件變更跑 `pnpm docs:check`；app/tooling 變更依 root validation contract。Git push 不等於部署或 LINE/device acceptance。
