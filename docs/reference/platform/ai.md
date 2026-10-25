# AI
## Responsibility
本文件描述外部 AI provider 呼叫的使用與成本控制；產品何時需要 AI、草稿如何進入業務流程由對應 module owner 決定。模型不能成為 authorization 或 system-of-record。

目前不把任何 quota、價格、模型上限或成本門檻寫成固定平台事實；這些需針對實際 provider / environment 查證。
## Implementation ownership

沒有全域 AI business owner；責任依實際 use case 分離：

- `vercel/integrations` 擁有 Vercel AI Gateway 的 AI SDK transport、model ID validation、media mapping、timeout 與零 retry 設定；它不是 workspace package，也不擁有產品語意。
- `@line_bot_v1/intelligence` 擁有文件理解的 processor identity、source/attempt recovery、prompt contract 與 untrusted-result boundary；host 從 `vercel/integrations` 注入 provider port，再透過接收端公開命令提交候選資料。
- `@line_bot_v1/assistant` 擁有 Assistant conversation、Issue draft 的 model Port、固定 liveness probe 與 server-only/config guard；它不保管 provider client 或 credential。
- `@line_bot_v1/contract` 擁有採購文件的結構、候選驗證與確認規則、版本及命令收據。Intelligence 不因解析成功取得正式確認權。
- `@line_bot_v1/file` 提供 exact source authorization/readback。ProcessingRun、RawResult/SavedResult 與其 replay/recovery 屬 Intelligence；File 不保存處理結果。
- Receipt 與其他產品 agent 仍屬各自 owner。

Provider adapter 不做 authorization、持久化或 business state transition，也不因共用 Provider 而取得另一個 Owner 的語意。
## Vercel AI Gateway

Vercel provider transport 統一位於 `vercel/integrations/`。Web、CLI 與產品 owner 只接收最窄的 text/file/model Port；Assistant、Intelligence 與 Expense 不得各自建立 SDK client、讀取 provider credential，或保留 Gemini fallback。

- `AI_GATEWAY_API_KEY`：可選的 Server-only Secret，適合本機或不具 Vercel OIDC 的 Runtime。由 [Vercel AI Gateway](https://vercel.com/docs/ai-gateway/authentication-and-byok/authentication) 建立 Key，再於 `mini-app-line` 專案 **Settings → Environment Variables** 設定；不得加 `NEXT_PUBLIC_`、寫入 log 或提交 Repository。
- `AI_GATEWAY_MODEL`：Server-side Model ID，不是 Secret。從 [AI Gateway Model Catalog](https://vercel.com/ai-gateway/models) 複製實際可用的 `provider/model` ID（例如 `google/gemini-2.5-flash` 僅作格式示例，使用前需核對 Catalog 與價格）。
- Vercel 部署可透過平台自動提供的 `VERCEL_OIDC_TOKEN` 使用 AI Gateway，無需另外建立 API Key。所有 AI 呼叫都要求 `AI_GATEWAY_MODEL`，並要求 `AI_GATEWAY_API_KEY` 或 `VERCEL_OIDC_TOKEN` 至少一項存在；未設定時 fail closed，不保留 Gemini 或跨 Provider fallback。
- 先在 Vercel **Preview** 設定，確認權限、模型供應商、隱私、用量與 Spending Limits，再決定是否啟用 Production。Gateway 可能產生額外模型費用；Provider 錯誤或 Quota Exhaustion 不自動跨 Provider 付費 fallback。
- Gateway 文字生成維持 600 Token 上限、10 秒 Abort Deadline、零 SDK 自動重試；這不代表已證明 Provider 費用上限或交付成功，仍需 Preview 真實模型及 Gateway Usage Readback。

## Decision unit
評估 AI 不只看單次 token price，而看「每件成功確認事項的總處理成本」與品質：

- provider input / output usage
- image / audio processing
- storage / transfer / messaging
- retries / failures / cancellations
- human review and correction time

分母為零時不計算單件成本，但仍保留總用量。免費 quota 仍記錄 usage；未知成本標示 unknown，不填零。
## Routing
先用第一性原理判斷這個 work 是否真的需要 AI，再用高手思維對照既有 deterministic solution / provider capability，追到成本或品質根因；最後用奧卡姆剃刀移除不必要的 model 參與：

| Work | Default path |
| --- | --- |
| qualification、authorization、state transition、deterministic calculation、structured query | rules / database / template；不呼叫模型 |
| explicit text/image extraction | user 明確提交後產生 draft / uncertainty |
| voice | 必要時先 transcription，再決定是否需要 model normalization |
| cross-record analysis | 先 authorization filter / deterministic aggregation，再只送必要摘要 |

普通聊天、未授權附件與背景資料不得因「可能有用」就預先送模型。
## Limits and retries
AI flow 要有明確：

- input / attachment / output limits
- retry limits
- total per-operation budget
- concurrency / duplicate request handling
- timeout / provider failure fallback

到達上限或 provider 失敗時停止新增 AI work，回到人工輸入或明確 retry；不無限重試，也不因 quota 不足自動切到更昂貴 provider。

Important source content 不能被靜默截斷後仍宣稱「完整分析」。
## Reuse
只有 source version、processing configuration 與 authorization scope 都相容時才能重用模型結果。來源改變、權限撤銷或 scope 不同時，舊結果不得跨使用者／團隊／專案命中。

模型結果是衍生資料；正式 record 仍需對應 use case 的人工確認或 deterministic validation。
## Measurement
記錄 feature、provider/model version、call/retry count、provider usage、media size、duration 與 result classification；不要為成本分析保存完整 prompt、正文、credential 或不必要 PII。

用授權樣本比較人工 baseline 與 AI flow 的：

- field accuracy / quality
- human correction
- rework
- latency
- total cost

如果沒有改善成本或品質，就縮小 AI 使用範圍，而不是先增加 routing framework。
## Adjacent owners
- Assistant product use cases：[Assistant](../../owners/assistant.md)
- File document understanding integration：[Intelligence](../../owners/intelligence.md)
- File evidence lifecycle：[File](../../owners/file.md)
- AI provider credential / platform setup：本 integration directory 的 provider-specific 文件
- Data retention：[Data](../README.md)
- Secrets：[Secret handling](../security/secrets.md)
- 未定成本／品質門檻：[Current gaps](../../change/gaps/)
