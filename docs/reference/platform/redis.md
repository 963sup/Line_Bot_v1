# Redis

Redis 只承接有限 TTL 的協調責任，例如 rate limiting 與 Webhook claim。PostgreSQL 仍是 business idempotency、ledger、Member qualification 與 durable record authority。

## Current implementation ownership

`@line-work/platform` 擁有 Redis coordination implementation 與 `@line-work/platform/adapters/redis` public surface。這個 Module Boundary 不改變 PostgreSQL 的 durable business authority、Redis key/TTL 語意或任何 Supabase Data Boundary。

## Data boundary

Redis key 使用 scope + hashed identifier；不保存 raw token、完整聊天內容、Member private data、Coin ledger 或 receipt body。正式 key 必須有 TTL，並以 environment-specific prefix 隔離測試與正式用途。

`KV_REST_API_URL` 與 `KV_REST_API_TOKEN` 是 current server-only Redis connection contract，直接對齊此專案的 Vercel Marketplace resource。Runtime 只以 HTTPS REST transport 執行 bounded Redis commands。Key namespace 由可信 deployment class 推導 `line-bot:<environment>`（Vercel 使用 `VERCEL_ENV`，其他 runtime 使用 `NODE_ENV`），probe 另使用隨機 synthetic namespace。

## Webhook claim

Webhook 在 signature verification 與 basic event filtering 後，可以使用 channel scope + webhook event ID 的 hash key 進行原子 claim。

概念狀態：

- `pending`：目前 owner 正處理。
- `completed`：保存有限、可重播的 HTTP transport result。

完成更新要核對 owner token；過期舊 worker 不得覆蓋較新的 claim。Pending request 不冒充成功，Redis unavailable 在必要 claim flow 中要明確失敗，不退回 process-local Map 宣稱跨 instance guarantee。

Finite TTL、eviction、service loss 或 process crash 都表示這不是 exactly-once。Durable business command 仍由 PostgreSQL requestId / fingerprint / version 保護。

## Rate limiting

Rate limit 使用 atomic update + TTL，個別與 shared scope 可以分開。Repository 內任何目前數字都只是初始 configuration / test baseline，不是 production capacity 或 SLA。

超限 `429` 不等於 WAF、abuse prevention 或 billing hard limit；更換 token / identity 可能改變個別 scope，因此不能把單一 Redis counter 當完整安全模型。

## Failure behavior

- Redis REST operation 有 2.5 秒 bounded timeout 與 5 秒 cooldown，不無限排隊。Failure 只記錄固定 non-secret code（configuration/authentication/provider_rate_limited/provider_unavailable/provider_error/invalid_response/timeout/cooldown/transport），不記 endpoint、token 或 provider response body。
- External business result 不因 Redis cache loss 被改寫。
- Webhook claim / rate-limit failure behavior 必須明示，不靜默跳過 protection。
- Retry / reconnect 使用有界退避；不自動掃描正式 key 或執行 destructive `FLUSHDB`。

## Verification

測試使用 injected transport／synthetic namespace，覆蓋 REST command mapping、bounded timeout/cooldown、TTL、multi-instance single winner、completed replay、stale owner reject、expiry recovery 與 provider failure classification；production 沒有 insecure Redis toggle。

Repository probe `scripts/probes/check-redis.mjs` 會建立/刪除測試 key，屬外部操作，執行前確認環境與授權。

- Cache / TTL semantics：[Cache and projections](../040-data/060-cache-and-projections.md)
- LINE webhook usage：`../010-line/030-messaging/webhook.md`
- Production readiness：`../../090-governance/040-gaps/runtime-and-platform.md`
