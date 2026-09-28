# Documentation scripts

本目錄只驗證 documentation system；canonical product knowledge 仍由 `docs/` owner files 維護。

| Script | 用途 |
| --- | --- |
| `check-docs.mjs` | `pnpm docs:check`：檢查 docs routing、links、current/history/evidence placement 與治理 constraints。 |
| `check-docs.test.mjs` | 驗證 docs checker 能阻止 broken routing 與 invalid documentation state。 |

文件修改使用 `pnpm docs:check`；完整 merge evidence 仍由 `pnpm validate` 提供。修改規則見同層 `AGENTS.md`。
