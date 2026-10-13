# Line_Bot_v1
TypeScript / pnpm monorepo，使用 Next.js、LINE MINI App 與 Supabase，提供 Enterprise / Organization governance、Team collaboration、Repository / Issue 工作管理、Attendance、Expense、Notifications 等企業營運能力。
## 開始
Node / pnpm version 以 repository manifests 為準。

```sh
pnpm install --frozen-lockfile
pnpm tooling:doctor
pnpm dev
```

常用驗證：

| Command | Meaning |
| --- | --- |
| `pnpm check` | 日常 read-only validation |
| `pnpm validate` | merge/release full repository gate |
| `pnpm docs:check` | Markdown + local links |
| `pnpm test:browser` | local production Web + synthetic LINE/API |
## 找資訊
環境問題先看 [local environment](docs/reference/engineering/local-environment.md)。修改前用 `pnpm change:status` 檢查分支狀態、`pnpm change:impact "<intent>"` 找影響範圍；提交後依 [change lifecycle](scripts/changes/README.md) 更新 main reference，再執行 `pnpm change:finalize` 做合併前完整驗證。

不要先讀完整 architecture 文件。從 [docs task router](docs/README.md) 依任務載入最小上下文。

Machine-readable architecture入口在 [architecture/README.md](architecture/README.md)；source-of-truth 分工見 [docs/facts/sources-of-truth.md](docs/facts/sources-of-truth.md)。AI修改規則見 [AGENTS.md](AGENTS.md)。

本機 validation 不代表 Supabase remote convergence、Vercel deployment、LINE publication 或真機 acceptance。
