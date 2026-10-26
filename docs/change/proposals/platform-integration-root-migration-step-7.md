# Platform integration root migration — Step 7：全 repo import／配置／語意文件一次收斂

Status: PROPOSED。上一階段：[Step 6](./platform-integration-root-migration-step-6.md)；下一階段：[Step 8](./platform-integration-root-migration-step-8.md)。

## 覆蓋範圍（不限 TS import）
在真正雙 provider root 搬完後，活動引用必須全部切到：
- Vercel runtime：`@line_bot_v1/integration-vercel/<declared-export>`；原 `../../vercel/integrations/`、舊 .mjs provider 及 private src deep imports 不再使用。
- Supabase SDK runtime：`@line_bot_v1/integration-supabase/<declared-export>`；provider native config/SQL **使用** `packages/integration-supabase/supabase/` 作唯一位置，**不是以 JS package export** 讀 SQL。
- 保留 `apps/web/vercel.json`、`.vercelignore`、`.github/workflows`、root pnpm lockfile 與 release scripts 在原生 host／tool 入口。各自其內容若引用舊 `vercel/` / `supabase/`，必改新位置。

### 具體待核對項
| 範圍 | 需同步 |
| --- | --- |
| Application / operators | `apps/web/src/app/api/_composition/*`、`scripts/intelligence/run.mjs`、File/Expense/Assistant/Intelligence 專用進入點 |
| Package metadata | `package.json`、workspace manifests/lockfile、`exports`、tsconfig、Turbo graph、Node scripts build-before-run、`.vercelignore` |
| Schema platform | `scripts/supabase/*`、`supabase` CLI workdir、schema planner/checker/SQL test fixtures、Storage Bucket exact readback |
| Architecture | `architecture/implementation-topology.json`、`semantic-model.json`、`data-topology.json`、可能受影響的 locators / relations；執行 `pnpm semantic package-docs` 產生 canonical projections |
| Docs / protection | `packages/*/AGENTS.md` / `SEMANTICS.md`、`docs/owners`、`docs/reference/platform/*`、Release/Recovery docs、`.github/workflows/*`、ignore 規則、deployment tests |
| Historical evidence | 過去 commit/PR/記錄的舊路徑只可作**歷史證據**，不得被執行期查詢或舊 README 鏈結誤當 current truth |

## 檢查方式
對 tracked files 跑可重現、**嚴格區分活動引用與歷史敘述**的舊路徑掃描；不得只用字串替換（會破壞 URL、SQL path 與語意警告）。需要明列 acceptlist 的僅有永久 Git history/references 或本 RFC 的「舊路徑」對照敘述；可執行 code/config/test/current docs 無舊 root literal 或 fallback。

更新 scripts/architecture 和 guard，保留/加上負面測試：根部雙 provider 資料夾重新出現、引用舊 provider import、新 native config 同時存在兩份、schemaRoot 不匹配、Vercel uploader 排除 integration package，皆應 fail-closed。

驗收：每個 Step 1 matrix consumer 有且只有一個新指向；全部 public exports 可解析、docs:check 沒斷鏈，沒有重新引入 runtime 所有權或資料庫 schema 雙真相。
