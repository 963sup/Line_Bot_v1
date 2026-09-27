# Runtime architecture

Use this file for Next.js/runtime boundaries. Load the route inventory or command-entry rules only when the task needs them.

## App Router partitions

`apps/web/src/app` 目前使用 `(public)/`、`(resource)/`、`(onboarding)/`、`(mobile)/`、`(admin)/`、`(system)/` 與 `api/`。`(mobile)` 擁有 Mobile / LINE MINI App delivery；Repository canonical identity 與 Repository-scoped subresources 統一由 `(resource)` 擁有。Route Group 只分 runtime/layout responsibility，不改正式 URL，也不產生新的 authorization；相同正式 URL 只有一個 route owner。

## Next.js module-graph boundary

App Router 的 Server / Client boundary 是 source module graph 邊界。Server Component／route 可使用 server-only dependency；`'use client'` 後可達 dependency 必須 browser-safe。Route Handler 能存取 environment/database 不代表它取得 business rule ownership。Runtime placement 與 Layer／Bounded Context 是不同問題。

## Runtime responsibilities

| Partition | Runtime responsibility |
| --- | --- |
| `public` | 公開內容與登入入口；不讀 private business data |
| `resource` | Canonical resource URL；同一 Repository locator 可解析 public projection，或在可信 identity 後解析 authorized private/internal projection；URL 本身不授權 |
| `onboarding` | 可信外部身分後執行註冊／恢復等設定流程 |
| `mobile` | Mobile / LINE MINI App application delivery；shell/navigation/composition 不取得 business authority，各功能仍自行核驗 current User／business scope |
| `admin` | 管理 UI shell；私有讀寫仍依 feature permission / module contract 驗證 |
| `system` | OAuth callback、一次性接續、特殊結果；不常駐 business state |
| `api` | HTTP transport；每個 request 自行驗證 identity、qualification、input 與 authorization |

Browser 可以保存 presentation state、白名單 navigation intent 與 pending command metadata，但不能成為 identity、role/permission、version、durable replay 或 secret authority。Browser 提供的 Member/User ID、role、scope、version、return URL、operation state 都只是 input/intent；server 依 owner contract 重驗。

## Route ownership and URL state

Page／route handler 負責 transport 與組裝，不複製 use case。Feature business rules 由 `010-domain-owners/*` 與 application/domain owner 維護。Stable ID 可以出現在 URL，但只定位、不授權；URL 不保存 credential、arbitrary return URL、private draft、authorization decision 或 mutable server version authority。

MINI App/login intent 白名單由 [LINE MINI App](../030-platform/010-line.md) 擁有。

## Write lifecycle

有副作用操作的 UI 區分 `editing/confirm → sending → confirmed result | explicit rejection | unknown result`。Unknown result 不產生第二個 command；支援 replay 的功能保存原 request identity/內容並重新核驗目前 actor。Client optimistic state 只能暫時呈現 intent，server result/current state 可覆蓋。

## Background runtime

Worker／cron／outbox 只執行 durable source 建立的待辦；外部 callback/delivery success 不反向成為 business transaction authority。Background worker 不重新發明 business command；需要 current authorization/state 時仍重驗。

## Parallel / nested routes

只有需要獨立 navigation state、loading/error boundary 或持續 layout state 的真實需求才使用 Parallel/Intercepting Routes；一般卡片並排不構成預建 slot 的理由。

## Deeper retrieval

- URL / route lookup → [route inventory](../reference/runtime/routes.md)
- Route Handler / Server Action / Agent command semantics → [runtime entrypoints](../rules/runtime-entrypoints.md)
- Authorization → [request authorization](../rules/request-authorization.md)
