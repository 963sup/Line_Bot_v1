# AI

## Responsibility

本文件描述外部 AI provider 呼叫的使用與成本控制；產品何時需要 AI、草稿如何進入業務流程由對應 module owner 決定。模型不能成為 authorization 或 system-of-record。

目前不把任何 quota、價格、模型上限或成本門檻寫成固定平台事實；這些需針對實際 provider / environment 查證。

## Current implementation ownership

Gemini Developer API 的 SDK client、固定 liveness probe、server-only/config guard 由 `@line-work/assistant` package-private implementation 擁有，對外只透過 `@line-work/assistant/adapters/gemini` 公開。Receipt／Issue draft 等產品 agent 仍屬各自 owner；provider adapter 不做 authorization、持久化或 business state transition。

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

- Assistant product use cases：[Assistant](../010-domain-owners/120-assistant.md)
- AI provider credential / platform setup：本 integration directory 的 provider-specific 文件
- Data retention：[Data](../040-data/README.md)
- Secrets：[Secret handling](../050-security/050-secret-handling.md)
- 未定成本／品質門檻：`../../../090-governance/040-gaps/`
