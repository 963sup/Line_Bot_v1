# Domains / TLS

本入口預留 DNS、HTTPS、deployment alias 與 callback origin 的開發說明；不建立網域、修改 DNS 或切換流量。現行 alias readback 權威見 [Vercel](../../docs/reference/platform/vercel.md)。

- Domain ownership、DNS propagation、TLS 狀態、Production alias 與實際 Git SHA 分別驗證。
- Application origin、LINE／OAuth callback allowlist 與 Preview origin 的修改需沿實際 consumer 契約同步。
- Vercel hostname、接入自有網域與購買／續約網域是不同成本責任；Free 架構不代表網域註冊免費。

後續驗收：HTTPS、canonical redirect、callback origin、錯誤 host、alias 指向 exact deployment，以及切換後的 readback。發布與恢復見 [Deployments](../deployments/README.md)。
