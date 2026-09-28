# Live provider probes

本目錄所有 scripts 都是明確 live probe，不屬於 `pnpm check` / `pnpm validate`。root `probe:*` commands 已帶 `--live`；直接執行檔案時才需要手動授權。

| Script | 用途 |
| --- | --- |
| `check-agent.mjs` | 探測 Assistant/agent 的真實 provider path 與基本 response contract。 |
| `check-expense-card.mjs` | 驗證 Expense card 的真實 LINE/provider message path。 |
| `check-gemini.mjs` | 驗證 Gemini credential、model request 與最小 response contract。 |
| `check-line.mjs` | 驗證 LINE channel/provider credential 與可讀 API contract。 |
| `check-receipt.mjs` | 驗證 receipt/vision extraction 的真實 provider path。 |
| `check-redis.mjs` | 驗證 Redis connection 與 coordination/cache 所需 provider contract。 |

Probe 成功只證明該次 external path；不能替代 domain test、schema validation、deployment 或 device evidence。
