# Platform and provider guide

Cross-package platform boundaries and provider routing. Provider implementation, credentials, schemas, and executable behavior remain in the owning packages.

## Sections

## AI platform reference

AI provider transport 與設定內容由對應 integration package 擁有。本文件只提供跨 package 的責任分類，不維護第二套 provider contract。

## Canonical content

- OpenAI Responses transport、official environment variables、input/output limits 與 provider errors：[integration-openai README](../../../packages/integration-openai/README.md)。
- Vercel AI Gateway transport、model／credential boundary 與 provider limits：[integration-vercel README](../../../packages/integration-vercel/src/README.md)。
- Document intake、processor identity、source／attempt recovery 與 untrusted result：[Intelligence](../../owners/intelligence.md) 與 `packages/intelligence`。
- Contract candidate validation、confirmation、version 與 command receipt：[Contract](../../owners/contract.md) 與 `packages/contract`。
- Assistant conversation 與 model port：[Assistant](../../owners/assistant.md) 與 `packages/assistant`。
- File source authorization、readback 與 object lifecycle：[File](../../owners/file.md) 與 `packages/file`。

## Cross-owner principles

AI is never authorization, persistent business truth, or a substitute for deterministic validation. Callers must bound input, output, timeout, retries, duplicate handling and total operation cost; provider output remains untrusted until the owning package validates it. Usage and quality evidence must not retain credentials, unnecessary PII or complete sensitive prompts.

## Retained references

Cost measurement, retention and secrets remain cross-cutting concerns owned by the corresponding [engineering rules](../engineering/) and [security references](../security/). Provider-specific details belong in the integration package above.

## Google Workspace platform reference

Google Workspace provider content is owned by [`packages/google-workspace`](../../../packages/google-workspace/README.md). This file is a cross-package index only.

- OAuth token handling and provider adapters：[Google Workspace package](../../../packages/google-workspace/README.md)。
- Product identity, authorization and resource ownership：[Google Workspace owner](../../owners/google-workspace.md) and the relevant domain owner.
- OAuth／recovery readiness：以 package tests、owner contract 與實際 provider readback 為準。

Provider capability does not imply an enabled product flow. A first write must use a stable local owner／scope／version, explicit confirmation and an operation contract that can represent an unknown external result.

## Redis platform reference

Redis coordination content is owned by [`packages/platform`](../../../packages/platform/README.md) and its Redis implementation. This file is a cross-package index only.

- Runtime boundary and durable authority：[Platform package](../../../packages/platform/README.md)。
- Cache and TTL semantics：[Cache and projections](../data/cache.md)。
- LINE webhook usage：[Webhook](../line/webhook.md)。
- Production readiness：以實際 platform package tests、provider readback 與 deployment evidence 為準。

Redis is limited to bounded TTL coordination such as rate limiting and webhook claims. PostgreSQL remains the durable business authority; Redis loss, expiry or eviction cannot be represented as exactly-once delivery or alter business results.

## Sentry

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

## Developer MCP

