# Google Workspace gaps

Google identity、Workspace API authorization、User/Organization/Team participation、Employment/Project responsibility 是不同關係。Google login/link 不授予任意 Workspace 或本產品 business write capability。

| ID | Gap | Completion condition |
| --- | --- | --- |
| GS1 | 第一個 Workspace write flow 的 source/owner/version/target resource 尚未固定 | Stable source ID/owner/version、明確 account/target、操作前確認、external result 可 reconcile |
| GS2 | OAuth scopes、short-lived token、TTL、cleanup、cross-browser continuation、unknown-result recovery 尚未完整 | 最小 scopes；cancel/revoke/suspend/expiry/concurrency/unknown tests；token 不變長期 business data |
| GS3 | Team external resources、Forms identity、Docs/Sheets sharing、Calendar update/cancel、Gmail send/reconcile 按需設計 | 每一類先有真實 need、owner、authorization/recovery；不由 login 自動擴成 sync/scheduler platform |

- Google Forms 若無可信 callback/mapping，不宣稱本系統已收到提交。
- External success/local timeout 先 reconcile，尤其 email 不盲目 retry。
- Workspace API deterministic flow 與 AI provider 分開；不需先引入 LLM。
- Provider/scopes/token technical contract 由 [Google Workspace integration](../../030-platform/050-google-workspace.md) 擁有；本文件只保存 open gaps。
