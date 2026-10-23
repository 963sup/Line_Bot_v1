# AI
## Responsibility
本文件描述外部 AI provider 呼叫的使用與成本控制；產品何時需要 AI、草稿如何進入業務流程由對應 module owner 決定。模型不能成為 authorization 或 system-of-record。

目前不把任何 quota、價格、模型上限或成本門檻寫成固定平台事實；這些需針對實際 provider / environment 查證。
## Implementation ownership
Gemini Developer API 的 SDK client、固定 liveness probe、server-only/config guard 由 `@line_bot_v1/assistant` 擁有，對外只透過 `@line_bot_v1/assistant/gemini` 公開。Receipt／Issue draft 等產品 agent 仍屬各自 owner；provider adapter 不做 authorization、持久化或 business state transition。
## Vercel AI Gateway (opt-in)

一般 Assistant 問答可以透過 `@line_bot_v1/assistant/gateway` 公開 Composition Entry 使用 AI SDK / Vercel AI Gateway。Private Provider Adapter 在 `packages/assistant/src/adapters/outbound/external-api/vercel-ai.ts`；`apps/web/src/app/api/_composition/assistant.server.ts` 選擇執行路徑。

- `AI_GATEWAY_API_KEY`：可選的 Server-only Secret，適合本機或不具 Vercel OIDC 的 Runtime。由 [Vercel AI Gateway](https://vercel.com/docs/ai-gateway/authentication-and-byok/authentication) 建立 Key，再於 `mini-app-line` 專案 **Settings → Environment Variables** 設定；不得加 `NEXT_PUBLIC_`、寫入 log 或提交 Repository。
- `AI_GATEWAY_MODEL`：Server-side Model ID，不是 Secret。從 [AI Gateway Model Catalog](https://vercel.com/ai-gateway/models) 複製實際可用的 `provider/model` ID（例如 `google/gemini-2.5-flash` 僅作格式示例，使用前需核對 Catalog 與價格）。
- Vercel 部署可透過平台自動提供的 `VERCEL_OIDC_TOKEN` 使用 AI Gateway，無需另外建立 API Key。**`AI_GATEWAY_MODEL` 存在，且 `AI_GATEWAY_API_KEY` 或 `VERCEL_OIDC_TOKEN` 至少一項存在**時，普通問答改走 Gateway；否則保留 `GEMINI_API_KEY` + `GEMINI_MODEL` 路徑。`/agent` Issue Draft、Gemini Probe 與 Receipt 不跟著切換，仍使用原本 Gemini 設定。
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
- AI provider credential / platform setup：本 integration directory 的 provider-specific 文件
- Data retention：[Data](../README.md)
- Secrets：[Secret handling](../security/secrets.md)
- 未定成本／品質門檻：[Current gaps](../../change/gaps/)
