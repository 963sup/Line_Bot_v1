# Google Workspace gaps

Google identity、Workspace API authorization、User/Organization/Team participation、Employment/Project responsibility 是不同關係；Google login/link 不授予 Workspace 或本產品 business write。

| ID | Gap | Completion condition |
| --- | --- | --- |
| GS1 | 第一個 Workspace write flow 的 source/owner/version/target 未固定 | Stable source ID/owner/version、明確 account/target、操作前確認、external result 可 reconcile |
| GS2 | OAuth scopes、token TTL/cleanup、continuation、unknown-result recovery 未完整 | 最小 scopes；cancel/revoke/suspend/expiry/concurrency/unknown tests；token 不變長期 business data |
| GS3 | Team resource、Forms、Docs/Sheets、Calendar、Gmail 按需設計 | 每類先有真實 need、owner、authorization/recovery；不由 login 擴成 sync/scheduler platform |

- Forms 無可信 callback/mapping時，不宣稱系統已收到提交。
- External success/local timeout 先 reconcile；Gmail send 不盲目 retry。
- Deterministic Workspace flow 與 AI provider 分離。

Owner：[Google Workspace](../../owners/google-workspace.md)。OAuth/write/recovery technical contract：[reference](../../reference/platform/google-workspace.md)。
