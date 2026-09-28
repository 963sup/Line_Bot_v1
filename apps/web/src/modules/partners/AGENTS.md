# Web partners module
## 現行 surface 與 invariant
URLs：`/partners`、`/partners/news`、`/partners/referrals`、`/partners/manage`；API `/api/partners`。

Partners 是本地合作夥伴語意，不是 FPT Organization Team。`/partners/manage` 為現行管理路徑；既有返回 `/team` 不代表 ownership。改名或返回目標時先查權限導覽、LIFF intent 與 browser tests，再依已確認 URL 契約處理。

API view 的 actor 欄位依 `PartnersView.userId`；fixture 必須能實際觸發 current identity recheck，不能以舊欄位令比較雙方都成 undefined。

- Owns partner directory/referral presentation; partner lifecycle, visibility and external-provider semantics belong to `@line_bot_v1/partners`.
- Preserve scope filtering and not-found/forbidden/unavailable distinctions; client search/filter cannot widen visibility.
- External contact acceptance is not proof of a durable partner relation.
