# Authorization

## 責任

本文件描述目前已實作的跨模組 feature permissions。它不取代各 module 的 business role，也不把 TeamMaintainer、LINE chat context、OrganizationAdmin 或 Project membership 視為全域管理資格。

現行 Permission catalog、command validation 與 `PermissionError` 的 Domain owner 是 Identity/Access，source 位於 `packages/identity-access/src/domain/permission.ts`，公開入口為 `@line-work/identity-access/domain/permission`。Governance scoped RoleAssignment 是另一個具名 authority contract；兩者不因同屬 Identity/Access 而合併成 generic IAM。

人類 identity／qualification failure 由 Account/User contract 表達；歷史 `membership_denied` 等 wire code 只保留 protocol/history 意義，不代表 Membership 是 current Account owner。

## Current permission catalog

| Permission | 意義 |
| --- | --- |
| `users.read` | User 管理查詢 |
| `users.suspend` | User 管理停權與解除 |
| `workplaces.manage` | 工作地點管理 |
| `partners.manage` | 合作夥伴管理 |
| `partners.review` | 推薦審核 |

`members.read`／`members.suspend` 已退出 current contract，且 persistence 不再接受 legacy alias。`permission_grants` 與 `permission_administrators` 使用 `user_id` / `user_version`，Permission source、public contract 與 database constraint 使用同一組名稱，不設 dual-write、compatibility view 或 adapter mapping。

沒有列在 current catalog 的能力，不因頁面、選單或 target 文件存在而自動成為 feature permission。

## 授權來源

`permission_grants` 是上述已實作 feature permissions 的授權來源。有效 grant 綁定 current User status version；User state 變更後舊 grant 不能在恢復 active 時自動復活。

`permission_administrators` 保存受控 permission administrator。TeamMaintainer、OrganizationAdmin、Workplace manager、Partner reviewer 等角色／能力彼此不互推。

## 權限變更命令

正式 permission mutation 包含 `requestId`、target UserId、permission、可空 workplace scope、enable/disable、`expectedVersion` 與必填 reason。Public projection 使用 `userId`，不以 `memberId` 表示登入主體。

只有 `workplaces.manage` 可以帶 workplace scope；permission mutation 保留 version conflict、防重與 reason，不能用 client role／按鈕／URL 判定授權。Permission administrator 不能透過此流程修改自己的業務權限。

## 使用原則

- 頁面可見不等於 API 可用；每個受保護 read/write 仍獨立驗證。
- `users.read` 不自動包含 `users.suspend`；`partners.manage` 與 `partners.review` 分開。
- 撤權後後續操作不得沿用前一次頁面載入的資格。
- 新管理功能先由真正 capability/security owner 定義 action/scope，再決定是既有 Permission、scoped RoleAssignment 或另一 owner contract；不先造空 permission。

## 相鄰責任

- 產品管理體驗：[Product experience](../000-core/060-product-experience.md)
- 各 module business role：[Domain owners](../010-domain-owners/README.md)
- Data boundary：`../../040-data-boundaries/`
- Permission persistence / schema：[Data](../040-data/README.md)


## Request authorization

## Principle

Authorization 是每個受保護 request / command 的 server-side 決策，不由 UI、route、前一次頁面載入或外部 provider session 長期快取。

## Evaluation

受保護操作依其 contract 核驗：

1. verified actor identity
2. current User qualification
3. required business role / permission
4. owner / team / project / workplace 等資料 scope
5. command-specific state / version requirements

不同 lifecycle 有不同 qualification。例如 registration、pending restore、active daily operation、admin operation 不應被一個通用 active gate 偷換語意。

## Revocation

會員狀態、permission、team/project membership 或 scope 被撤銷後，後續 read/write 必須立即以 current authority 判斷。Client 不能沿用先前 `canX` 顯示結果；replay 是否需要重查資格依該 command contract，但不得用舊 receipt 恢復已撤銷的新能力。

## Permission separation

Read / write / administer / appoint administrator 是不同能力。全域 business permission 的現行集合與命令由本文擁有；module-specific role 由各 [Domain owner](../010-domain-owners/README.md) 擁有。

## Failure

Unauthorized / forbidden 與 source failure、not found、conflict 分開；不得為隱藏實作錯誤而放寬 permission、tenant/data isolation、version 或 replay protection。

Data scope isolation：`../040-data-boundaries/010-scope-isolation.md`。
