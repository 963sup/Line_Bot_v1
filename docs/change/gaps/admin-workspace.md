# Admin workspace gaps

只保存尚未完成／未定案的管理後台能力；已實作 User、Partner、Workplace、Permission、Organization/Team 管理能力不在此重複。

## Attendance management

`/admin/attendance` 仍未形成完整正式管理能力。放行至少需要：可查 User/Employment/Organization scope 與 authority、唯讀 actual session/history query、historical Workplace/rule version、pagination/revoke/direct API tests；不得以 admin UI 默認代打卡、任意改原始時間或直接推導薪資。Employment cutover 前要能明確表示 current Member-compatible subject。

## Expense management

`/admin/expenses` 尚未形成完整正式管理能力。放行至少需要：可信 owner/scope authorization，不從 project text、LINE groupId、TeamId 猜 scope；沿 Expense current state；receipt original access 受控；混合幣別/未確認資料不當正式 accounting。External form 仍只是外部 entry；approval/payment 需要另定 owner/state。

## Audit query

`/admin/audit` 若建立統一查詢，先盤點真正持久 evidence source；replay/retry 不顯示成第二 business mutation；Audit read 不授予 source object/secret/attachment；source failure 顯示 partial/unavailable；retention 由正式 data/governance owner 定案。

## System settings

`/admin/settings` 第一版只讀，不建立第二 environment/secret center。可顯示 configured/unconfigured/unknown 非秘密摘要；cron/job/integration config 存在不代表運行成功。部署、Rich Menu publish、DB cleanup、bulk notification 等外部操作另由 Operations owner。

## Completion condition

每個能力移出本文件前至少有：1) owner/data source；2) authorization/data boundary；3) query/command/failure contract；4) direct API/revoke/switch-user/failure tests；5) repository validation 與對應 environment acceptance evidence。Route/UI skeleton 不構成完成證據。
