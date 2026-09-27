# Secret handling

## Never expose secrets

Token、database password、provider secret、private key 與其他 server credential 不進：

- product URL / query / fragment（協定明確要求的短效 fragment capability 例外仍需立即清除）
- Git repository
- browser bundle
- ordinary log / telemetry
- business record
- user-visible error

Public/publishable key 不等於 business authorization；真正資料存取仍由 server role、RLS/grants 與 application authorization 保護。

## Credential separation

不同用途的 credential 分開：

- runtime database credential ≠ migration/owner credential
- LINE channel credential ≠ Member identity
- Supabase/Google login provider token ≠ Workspace API authorization
- local operator credential ≠ deployed Web credential

不得為方便把高權限 credential 部署到 runtime，或挪用一個 provider token 執行另一種整合。

## Browser boundary

Browser 只持既有 protocol/session 流程需要的短效資料。完成、取消、過期、登出或換帳號時應移除相關 capability；不要把 secret 複製成 application navigation state 或持久 business metadata。

## Configuration

Secret 名稱與載入規則由 engineering environment 文件管理；實際值只存在受控環境。部署前確認 target environment 與 scope，不整份複製本機環境檔。

## Rotation and failure

Credential rotation 要確認 consumer、deployment order、readback 與 rollback/forward-repair。外部操作結果未知時先核對 provider state，不因 credential error 無限重試。

Platform-specific credential 契約由 [Platform](../030-platform/README.md) 擁有，operations change control 由 [External change control](../070-operations/050-external-change-control.md) 擁有。