[官方 Sentry MCP](https://mcp.sentry.dev/) 使用 OAuth；從 repository root 執行 `codex mcp login sentry --scopes org:read,project:read,event:read`，完成登入後重新載入 MCP／開新 session，再讀取該專案的 issue/event 驗證連線。OAuth credentials 由 Codex 管理，不寫入 repository 或 `.env.local`；此連線不需要 DSN、`SENTRY_AUTH_TOKEN`、OTLP 或 log drain 環境變數。

開發診斷只讀指定 environment/release 的 issue、event 與 stack，沿實際 source/consumer 確認根因；MCP project scope 不授予遠端修改權限。Config 解析或 OAuth 登入成功不代表 source map、事件收集或當前 session 工具已驗證。

## Supabase platform reference

Supabase 的整合規則與 provider-specific content 由 [`integration-supabase`](../../../packages/integration-supabase/src/README.md) 擁有。本文件是跨 package 的分類索引；不保存第二套 schema、environment、operator 或 capability contract。

## Canonical content

- [Canonical Supabase rules](../../../packages/integration-supabase/src/README.md#canonical-supabase-rules)：schema authority、environment boundary、remote operator、readback、migration-history 與 change flow。
- [Source of Truth](../../../packages/integration-supabase/src/README.md#source-of-truth)：schemas、Bucket config、registry 與 recovery／release routing。
- [Capability routing](../../../packages/integration-supabase/src/README.md#capability-routing--prepared-layout)：Auth、Storage、Realtime、Cron、Queues、Vector、Webhooks、Functions 與 tests 的啟用條件。
- [Package capability docs](../../../packages/integration-supabase/src/README.md#各能力開發規格)：各能力的 adapter、security、runner 與 readback 入口。

## Cross-package boundaries

### Auth boundary

Supabase Auth 只提供 provider proof；LINE Member、Membership、Organization、Employment、authorization 與 business identity mapping 仍由對應 domain owner 擁有。需要 provider identity linking 時，請遵循 package 的 Auth capability 文件與 Account owner contract，不把 provider metadata 當成產品權限來源。

### PostgreSQL runtime

Runtime 使用 integration package 的 server-only adapter；private application schema、`line_app` role、RLS/grants 與 transaction boundary 的詳細規則集中在 package README 與 source-local `AGENTS.md`。Browser 不直接取得 private business table access，service-role credential 也不取代 application authorization。

### Environment variables

Provider variable 的命名、secret boundary 與用途以 package source／adapter 和 [local environment](../engineering/local-environment.md) 為準。不要在本文件複製 secret 表或聲稱 hosted project 已同步；remote readback 必須依 package 的 canonical rules 執行。

## Capability classification

以下只記錄跨 package 的分類，細節由 package 文件維護：

| Capability | Current status | Canonical content |
| --- | --- | --- |
| PostgreSQL / Auth / Storage | 已有整合與 runtime consumers | [`integration-supabase/src`](../../../packages/integration-supabase/src/README.md) |
| Edge Functions | 尚無 current deployed consumer | [`functions/README.md`](../../../packages/integration-supabase/src/functions/README.md) |
| Realtime | 尚無 current private subscription consumer | [`realtime/README.md`](../../../packages/integration-supabase/src/realtime/README.md) |
| Cron | 沿用既有 owner scheduler；不建立第二套 scheduler | [`cron/README.md`](../../../packages/integration-supabase/src/cron/README.md) |
| Queues / Vector / Webhooks | 尚未啟用；先證明 durable consumer、owner、provenance 與 recovery contract | package capability docs |

## Retained cross-system responsibilities

- Release 文件只負責 publication ordering 與 evidence：[Release](../operations/release.md)。
- Schema 文件只負責 DDL／data transform 的語意：[Schema model](../data/schema.md)。
- Recovery 文件只負責 backup、restore 與 recovery evidence：[Recovery](../operations/recovery.md)。
- Supabase-specific 操作內容、規則與過時 capability 設計不在這些 cross-system 文件重複維護。

## Vercel platform reference

Vercel 的 provider integration、AI Gateway、environment、capability routing 與 deployment boundary 由 [`integration-vercel`](../../../packages/integration-vercel/src/README.md) 擁有。本文件只提供跨 package 索引，不保存第二套 provider contract。

## Canonical content

- Vercel configuration、AI Gateway credential/model boundary 與 capability layout：[integration-vercel README](../../../packages/integration-vercel/src/README.md)。
- Web／API implementation、route 與 business composition：[apps/web](../../../apps/web/AGENTS.md) 與各 domain owner。
- Native deployment source：[apps/web/vercel.json](../../../apps/web/vercel.json)、[next.config.ts](../../../apps/web/next.config.ts)、[apps/web/package.json](../../../apps/web/package.json) 與 [.vercelignore](../../../.vercelignore)。
- Publication ordering、release evidence、recovery：[Release](../operations/release.md)、[Recovery](../operations/recovery.md)。

## Cross-package boundary

Vercel deployment READY、AI Gateway response 或 provider readback 都不能取代產品 authorization、domain validation、database persistence、LINE/provider acceptance 或 device acceptance。Provider-specific change 先修改 integration package 或 executable source，再由 owner package 驗證 consumer contract。
