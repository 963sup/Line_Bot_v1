# Codex agents and MCP

這份文件只提供導覽；實際 agent 設定以 [`.codex/config.toml`](../../../.codex/config.toml) 為準，角色行為以各角色的 TOML 檔為準。不要在此建立第二份 agent catalog 或權限設定。

## Agent roles

目前角色依責任分工如下：

- [architect](../../../.codex/agents/architect.toml)：架構、模組邊界與依賴方向。
- [debugger](../../../.codex/agents/debugger.toml)：錯誤診斷與最小修正。
- [integration-validator](../../../.codex/agents/integration-validator.toml)：跨服務整合與驗證證據。
- [reviewer](../../../.codex/agents/reviewer.toml)：程式正確性、回歸與可維護性審查。
- [security-auditor](../../../.codex/agents/security-auditor.toml)：認證、授權、秘密與 RLS 審查。
- [test-engineer](../../../.codex/agents/test-engineer.toml)：行為、邊界與回歸測試缺口。
- [release-gatekeeper](../../../.codex/agents/release-gatekeeper.toml)：CI、branch protection、PR 與合併證據。
- [database-steward](../../../.codex/agents/database-steward.toml)：Supabase schema、RLS、migration 與 rollback。
- [observability-investigator](../../../.codex/agents/observability-investigator.toml)：Sentry、Vercel logs、trace 與 production evidence。
- [performance-cost-analyst](../../../.codex/agents/performance-cost-analyst.toml)：延遲、token、查詢、bundle 與 provider 成本。
- [accessibility-ux-auditor](../../../.codex/agents/accessibility-ux-auditor.toml)：UI accessibility、鍵盤流程、表單與錯誤狀態。
- [documentation-curator](../../../.codex/agents/documentation-curator.toml)：README、AGENTS、Serena README 與 durable memory routing。
- [contract-steward](../../../.codex/agents/contract-steward.toml)：public API、HTTP、event、provider 與 package contract 相容性。
- [e2e-journey-engineer](../../../.codex/agents/e2e-journey-engineer.toml)：完整瀏覽器與服務流程。
- [dependency-steward](../../../.codex/agents/dependency-steward.toml)：workspace dependency、lockfile、升級與供應鏈證據。
- [lifecycle-owner](../../../.codex/agents/lifecycle-owner.toml)：rollout、flag、backfill、deprecation 與 rollback 計畫。
- [data-quality-analyst](../../../.codex/agents/data-quality-analyst.toml)：Intelligence、Contract、WBS 資料品質與 provenance。

所有角色遵守 root [`AGENTS.md`](../../../AGENTS.md) 的 Serena v2 + LSP 優先規則。角色只在自身責任範圍內使用 MCP；未驗證的 hosted handshake、OAuth 或環境變數不可宣稱為可用。

## MCP usage

MCP 唯一設定來源是 [`.codex/config.toml`](../../../.codex/config.toml)。Serena v2 + LSP 優先用於 TypeScript／JavaScript 語義定位；其他 MCP 依角色與任務需要使用。Hosted MCP 的 Token／OAuth 不寫入 repository，實際可用性要以新 session 的 `/mcp` 與唯讀呼叫確認。

驗證設定與 hooks：

```sh
pnpm check codex:config
pnpm check hooks
```

完整 Serena 操作見 [`.serena/README.md`](../../../.serena/README.md)。
