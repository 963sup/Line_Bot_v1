# 專案腳本

`package.json#scripts` 是人、Agent、CI 共用的 public command surface；`scripts/` 是 private repository-operation implementation。CLI 只負責 deterministic operation orchestration，不承擔產品 domain rule 或第二份 source of truth。

- 一般 command 從 repository root 執行；完整 merge validation 使用 `pnpm validate`。
- Read-only validation、live probe、local mutation、remote mutation 的 evidence 分開。
- 每個子目錄都必須有 `README.md`，清楚列出該 scope 每個 executable/test 的用途；`tooling:check` 會驗證此 invariant。
- 外部 provider mutation 必須 explicit authorization + exact target + bounded failure + post-write readback。
- 修改 script 時同步更新 command surface、測試、validation routing、workflow 與該目錄 README。

| 目錄 | 責任 |
| --- | --- |
| `architecture/` | Machine-readable architecture compile/query/validation。 |
| `attendance/` | Attendance maintenance worker / scheduler operation。 |
| `browser/` | 可重跑的本機 production-Web browser probes。 |
| `changes/` | Change status/preflight/finalize 與 deterministic patch application。 |
| `docs/` | Documentation validation。 |
| `github/` | GitHub readback 與 Release affected-source routing。 |
| `line/` | LINE provider operation adapters；目前包含 `rich-menu/`。 |
| `probes/` | Explicit live provider/function probes。 |
| `runtime/` | Environment/runtime bootstrap helpers。 |
| `supabase/` | Declarative schema local/remote operations，無 migration history。 |
| `tooling/` | Validation/toolchain governance 與 developer doctor。 |
| `vercel/` | Controlled Vercel production deployment adapter。 |

## 高頻開發入口

```text
pnpm tooling:doctor
pnpm change:status
pnpm change:impact "<intent>"
pnpm change:preflight
pnpm check
pnpm change:finalize
```

`change:impact` 只是 `pnpm semantic plan` 的 ergonomic alias；semantic impact authority 仍位於 architecture semantic system。正式 Rich Menu 圖片位於 `assets/line/rich-menu/`，不與 scripts 混放。
