# Line_Bot_v1
TypeScript / pnpm monorepo，使用 Next.js、LINE MINI App 與 Supabase，提供 Enterprise / Organization governance、Team collaboration、Repository / Issue 工作管理、Attendance、Expense、Notifications 等企業營運能力。
## 開始
Node / pnpm version 以 repository manifests 為準。

```sh
pnpm install --frozen-lockfile
pnpm dev
```

常用驗證：

| Command | Meaning |
| --- | --- |
| `pnpm lint` | Biome static validation |
| `pnpm typecheck` | workspace TypeScript validation |
| `pnpm test` | workspace tests |
| `pnpm build` | workspace production builds |
| `pnpm exec knip` | official Knip reachability check |

依變更範圍執行上列 package scripts；typecheck 與測試的併發設定由 workspace scripts 擁有，避免 PGlite／WASM 測試互相競爭。
## 找資訊
環境問題先看 [local environment](docs/reference/engineering/local-environment.md)。修改前用 Git、`rg`、nearest `AGENTS.md` 與相關 package exports 找影響範圍；提交前執行受影響的 lint、typecheck、test 與 build。

不要先讀完整 architecture 文件。從 [docs task router](docs/README.md) 依任務載入最小上下文。

Machine-readable architecture入口在 [architecture/](architecture/)；source-of-truth 分工見 [docs/facts/sources-of-truth.md](docs/facts/sources-of-truth.md)。AI修改規則見 [AGENTS.md](AGENTS.md)。

本機 validation 不代表 Supabase remote convergence、Vercel deployment、LINE publication 或真機 acceptance。
