# Caching / delivery

本入口涵蓋 CDN、static assets、image optimization 與 application cache；資料權威與現行 baseline 見 [Cache and projections](../../../../docs/reference/data/cache.md)。本次不改 cache directives 或 response headers。

- 區分 browser、CDN、Next.js data cache 與 runtime cache；同一部署成功不代表各層一致失效。
- Private business API 沿用既有 `no-store` baseline；新增 cache 前定義來源、scope／version key、TTL、失效與回源行為。
- 圖片來源、尺寸、轉換次數與流量需有實際 consumer 及量測；不建立第二個 File 原檔儲存權威。
- Cache 不能保存授權決策作永久通行證，撤權後仍需維持 [Request authorization](../../../../docs/rules/request-authorization.md)。

後續驗收：跨 actor／scope 隔離、更新／撤權後失效、部署切換、cache miss／outage 與實測 latency／usage。
