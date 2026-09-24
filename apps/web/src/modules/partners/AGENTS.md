# Web partners module

## GitHub Mobile 目標（後續實作）

- Directory 採名稱/必要聯繫摘要的列表，詳情再展開 contact methods；news 與 referral 是 owner 內的次級目的地，不升格為全域 tab。
- 推薦與管理採明確表單、確認、版本結果；`/admin/groups` 的畫面標題維持合作夥伴語意，命名現況不使它變成 Organization Team。
- 後續返回導覽應遵循 Partners 任務上下文；若要變更現有 `back=/team`，同步 navigation/entry tests，不把布局文件當已修復證據。

## 現行 surface 與 invariant

Current URL：`/partners`、`/partners/news`、`/partners/referrals`、`/admin/groups`；API `/api/partners`。

Partners 是本地合作夥伴語意，不是 FPT Organization Team。`/admin/groups` 為現行管理路徑；既有返回 `/team` 不代表 ownership。改名或返回目標時先查權限導覽、LIFF intent 與 browser tests，再依已確認 URL 契約處理。

API view 的 actor 欄位依 `PartnersView.userId`；fixture 必須能實際觸發 current identity recheck，不能以舊欄位令比較雙方都成 undefined。

- Owns partner directory/referral presentation; partner lifecycle, visibility and external-provider semantics belong to `@line-work/partners`.
- Preserve scope filtering and not-found/forbidden/unavailable distinctions; client search/filter cannot widen visibility.
- External contact acceptance is not proof of a durable partner relation.
