# System facts

LINE Work Assistant 是 LINE-first 的 Enterprise Workforce & Operations Management system。Next.js / Vercel 提供 application host，Supabase PostgreSQL 保存 authoritative application data；LINE、Google、AI、Redis 等只在各自 integration/mechanism boundary提供能力。

```text
LINE / Browser
→ Next.js / Vercel
→ owner Application / Domain
→ PostgreSQL

External capability
→ integration / adapter
→ owner use case
```

UI、provider proof、cache、projection、telemetry 都不能取代 business authority。

Current owner / capability / locator / lifecycle 不在本文件列舉；查 `architecture/semantic-model.json` 或 `pnpm semantic ...`。不可從 module存在推定 capability已啟用。
