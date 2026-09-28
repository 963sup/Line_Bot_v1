# Runtime helper scripts

本目錄只處理 repository/runtime 啟動與 environment adapter，不擁有 application business behavior。

| Script | 用途 |
| --- | --- |
| `load-env.mjs` | 從 repository root 載入允許的 environment files，提供 scripts 共用 deterministic env bootstrap。 |
| `load-env.test.mjs` | 驗證 env load precedence、path 與禁止覆寫等行為。 |
| `next.mjs` | Next.js runtime wrapper，確保 Web command 在 repository 約定的 environment/bootstrap 下啟動。 |

Consumer 應優先使用 root `package.json#scripts`，除非正在開發 private runtime helper。
