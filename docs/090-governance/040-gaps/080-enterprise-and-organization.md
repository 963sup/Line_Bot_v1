# Account / Enterprise / Organization gaps

狀態：Account/User、Enterprise/Organization governance、Enterprise Team membership/Organization assignment provenance 與 Organization-scoped Team 已有 current source；完整 release/device/business acceptance、outside collaborator/resource access、部分 resource scope/policy、Personal Center target 與其他 target facets 仍未完成。本文件只保存 open gaps，不保留已完成 WorkGroup→Team、Membership→User owner migration 或 EnterpriseTeam provenance slice 作假待辦。

## Known drift / remaining limits

- `Member`、membership route、`members.*` permission、`membership_denied`、部分 physical `member_id` 仍是 compatibility protocol/storage；它們需要可讀歷史與 consumer rollout，但不代表 current lifecycle owner 還是 Membership。
- Enterprise/Organization current source 有 Domain/Application/contracts、typed participation/scoped admin assignments、Enterprise Team、membership provenance、persistence/schema/runtime flow；指定 Supabase remote catalog 已同步本次 governance schema，但完整 release/device/business acceptance 仍按 evidence 分開。
- EnterpriseTeam current slice只涵蓋 Team membership、Organization assignment、membership-source refresh 與必要 governance invariants；GitHub outside collaborator、Enterprise roles/licensing/ruleset bypass、Team 作 principal 等仍未實作。
- Team 已有 OrganizationAccountId scope；Workplace/Project/Attendance historical Organization/Employment provenance 不能從 Team/LINE group 猜回。
- Current feature permissions 與 governance scoped RoleAssignments 是不同 current authority contracts；generic policy evaluation 與 autonomous Bot delegation 等 authority target 仍未啟用。
- Personal Center 尚未有完整 multi-Organization/Employment/Payroll owner-approved projection。

## Remaining activation decisions

1. Employment 建立是否要求 active OrganizationMembership、同人同 Organization overlapping Employment policy。
2. Workplace/Project/Attendance historical resource 的 evidence-backed Organization/Employment mapping 與 unresolved handling。
3. Non-USER holder/transfer/enterprise value use case；Coin USER-only 不自動擴張。
4. Autonomous Bot actor 只有出現真實 business consumer、stable identity／delegation owner 與 acceptance evidence 後才進 current source。
5. Remote environment classification、retention、backup/recovery 與 affected deployment；每次操作前 live readback。
6. Employment ended／participation removed 後 Workforce/Payroll historical self-read policy。
7. GitHub outside collaborator/resource access 與 EnterpriseTeam 更完整 administration surface 是否有真實 consumer；沒有 consumer 前不預建 generic resource/principal framework。

## Open gaps

| ID | Gap | Completion condition |
| --- | --- | --- |
| EO0 | Account compatibility protocol 尚未完全退役 | 每個舊 Member/membership wire/storage consumer 有 owner、versioned rollout/readback；無雙 writer；immutable history/source tuple 可解釋 |
| EO1 | Enterprise governance 尚未完整 acceptance | lifecycle/admin/recovery、cross-enterprise negative cases、final-SHA repository/deployment/device/business evidence；本次 EnterpriseTeam/provenance source/remote sync 不等於全產品 acceptance |
| EO2 | Organization governance 尚未完整 acceptance | lifecycle/participation/source/admin/revoke/version/replay、cross-scope tests、recovery/release evidence；與 Employment 分離 |
| EO3 | Organization scope 尚未覆蓋所有既有 resource/history | Workplace/Project/Attendance 等有可信 mapping或 unresolved state；cross-scope拒絕；不猜 default Organization |
| EO4 | GitHub outside collaborator/resource access 與 EnterpriseTeam extended administration 未實作 | 有真實 resource/role/license/ruleset consumer、明確 owner/public contract、principal kinds、revoke/audit/remote/deployment tests；不得用 OrganizationMembership 或 generic Team facade 代替 |
| EO5 | EnterprisePolicy / OrganizationPolicy downstream applicability 未實作 | 第一個真實 configurable rule/consumer、version/effective history、上下層 constraint、decision trace、concurrency/revoke tests |
| EO6 | Personal Center target 未接通 | owner-approved Account/Wallet/Organization/Employment/Attendance/Payroll projections；multi-scope/privacy/partial failure驗證 |
| EO7 | 後續 target remote sync 未完成 | 每個新 slice 的 current schemas/recovery、preserve-data reviewed diff、catalog readback、data parity 與 deployment evidence |

已完成的 User current owner、DailyCheckIn owner、Organization Team source/schema/contracts 與 EnterpriseTeam membership provenance slice 不留在 open gap 表。歷史 evidence 不因 gap 關閉改寫。

## Acceptance principles

EnterpriseOwner、OrganizationMembership、OrganizationOwner、Organization TeamMembership/TeamMaintainer、EnterpriseTeamMembership、Employment 合法組合不互相誤授權；Bot/Organization/Enterprise 不落入 human-only relation；scope account 不取代 audit Principal。Revoke 後下一次 sensitive operation 重驗，deactivate/detach/source removal 不 cascade 歷史，Account restore 不復活 revoked grants/removed relations。

Migration／source／remote／release 完成條件見 [Migration plan](../030-migrations/040-enterprise-organization-workforce-payroll.md)；Docs/CI/schema/API/device evidence 不互相替代。

## Account hierarchy lifecycle/API normalization

Current surface 已補齊 Enterprise `active <-> inactive` 對稱 transition、Organization Team rename 與 Enterprise Team rename。這些都是既有 resource model 可直接推導的 mutation，不建立 generic CRUD framework，也不改 immutable identity/scope。

仍刻意保留的 gaps：

- Enterprise／Organization display name、description 或 settings 尚無 canonical business metadata model；沒有 owner/consumer 前不新增 generic PATCH。
- Organization Team／Enterprise Team permanent delete/archive 需要先定義 Task/history、membership/assignment、audit 與 restore semantics；current schema 刻意阻止 direct delete。
- Nested Organization Team、Enterprise Team organization-selection policy（例如 all current/future Organizations）仍是獨立 product/policy capability，不由 rename/lifecycle work 順便建立。
- Enterprise/Organization root self-service provisioning 已由 active User owner command + private DB coordinator 落地；operator bootstrap 保留 recovery。後續若加入 quota、approval 或 commercial entitlement，必須由真實 policy owner 擴充，不回退成 generic Account CRUD。
