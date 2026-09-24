# LINE and module release gaps

本文件只保留已實作或已有入口，但仍缺遠端／手機放行證據的項目。業務規則仍由各 module owner 維護。

## LINE / mobile

| Legacy ID | Gap | Completion condition |
| --- | --- | --- |
| RM1 | Rich Menu 返回、上班／下班、帳號設定入口缺目前版本完整真機證據 | 指定 Channel／版本，在 Android 與 iOS 驗證入口、個人狀態返回、定位拒絕／越界、舊意圖、unknown-result retry、換帳號；持久回執與 LINE 接受／手機送達分開判定 |
| RM2 | Repository / Issue 本地垂直流程已存在，但遠端資料、部署與多使用者真機流程未放行 | 套用指定環境後由具不同 Repository capability 的使用者完成 Issue 建立、承接、回報、退回、驗收，驗證 replay、expectedVersion、撤權、Repository 隔離與刷新；再驗實際入口 |
| RM3 | Notifications inbox / read-state 已有 current schema 與 runtime，但 source-event delivery / retry 的遠端閉環仍缺放行 | 驗證 recipient isolation、source type/id/version、read-state、delivery idempotency、failed/unknown retry 與 source unavailable distinction；不得把 Notification 當成 Issue/Discussion authority |

## Partners

| Legacy ID | Gap | Completion condition |
| --- | --- | --- |
| RM9 | 最新消息的成功推薦動態缺遠端／手機放行 | 套用 migration、部署與 LINE 入口後驗證成功案件、有效名錄、下架與撤權一致 |
| RM10 | 合作夥伴通訊錄的遠端管理名單、分享同意與真機操作未完整放行 | 驗證多窗口、多聯繫方式、更正、個別／全部下架、重新刊登、跨權限隔離與保存政策 |
| RM11 | 夥伴推薦的審核責任、成功閉環與重複窗口競爭仍需實際放行 | 驗證提交、withdraw、review、成功同交易建立名錄、duplicate handling、replay、並行與跨會員隔離 |

## 原則

- 「程式存在」與「指定環境已放行」分開。
- LINE menu definition、alias 或 route 存在不等於手機可用。
- 外部平台接受 request 不等於使用者裝置已收到或看見結果。
- 模組規則改動應回 `docs/010-domain-owners/`；本文件只追蹤尚未完成的 release/acceptance hinge。
