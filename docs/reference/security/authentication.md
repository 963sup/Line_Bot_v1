# Authentication

## Identity proof

每個 private flow 都由後端核驗可信 provider proof，再解析 stable internal Member。Browser 提供的 memberId、profile、email 或 metadata 不構成身分證明。

LINE、Supabase Auth / Google、Workspace OAuth 是不同 proof / authorization 關係；其中一種成功不自動取得其他 provider 或 business scope。

## Session lifecycle

登入、登出、過期、停權、重新登入與換帳號必須使舊 private state 失效。Client 應停止／取消與舊 actor 關聯的請求；較晚回來的舊回應不能覆蓋新 actor state。

外部瀏覽器與 LINE MINI App 不假設共享 session。跨容器接續只傳必要、非秘密、白名單 intent，返回後重新由 server 查目前狀態。

## Callback boundary

OAuth / identity protocol 必要的短效 code 只在指定 callback 處理，完成核驗後清除；不能再複製到產品 URL、return URL、log 或 telemetry。

一次性交接 token / capability 必須有明確用途、時效與消耗規則，不可升格成一般 Member read/write credential。

## Qualification

「使用者是誰」與「目前能做什麼」分開。已有 identity mapping 不代表 Member 一定 active；authorization 仍由 `../030-authorization/` 與 module contract 決定。

Provider-specific verification：[Platform](../030-platform/README.md)；external identity data mapping：[Identity mapping](../040-data/050-identity-mapping.md)。
