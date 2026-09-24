# Vercel

Vercel 是 `apps/web` 的 Next.js deployment/runtime platform，不是 persistent business truth 或 Domain owner。

## Current boundary

- Web/API runtime owner 仍是 `apps/web`。
- Vercel configuration 以 repository 的 Web deployment config 與 Vercel project readback 為準。
- Deployment READY 只證明該 deployment 狀態，不證明 Supabase、LINE、外部 API 或手機流程已驗收。
- Analytics / performance / error telemetry 若存在，只提供 production evidence；不得成 authorization 或 business state authority。

Deployment / release / recovery 程序見 [Operations](../070-operations/README.md)。
