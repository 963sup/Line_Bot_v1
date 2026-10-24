# Routing

路由程式留在 Web；查找入口見 [Runtime routes](../../docs/reference/runtime/routes.md)，原生設定見 [vercel.json](../../apps/web/vercel.json) 與 [next.config.ts](../../apps/web/next.config.ts)。本目錄不新增 redirect、rewrite、header 或 middleware。

- 區分 framework route、redirect、rewrite 與 middleware；同一 URL 規則只保留一個設定 owner。
- URL、rewritten path、middleware 通過或頁面可見不授予 business access，授權遵守 [Request authorization](../../docs/rules/request-authorization.md)。
- LINE／OAuth callback、webhook 與 private API 的 origin、method、body、cache header 依各自契約維持。

後續驗收：直接 URL、refresh、redirect loop、callback origin、not-found／forbidden 區分，以及 Web／LINE 導覽一致性。網域接線見 [Domains](../domains/README.md)。
