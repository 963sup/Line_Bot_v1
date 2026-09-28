# Packages router

`packages/` 保存此 repository 的正式 Module Boundaries。

業務語意與所有權以 [Semantic model](../architecture/semantic-model.json) 為權威；實作路徑與依賴許可邊界以 [Implementation topology](../architecture/implementation-topology.json) 為機器真理。

## Package 分類與職責

| 分類 | Packages | 角色與邊界原則 |
| --- | --- | --- |
| **Application Host** | `apps/web` | 頂層 Presentation / App Router 宿主。只允許依賴開放之 Application 與 Domain packages，不直接碰觸封裝帳本或未啟用領域。 |
| **Application Module** | `@line_bot_v1/explore` | 跨領域聚合視圖（Trending / Activity / Lists）。無獨立資料權威，由 Repository 概念派生。 |
| **Identity & Access** | `@line_bot_v1/account`<br>`@line_bot_v1/namespace`<br>`@line_bot_v1/identity-access` | 全域 User / Organization Login 命名空間、身分憑證與 Enterprise/Org/Team 角色授權。 |
| **Governance & Team** | `@line_bot_v1/enterprise`<br>`@line_bot_v1/organization`<br>`@line_bot_v1/team` | 企業治理、組織成員資格、組織團隊結構與指派。 |
| **Work & Planning** | `@line_bot_v1/repository`<br>`@line_bot_v1/project`<br>`@line_bot_v1/notifications` | 儲存庫容器、Issue / Discussion、ProjectV2 企劃清單與通知遞送參考。 |
| **Operations & Assets** | `@line_bot_v1/attendance`<br>`@line_bot_v1/daily-check-in`<br>`@line_bot_v1/expense`<br>`@line_bot_v1/partners`<br>`@line_bot_v1/asset`<br>`@line_bot_v1/wallet` | 打卡出勤、每日簽到、費用報銷、外部合作夥伴、資產定義與使用者錢包餘額。 |
| **Encapsulated Ledger** | `@line_bot_v1/ledger` | **內部一致性邊界**。複式記帳底層帳本，僅供 `wallet`、`attendance`、`daily-check-in` 內部依賴；**禁止 Web 直接依賴**。 |
| **Integration & Adapters** | `@line_bot_v1/assistant`<br>`@line_bot_v1/line-channel`<br>`@line_bot_v1/google-workspace`<br>`@line_bot_v1/platform` | 外部通道（LINE Channel、Google Workspace）通訊協定適配與中立平台運行機制。 |
| **Reserved / Foundation** | `@line_bot_v1/audit`<br>`@line_bot_v1/payroll`<br>`@line_bot_v1/workforce` | 架構保留模組。在真實業務契約與 Consumer 建立前維持 inactive，不提早引入 Web 耦合。 |

## 開發與修改契約

1. **依賴單向性**：跨 Package 呼叫必須列於 `architecture/implementation-topology.json#allowedWorkspaceDependencies`，並由 Dependency Cruiser 自動守門。
2. **公開介面**：跨 Package 只能使用各 Package 的 `package.json#exports`；禁止透過相對路徑穿透私有內部檔案。
3. **無第二套真理**：子目錄 `packages/<owner>/AGENTS.md` 僅能增加該 Owner 本地約束；`packages/<owner>/README.md` 僅負責該模組內部導引。
4. **驗證指令**：
   - 邊界檢查：`pnpm boundaries`
   - 型別與語意：`pnpm check`
   - 完整交付：`pnpm validate`
