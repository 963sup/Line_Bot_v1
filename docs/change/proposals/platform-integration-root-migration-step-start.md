# Platform integration root migration — Step Start：目標、權威與停止條件

Status: **PROPOSED / documentation-only**；stacked plan on **PR #413**, which itself depends on #412。**此文件不表示遷移已發生或已驗證**。
後續：[Step 1 — 全量盤點](./platform-integration-root-migration-step-1.md)。最後驗收：[Step End](./platform-integration-root-migration-step-end.md)。

## 唯一目標與命名
把版本庫**根部** `vercel/` 與 `supabase/` 中由本專案管理的檔案、設定與其 consumer 全部遷入已存在的兩個獨立 workspace：
- `packages/integration-vercel/`（`@line_bot_v1/integration-vercel`）。
- `packages/integration-supabase/`（`@line_bot_v1/integration-supabase`）。

使用者描述的 `packages-integration-vercel` / `packages-integration-supabase` 在本 RFC 一律解作上面的**實際路徑含斜線**，不建立根部同名連字號資料夾。完成時根部兩個 provider 資料夾應不存在；但 **`apps/web/vercel.json`、根部 `.vercelignore`、`.github/workflows/`、`scripts/`、`architecture/` 不屬這兩個根部資料夾**：它們是各工具必需的 host/guard 入口，保留在工具預期位置並改為消費 workspace 的公開契約。若實際平台規則阻止 root 移除，**阻擋切換、先證實可行路徑**，不做假成功。

## 第一性原理：只搬責任，不能搬走權威
1. **Business facts**：Contract/Content/WBS/Repository/Assistant/Intelligence/File/Expense 的業務授權、版本、replay、交易與 owner Port 不轉移給 integration。
2. **Platform facts**：Vercel AI SDK/Gateway 與 Supabase SDK/Storage transport、Supabase CLI 原生專案資產歸各自 integration；不要新增 `platform-provider-router` 或通用 repository/service。
3. **Schema truth**：原 `supabase/schemas` 是**唯一** PostgreSQL declarative current truth；新位置須更新 data topology 指向單一 schema root，SQL 內容及順序語意不變。不得複製兩套 schema、bucket desired-state 或 migration history。
   **完整遷移的必要部分：根部 `supabase/schemas/` 已存在的全部 109 份 `.sql` 必須逐檔原樣移至 `packages/integration-supabase/supabase/schemas/`（同時處理其中的 AGENTS/README），不能只遷移 Supabase SDK 或 `config.toml`。** 包含 `000_foundation.sql`、所有 `100–899` owner-authoritative SQL 及 `900–930` 跨 Owner 約束／交易／存取 SQL；不得漏一份、留第二份或因更名改變 schema 語意。
4. **Execution**：現有 LINE Webhook、Assistant 回覆／Issue 草稿、Expense receipt、File Processing、Intelligence→ContractDocument SAVE、Storage digest/readback、Release 的對外契約不變。未授權的遠端 mutation／AI 費用不得因文件方案而發生。
5. **Observability**：每一步提供可逆 git 變更與具體測試；`UNKNOWN`／request receipt 不能被重跑外部呼叫掩蓋。

## 分類規則（不做盲目 mv）
- **MOVE**：實際被 consumer 使用的根部 provider source／CLI 配置／原生 SQL、Storage 設定與相關測試。
- **UPDATE**：所有活動引用（imports、CLI workdir、架構映射、CI、upload allowlist、README、文件連結、檢查器）。
- **RETAIN AT HOST**：Vercel native host `apps/web/vercel.json`、`.vercelignore`、pnpm root lockfile、GitHub release workflow／tool drivers；僅更新其 *內容中的舊引用*，不為整齊而移錯路徑。
- **REMOVE AFTER PROOF**：根部 provider README 分類空殼及舊入口，確認沒有有效 consumer 後刪除；歷史 Git 證據留在 history。
- **REJECT**：雙重 schema、符號連結、無期限 alias、動態跨 package deep import、產生另一套 business truth。

## 執行順序與停止線
[Step 1](./platform-integration-root-migration-step-1.md) 盤點 → [2](./platform-integration-root-migration-step-2.md) Port/Package contract → [3](./platform-integration-root-migration-step-3.md) Vercel runtime → [4](./platform-integration-root-migration-step-4.md) Vercel 其餘文件/部署 → [5](./platform-integration-root-migration-step-5.md) Supabase client → [6](./platform-integration-root-migration-step-6.md) Supabase native/SQL → [7](./platform-integration-root-migration-step-7.md) 全 repo 切換 → [8](./platform-integration-root-migration-step-8.md) 驗收/刪根目錄 → [End](./platform-integration-root-migration-step-end.md)。

任何步驟遇到未知 consumer、不能證實 Supabase CLI workdir、Schema diff、正式環境 target mismatch、File integrity／授權語意變化、AI 類別／Contract schema 變化、Preview 失敗或 required check 紅燈，就**停止刪除舊路徑**，回到 last green commit，不能加冗餘兼容層硬闖。此系列是**邏輯驗收 gate**，不是第二套 Release 歷史或部署授權。
