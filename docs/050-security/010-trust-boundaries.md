# Trust boundaries

## Deny by default

受保護操作只有在 identity、current qualification、authorization scope 與必要資料來源都能可信確認時才執行。資料庫不可用、資格未知、角色來源未定義或驗證失敗時拒絕，不降級成匿名寫入，也不改用另一份快取 authority。

## What is not authorization

以下都不能單獨授權：

- page / route / layout / slot 可見
- browser profile / editable metadata
- email address
- LINE group context
- model output
- query parameter / record ID
- external login proof without business role

Public content 可以不要求 Member；但只要進入 private business read/write，就依該 use case 重新驗證。

## Transport and business trust

Webhook 先核驗平台 signature / channel，再由 business use case 驗目前 actor 與 scope。Browser 只表達 intent；server / transaction 才能決定資格、版本與 durable state transition。

Runtime database role、migration role、browser role 與 external operator role 分離。瀏覽器不直接取得 private business table mutation 權限。

## Failure boundary

查詢失敗不得回空清單冒充「沒有資料」；authorization failure 不改成 generic success；external callback 或 UI success 也不能取代 durable business result。

相鄰 owner：Authentication `../020-authentication/`、Authorization `../030-authorization/`、Data boundaries `../040-data-boundaries/`、Secrets `../050-secrets/`。
