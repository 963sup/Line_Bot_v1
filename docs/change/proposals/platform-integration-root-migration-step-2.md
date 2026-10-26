# Platform integration root migration — Step 2：Package、Port 與權威契約

Status: 平台 package boundary 已由 PR #412 實施；業務 Owner 深化與後續 Document Owner gates 不由本 PR 宣稱完成。上一階段：[Step 1](./platform-integration-root-migration-step-1.md)；下一階段：[Step 3](./platform-integration-root-migration-step-3.md)。

## 必要最小結構
```text
apps/web/                     # composition + native apps/web/vercel.json
packages/assistant/           # owns Assistant application policy
packages/intelligence/        # owns Processing/Attempt + target schema handoff
packages/contract/             # owns ContractDocument SAVE/CONFIRM
packages/file/                 # owns FileRevision, digest, readback, authorization
packages/integration-vercel/
  package.json
  src/gateway.ts               # shared public facade
  src/gateway-config.ts         # model/auth config
  src/gateway-document.ts       # provider document transport, private unless real consumer needs export
  ...                         # other **proven** provider adapter code
packages/integration-supabase/
  package.json
  src/storage-client.ts         # private Storage client config, existing
  supabase/config.toml          # native CLI expects a nested supabase/ folder
  supabase/schemas/*.sql        # declarative SQL, not package TS source
  supabase/...                 # other qualified original CLI assets
```
**不**建立根部 `packages-integration-*`。仍由現有 `pnpm-workspace.yaml` 的 `packages/*` 選取兩個 package；除非真有新的 workspace 範圍，禁止改成深層 wildcard。

## 嚴格依賴方向
- `apps/web`、受信任 operator composition 可以 import **公開** `@line_bot_v1/integration-vercel/*`、`@line_bot_v1/integration-supabase/*`。
- 業務 package 只宣告其可測試 Port。Integration 可實作業務 Port 並在自己的 manifest 宣告 workspace type dependencies；若有 cycle，先拆出 owner 的公共 contract 而非跨越私有目錄。
- 既有 File adapter 可能依賴 Integration 的**中立 client transport**，必須證明沒有 Service Role、Bucket 內部政策或 raw SDK 進入 Domain。依賴方向由 `architecture/implementation-topology.json` 明列。
- `integration-vercel` 不依賴 `integration-supabase`；兩者不 import Contract/Content/WBS 私有 SQL。沒有 provider router、shared integration mega-package、模糊 `any`。
- `package.json#exports` 明確可執行 `./dist/*.js` 與 types，維持 Node ESM / `tsx`、build-before-use；不要依賴 `../../packages/.../src` 逃逸測試。

## 不得破壞的外部契約
Vercel：Assistant text、Issue draft、Expense receipt 文字回應格式、一般 Intelligence `IntelligenceProcessor` 的 `id/version/kind/supports/run`、Contract Intake target-owned Schema 與 request attempt at-most-once。**不要把 observations v1 當 Contract 完整採購單。**
Supabase：File original bytes／SHA-256／readback、單一 private bucket、actor/Repository scope 與 SQL 交易／RLS、原生 CLI declarative schema、Release remote main-only gate。
共同：敏感值不出現在 logs、browser、NEXT_PUBLIC_*、提交檔或測試產物。

驗收：exports 及 workspace manifests 可獨立 typecheck；`pnpm boundaries`/architecture 與 dependency graph 無 cycle；不增加沒有實際 consumer 的 facade。
