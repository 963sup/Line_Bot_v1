# Vercel

Vercel 是 `apps/web` 的 Next.js deployment/runtime platform，不是 persistent business truth 或 Domain owner。

## Current boundary

- Web/API runtime owner 仍是 `apps/web`。
- Vercel configuration 以 repository 的 Web deployment config 與 Vercel project readback 為準。`apps/web/vercel.json` 保留 Preview Git deployment，但 `main` Git integration 不直接建立 Production deployment。
- Production mutation owner 是 root canonical command `pnpm vercel:deploy:production`／`scripts/vercel/deploy-production.mjs`。它只接受 explicit `--live` 與 exact 40-char SHA，先 read back 固定 team/project，再以 Vercel REST API 建立該 SHA 的 Production deployment，最後驗證 Production target、Git SHA 與 `mini-app-line.vercel.app` alias；mutation request outcome 不明時禁止盲目 retry。
- GitHub `Release` 只在同 SHA repository validation 成功，且 Supabase convergence 成功或本次無 schema change時，才把 step-scoped `VERCEL_TOKEN` 提供給 production adapter。因此 database contract failure 不得讓新 runtime 先接 production traffic。
- Deployment READY 只證明該 deployment 狀態與上述 provider readback，不證明 LINE、外部 API 或手機流程已驗收。
- Analytics / performance / error telemetry 若存在，只提供 production evidence；不得成 authorization 或 business state authority。

Deployment / release / recovery 程序見 [Operations](../070-operations/README.md)。
