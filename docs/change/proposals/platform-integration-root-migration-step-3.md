# Platform integration root migration — Step 3：Vercel Gateway runtime 單一實作

Status: Vercel Gateway runtime 已由 PR #412 實施；完整 Preview／release acceptance 仍由 Step 8/End 驗收。上一階段：[Step 2](./platform-integration-root-migration-step-2.md)；下一階段：[Step 4](./platform-integration-root-migration-step-4.md)。
關聯（不取代）#413 的 [文件解析 Step 3](./document-owner-skeleton-reduction-step-3.md)。

## 待移動／淘汰的確切來源
- 活躍舊入口：`vercel/integrations/ai-gateway.mjs`，測試 `vercel/integrations/ai-gateway.test.mjs`；現行 consumer `scripts/intelligence/run.mjs`。
- 新入口：`packages/integration-vercel/src/adapters/outbound/ai-gateway/gateway.ts`、`gateway-config.ts`、`gateway-document.ts`，以及 Web `assistant.server.ts`、`expense.server.ts`、`files.server.ts`。
- 目標是**一個 SDK/provider transport 實作**、數個依真實 Port 分開的能力；不要保留新的/舊的平行 `createVercelAiGateway`。

## 最小遷移
1. 盤點舊 `file({bytes,mediaType,schema,...})` 參數、JSON parse/validate、錯誤、abort、model/credentials 與 retry 語意。將 **Contract-owned** `purchaseOrderExtractionSchema`（位於 `packages/contract/src/contracts/input/document-intake.ts`）透過 Intelligence public target schema 與公開 Gateway Adapter 提供給 operator CLI；要驗證 SDK `Output.object` 對實際 Schema／模型的支援。
2. **區分兩種輸出**：一般 `ProcessingRun` 保持 bounded observations；`DocumentIntake` 需完整 header/buyer/seller/lines/totals/terms/evidence/corrections，禁止套用 500 observations 截斷完整採購單。Contract 必須再驗證原始 schema，SAVE 只能產生 DRAFT，CONFIRM 仍需人工意圖。
3. `scripts/intelligence/run.mjs` 改 import `@line_bot_v1/integration-vercel` 的公開 export，搭配現有 Contract/Intelligence Port；確保 operator 在 Node/tsx 腳本環境可以 resolve dist，並在依賴圖中宣告 package。不得偷偷追加第二個 JS runtime Adapter。
4. 將舊 provider tests 遷到 integration-vercel 的測試套件（或現行 repository test owner），保留 bounded negative fixtures、invalid MIME、timeout、invalid JSON/schema、at-most-once attempt、已完成／UNKNOWN requestId 不再呼叫 provider、no implicit retry。
5. 證實前後 Assistant/Issue/Expense/Processing/Intake 的 DTO、觀測及失敗語意相同後，刪除 `vercel/integrations/ai-gateway.mjs` 與舊相依。不能先刪而使 CLI 走未測試 fallback。

## 驗收
在**mock provider**、現有 test runners 下比較所有 consumer；`pnpm intelligence:run` 的 receipt 操作不得依賴 AI 設定；只在獲批准且有成本／資料處理授權時才測實際 AI Gateway。任何 Contract 預期行數或 decimal 字串被改寫皆失敗。無舊 import、無另加 provider key、無可見 secret。
