# Runtime helper scripts

本目錄只處理 repository/runtime 啟動與 environment adapter，不擁有 application business behavior。

| Script | 用途 |
| --- | --- |
| `bounded-output.mjs` | 共用 repository command 的完整 ignored log 保存與固定上限診斷片段；命令摘要由各 Owner 決定。 |
| `load-env.mjs` | 從 repository root 載入允許的 environment files，提供 scripts 共用 deterministic env bootstrap。 |
| `load-env.test.mjs` | 驗證 env load precedence、path 與禁止覆寫等行為。 |
| `next.mjs` | Next.js runtime wrapper，確保 Web command 在 repository 約定的 environment/bootstrap 下啟動。 |
| `internal-input.mjs` | 解析 bounded stdin、驗證 LINE identity，並從目前 User qualification 取得 actor。 |
| `internal-input.test.mjs` | 離線驗證 stdin 邊界與輸入錯誤型別；CLI subprocess tests 覆蓋 identity 與 qualification。 |
| `internal-failure.mjs` | 共用 Contract/Execution CLI 的安全錯誤分類，只投影 status/code；業務錯誤仍由各 Owner 定義。 |
| `cli-test-preload.mjs` | 僅供 CLI subprocess tests 使用的 Node module hooks，替代 provider、database 與 workspace build。 |
| `cli-subprocess-test-helper.mjs` | 僅供 Contract/Execution tests 啟動真實 CLI entry point 並讀取 JSON 結果。 |

Consumer 應優先使用 root `package.json#scripts`，除非正在開發 private runtime helper。

## Contract and Execution failures

Both CLIs write one failure object `{ok:false,error,status,code}` to stderr and exit with status 1.
The `error` text is fixed per CLI; caught messages, stacks, credentials and provider payloads are never printed.
`classifyInternalFailure` accepts each CLI's public Owner error class, without enumerating business codes.

| Phase | Result |
| --- | --- |
| Invalid stdin or operation | `400 INVALID_INPUT` |
| Invalid LINE proof | `401 UNAUTHENTICATED` |
| Missing or inactive current User | `403 FORBIDDEN` |
| Pre-dispatch or read infrastructure failure | `503 UNAVAILABLE` |
| Typed error from that CLI's Owner | Owner `status` and `code` |
| `execute` starts, then Owner `UNAVAILABLE` or an untyped failure occurs | `503 UNKNOWN_RESULT` |

`UNKNOWN_RESULT` does not prove rollback or absence of a write. Read back state and, only when needed,
replay the exact canonical command with the same actor and request ID. Do not create a new request ID
or automatically retry; the Owner's authorization and replay rules decide the result.
