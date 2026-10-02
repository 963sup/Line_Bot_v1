# LINE platform contract
Read this file only to choose the LINE boundary. Provider-specific details are split so a task does not load MINI App, Webhook, Messaging, Rich Menu and identity rules together.
## Channel and provider boundary
LINE 提供 identity proof、Messaging/Webhook、MINI App entry 等 provider 能力，但不擁有 User qualification、Organization/Team participation、TeamManager、Employment 或其他 business state。
## Implementation ownership
`@line_bot_v1/line` 是 current LINE integration code owner：LINE user proof、Messaging/Webhook、Rich Menu、MINI App browser adapter 均透過其 exports 提供。這是 Module Boundary，不改 LINE Console state、provider protocol、business authorization 或 Supabase Data Boundary。
## Product authority
LINE profile/userId/groupId/mention/chat membership 都不是 business role：

- LINE user proof → server verify → Account external identity mapping → current User qualification。
- LINE groupId 不建立 OrganizationMembership、TeamMembership 或 TeamManager。
- Bot 被加入群組不授予任何人 product permission。
- Webhook `source.userId` 是人類 external subject；`destination` 是接收 bot。Delivery target 不取代 command actor。
## Secrets and external state
Channel secret/access token 只由 server-side secret/config owner 管理，不進 URL/browser storage/docs example/business record。Repository 的 SDK、LIFF ID、menu definition 或 webhook route 不證明 LINE Console 已配置／發布；Developing/Review/Published 與 device acceptance 另由 Operations/Acceptance 驗證。

## Load by task
| Task | Reference |
| --- | --- |
| MINI App / LIFF entry, login continuation, browser context | [MINI App](../reference/line/mini-app.md) |
| Webhook verification, source context, replay claim | [Webhook](../reference/line/webhook.md) |
| Reply/push delivery and message-side effects | [Messaging](../reference/line/messaging.md) |
| Rich Menu desired state / publish / alias / rollback | [Rich Menu](../reference/line/rich-menu.md) |
| LINE identity proof → Account/User mapping | [Identity](../reference/line/identity.md) |

Business authority remains with the consuming owner. LINE accepted / signed / delivered does not mean the business operation is authorized or committed.
