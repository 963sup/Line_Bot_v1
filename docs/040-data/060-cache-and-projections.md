# Cache and projections

Cache 是可丟棄的衍生資料／效能機制，不是 business authority。任何 cache 在加入前都必須先回答 source of truth、key/scope、TTL、invalidation、stale behavior、authorization 與 failure fallback。

## 現行 baseline

目前 private business Web/API flow 採保守策略：

- 共用 JSON response helper 對 private API 回應使用 `Cache-Control: no-store`。
- 多個 browser feature fetch 明確使用 `cache: "no-store"`。
- LINE identity 與 Google request 等需要即時外部驗證的 request 不依賴 response cache 作 authority。
- 目前產品 source 沒有使用 Next.js `use cache` 建立 business data cache。

這代表「目前沒有被證明需要的 application business cache」，不是宣稱 framework、CDN、browser 或 static asset 完全不存在任何 cache。

## Next.js boundary

目前 Web 使用 Next.js 16.x。Cache 行為必須由資料 owner 明確 opt in；新增 `use cache`、remote cache handler、`force-cache`、tag / lifetime 等機制時，要把它視為一個資料契約變更，而不是純效能參數。

特別是 private business data，不得因框架 cache 命中而跳過目前 identity、qualification、scope 或 permission 檢查。若 cache value 與 actor / tenant / scope 有關，key 必須能區分真正隔離邊界，且 invalidation 必須涵蓋 permission / membership / version 變更。

## Redis boundary

Redis 目前只承擔被明確採用的短效 coordination、event claim、cooldown / rate-limit 類責任。Redis key、TTL 或存在性不等於 Member、ledger、Task、Attendance、Expense 等 durable business truth。

需要 Redis 作 read cache 時必須另定 source、rebuild、stale tolerance 與 outage behavior；不能把現有 coordination key 默認升格成 cache layer。

## Browser state

`sessionStorage`、React state 或 browser cache 可以協助 UI continuity，但不能成為：

- durable replay receipt
- permission / role authority
- server version authority
- transaction result authority
- cross-device recovery source

清除 browser state 不得使 server-side idempotency 或 business history 消失。

## 新 cache 最小契約

新增 cache 前至少記錄：

1. authoritative source 與 consumer。
2. cache key 是否包含真正的 identity / scope / version 維度。
3. TTL 或 lifetime 的 business 理由。
4. write / permission / membership 變更後如何 invalidation。
5. stale value 最壞會造成什麼結果；是否只能顯示、還會影響 command。
6. cache miss / outage 時是否安全回源，還是應拒絕。
7. cache 是否跨 instance / deployment；若不是，consumer 是否能接受。
8. 如何量測 cache 帶來的實際 latency / load 改善。

若上述問題沒有答案，優先不加 cache。

## 相鄰 owner

- Durable persistence：[Persistence model](020-persistence-model.md)
- Redis integration：[Redis](../030-platform/030-redis.md)
- Runtime boundary：[Runtime architecture](../020-architecture/050-runtime-architecture.md)
- Quality priorities：[Quality attributes](../020-architecture/060-quality-attributes.md)
