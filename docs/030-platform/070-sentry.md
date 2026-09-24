# Sentry

Sentry 是 `apps/web` 的 Next.js runtime observability integration，只負責 unexpected exception evidence 與 source-map-backed stack traces；它不是 Domain capability、audit log、business metric 或 authorization source。

## Responsibility

- Vercel Analytics：aggregate page usage。
- Speed Insights：browser real-user performance。
- Sentry：browser / Node runtime exceptions 與 source maps。
- Vercel Runtime Logs：server runtime output。

Domain/Application packages 不 import `@sentry/nextjs`。Sentry framework entrypoints 固定在 Next project root：`apps/web/instrumentation.ts`、`apps/web/instrumentation-client.ts`、`apps/web/sentry.server.config.ts`；UI error boundary 為 `apps/web/src/app/global-error.tsx`。不在 `src/` 重複 framework entrypoint，避免 Vercel/Next build root resolution 與 repository source 產生雙重位置。現有 routes 使用 Node runtime，沒有真實 Edge consumer，因此不建立 `sentry.edge.config.ts`。

Server request error有兩條互補 capture path：未被 application catch 的 framework/request error 由 `instrumentation.ts:onRequestError` 交給 Sentry；被 API/Webhook catch 並轉成 5xx 的 error 必須在原 catch boundary 呼叫 `src/shared/observability/server-error.ts`。4xx／409／429 等 expected request/domain failure 不送 Sentry。Handled 5xx 只附加 bounded `service`、`operation`、`http_status`、`handled` tags；不附加 actor、resource id、provider subject、request/body/header 或任意 extra payload。Public HTTP contract 繼續由 owning module 決定，不把 Sentry event id 或 infrastructure detail 當 API contract。

## Privacy boundary

`src/shared/observability/sentry-policy.ts` 是 Sentry telemetry privacy owner。事件不得送出 user/extra payload、request headers、cookies、body、query string、request env、request URL 或 transaction name；breadcrumbs 關閉。這避免 dynamic pathname 夾帶 record identifier。保留 exception/stack、HTTP method、runtime/release 等除錯證據。

Sentry v10 `dataCollection` 同時關閉 user info、HTTP bodies/headers/cookies/query params、GraphQL document/variables、GenAI inputs/outputs、database query data、queues、file paths、stack frame variables 與 surrounding source context。

## Vercel activation

Vercel Marketplace Sentry integration 擁有 `SENTRY_ORG`、`SENTRY_PROJECT`、`SENTRY_AUTH_TOKEN` 與 `NEXT_PUBLIC_SENTRY_DSN`。Repository 不在 `.env.example` 複製 platform-owned values。

Browser SDK 使用 Vercel 提供的 `NEXT_PUBLIC_VERCEL_ENV` 標記 `production` / `preview` environment，避免 Preview browser errors 與 Production 混在同一個 Sentry environment；非 Vercel build 才退回 `NODE_ENV`。

`SENTRY_ORG` / `SENTRY_PROJECT` 進 Web build hash；`SENTRY_AUTH_TOKEN` 只作 Turbo pass-through credential，不進 cache key。只有三個 build values 都存在時 `next.config.ts` 才啟用 Sentry build plugin/source-map upload。因 `@sentry/cli` 的 postinstall 供 source-map CLI binary setup 使用，`pnpm-workspace.yaml` 只明確批准該 package 的 build script，不放寬全域 build-script policy。

Repository source 存在不代表 Vercel/Sentry 遠端 integration 已連線。啟用後需以 Preview controlled exception 驗證 event arrival 與 source-map stack，再移除任何暫時 probe。
