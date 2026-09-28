# Web partners module
## 現行 surface 與 invariant

URLs：`/partners`、`/partners/news`、`/partners/referrals`、`/partners/manage`；API `/api/partners`。

Partners 是本地合作夥伴語意，不是 FPT Organization Team。Management surface 直接屬於 Partners，沿既有 `partners.manage` owner contract 授權；沒有 Admin route owner。

API view 的 actor 欄位依 `PartnersView.userId`；fixture 必須能實際觸發 current identity recheck，不能以舊欄位令比較雙方都成 undefined。

- Owns partner directory/referral presentation；partner lifecycle, visibility and external-provider semantics belong to `@line_bot_v1/partners`。
- Preserve scope filtering and not-found/forbidden/unavailable distinctions；client search/filter cannot widen visibility。
- External contact acceptance is not proof of a durable partner relation。
