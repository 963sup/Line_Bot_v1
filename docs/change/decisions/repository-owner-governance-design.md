# Repository owner governance

本文固定 Personal / Organization Repository 的產品決策與權責邊界；目前 executable truth 仍由 Repository、Organization、Identity/Access 與 Attendance owner contract、machine semantic/data topology 及 runtime tests 擁有。

## Decision

Repository 是單一資源模型，owner 由 Account identity 加 `ownerKind` 表示：

```text
Repository
├── ownerKind = USER
└── ownerKind = ORGANIZATION
```

不建立 `PersonalRepository`、`OrganizationRepository` 或通用 Tenant / Admin 模型。兩種 owner 共用 Repository identity、visibility、address、access、lifecycle、event、version 與 replay invariant；只有建立資格、Team grant、Organization recovery 與 owner presentation 依 owner kind 改變。

## Authority matrix

| Concern | User-owned Repository | Organization-owned Repository |
| --- | --- | --- |
| 建立 | current active User 本人 | current active OrganizationOwner |
| 所有權主體 | User | Organization Account |
| 日常 Repository 操作 | owner 的 implicit `ADMIN` 或明確有效 `ADMIN` | 明確有效 Repository `ADMIN` |
| OrganizationOwner | 不適用 | 可建立與執行 access recovery，不因角色自動取得 Repository access |
| Direct User grant | Repository-owned | Repository-owned；可包含 outside collaborator |
| Team grant | 不適用 | 只接受同 owner Organization 的 Team |
| 補登審核 | Repository 當下有效 `ADMIN` | Repository 當下有效 `ADMIN` |

Organization membership 是參與資格與 member/outside classification，不是 Repository access。OrganizationOwner 也不是 Repository ADMIN；Organization-owned Repository 的 owner account 不能登入，所有操作都必須由 current human User 以明確的 authority path 執行。

## Invariants

- owner login、Repository name、URL、PUBLIC visibility、Star 與 Organization membership 都不能單獨授權 private read/write。
- Repository access mutation 只由 Repository owner contract 寫入；Organization / Team owner 不寫 Repository grant。
- User-owned owner 的 implicit `ADMIN` 不建立重複 direct grant。
- Organization-owned direct grant 不因 membership removal 自動消失；明確 revoke 才撤銷。
- OrganizationOwner recovery 只能恢復 Repository access administration；沒有 Repository `ADMIN` 時不能管理 address、lifecycle 或審核 Attendance supplement。
- Attendance supplement 是 User 提出的 request；只有該 Repository 當下有效 `ADMIN` 可 approve/reject，申請人不能審核自己。
- 所有 access、lifecycle、attendance review mutation 保留 current authority recheck、`requestId`、expected version、exact replay、last-admin / last-owner protection 與 durable evidence。

## Scope

本決策涵蓋所有權、身份定位、成員／Team qualification、Repository permission、治理恢復、Repository address 與 Attendance supplement review。GitHub App、source-code / CI 功能、ownership transfer、法律智慧財產權、billing、SCIM / SSO、Payroll calculation 不在本階段。

## Current implementation routing

- Repository authority：`docs/owners/repository.md`、`packages/repository`
- OrganizationOwner / membership authority：`docs/owners/organization.md`、`packages/organization`
- Permission evaluation：`docs/owners/identity-access.md`、`packages/identity-access`
- Attendance review：`docs/owners/attendance.md`、`packages/attendance`
- Persisted relation ownership：`architecture/data-topology.json`
