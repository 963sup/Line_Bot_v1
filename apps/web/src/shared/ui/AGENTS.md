# Shared UI boundary


## 現行機制與 invariant

不擁有固定 business URL；back/action 的 href 由 app/feature caller 提供。FPT resource 分類不產生通用 ResourcePage 或 CRUD 組件需求。

修改 PageHeading、ActionRow、PageState 等要查不同 consumer 的背景、手機換行、鍵盤與 loading/error/empty 語意；不要讓淺色／深色頁面共用不相容樣式卻只驗其中一頁。Feature navigation 留在 owner，可組裝中立 primitive。

- Shared UI owns visual composition and accessibility primitives, not domain policy, authorization or resource lifecycle.
- Feature-specific labels, actions and state mapping remain with the feature module; do not make generic components silently infer business status.
- UI affordance, disabled state and navigation never substitute for server-side owner validation.
