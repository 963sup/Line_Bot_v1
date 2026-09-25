# Selected domain target

狀態：selected future design，不是 current implementation、remote state、deployment 或 device acceptance。Current truth 仍由 [Core](../../000-core/README.md) 與 [Domain owners](../../010-domain-owners/README.md) 擁有；實作進度與 cutover 由 migrations / gaps / acceptance 分開證明。

## Target subdomains

狀態：target problem-space design。現況仍以 [Current subdomains](../../000-core/020-domain-map.md) 與實際 source/schema/tests 為準，不因 target 已命名就宣稱已交付。

## Domain

**Enterprise Workforce & Operations Management**：讓可信操作者在明確責任與 Enterprise/Organization scope 下完成協作、任職、出勤、薪資與企業營運，正式結果可授權、追溯、版本化及恢復。

Account identity 支援此業務目標；它不是把整個產品改成「通用帳號平台」。LINE Bot 的 automation identity 歸 Account/BotAccount；其訊息入口與 LINE MINI App/Web 是 interaction，Next.js、Supabase、Google、AI、Redis 是 runtime/integration/infrastructure。

## Target subdomains

| Subdomain | Role | 核心問題 | Owner direction |
| --- | --- | --- | --- |
| Account identity / qualification | Supporting | 主體是誰，自身 lifecycle 如何影響特定操作資格 | Account |
| Enterprise governance | Supporting | 多 Organization 的治理、責任與政策 | Enterprise |
| Organization management | Supporting | lifecycle、participation/admin、business/data scope | Organization |
| Work collaboration | Core-adjacent | Organization-scoped Team 的協作資格與 Task 責任鏈 | Team / Work Collaboration |
| Workforce management | Core | User 的 Employment、effective terms/policy/calendar/schedule | Workforce |
| Attendance | Core | Employment actual facts、eligibility、correction、finalized input | Attendance |
| Payroll | Core | versioned inputs 下的 calculation/approval/finalization/publication | Payroll |
| Daily check-in | Existing supporting capability | 合格 User 每日明確簽到與既有 Coin decision | DailyCheckIn；不預建通用 Reward Context |
| Value definition / holding / posting | Existing supporting | denomination、holder eligibility、derived balance、immutable value facts | Asset / Wallet / Ledger |
| Expense intake | Supporting | 收據如何形成可核對 Expense | Expense；非付款或會計審批 |
| Partner directory / referrals | Supporting | Partner/Contact/Referral lifecycle | Partner Directory |
| Notifications | Supporting | recipient inbox/read-state/delivery projection | Notification |
| Finance | Target supporting | finalized business facts 如何成會計 posting | Finance candidate |
| Procurement | Target supporting | 採購需求與承諾 lifecycle | 待實際規則/consumer |
| Inventory | Target supporting | 庫存數量/移轉責任 | 待實際規則/consumer |
| Fixed Asset Management | Target supporting | 設備取得/折舊/處置 | 與現有 value Asset 區別，待實際規則/consumer |
| Sales | Target supporting | 銷售/收入 lifecycle | 待實際規則/consumer |

Core-adjacent 表示已有大量產品規則/價值，但商業差異化分類仍需市場證據。它不影響既有 correctness/security 要求。

## Strategic focus

```text
Account identity / User qualification
       ↓ supports
Enterprise governance / Organization scope
       ↓
Workforce → Attendance → Payroll
       ↓ finalized facts when required
Finance
```

這是責任依賴，不是強制每個 User 都隸屬 Enterprise，亦不是上層角色自動取得下層權限。Organization 可獨立存在，Team 與 Employment 不是 Account subtype。

Account/User、Enterprise/Organization 與 Team 已有 current source；下一階段聚焦 Employment 與 Attendance/Payroll versioned handoff。Finance/Procurement/Inventory/Fixed Asset Management/Sales 沒有 consumer 前不預建巨大 ERP framework。

## Cross-cutting capabilities

Principal resolution、authentication/authorization enforcement 由 Security/Application 擁有，不是 Account root 的 business role。Assistant/Agent 是 draft/orchestration；BotAccount 是身份，不代表自主業務 authority。

Notification/delivery、Audit evidence、Personal Center projection、外部 provider adapters 不是因有 package/route/table 就升格為新 Subdomain。

## Boundary rules

Account != Principal != permission；User != Employee；Enterprise != Organization != Team != Employment。OrganizationMembership 不等於 Employment；TeamMembership 不授予 Organization-wide permission。

Workforce schedule 不等於 actual attendance；Payroll 不覆寫上游事實；Finance 不重算薪資。Value Asset 不等於 Fixed Asset Management；DailyCheckIn/Attendance 決定 reward，Ledger 保存 authorized value fact。

## Implementation order

Current owner 已切換的語意回 [Current subdomains](../../000-core/020-domain-map.md)；尚未完成的 Employment/Attendance Payroll handoff 依 [Consumer inventory](030-data-target.md) 與 [Migration gates](../030-migrations/040-enterprise-organization-workforce-payroll.md) 分 slice 實作。Public contract／consistency／security 明確後才改對應 source/schema/remote，不以 rename 替代建模。


## Target bounded contexts

狀態：target boundary design，非 code/package/schema/deployment 完成證據。Current baseline 仍見 [Current contexts](../../000-core/020-domain-map.md)。Context、Business Module、Code Module、Data Boundary 不要求一對一。

## Target contexts

| Bounded Context / candidate | Authority | Minimal public contract | 不擁有 |
| --- | --- | --- | --- |
| Account | global identity/kind、User/BotAccount 自身 lifecycle/qualification、使用者 link confirmation | AccountId、UserId、kind/qualification decision | generic authorization、Domain relationships、reward、Wallet balance |
| Enterprise | governance、EnterpriseInvitation/DirectAffiliation/effective Enterprise users、EnterpriseTeam/Membership/Organization assignment、lifecycle/policy | EnterpriseAccountId、governance/participation/Team/policy projection | Organization Team private state、Employment、Payroll |
| Organization | Organization lifecycle、OrganizationInvitation/direct membership source/effective Membership、OrganizationPolicy；Organization Team capability 的 Organization scope | OrganizationAccountId、participation/source/policy/scope decision | Enterprise governance、Employment、Task private state、RoleAssignment writer |
| Identity/Access | Identity、Principal、Role、Permission、RoleAssignment、AccessDecision | trusted actor、scoped authorization decision | Account lifecycle、業務 invitation/membership/affiliation writer |
| Audit | AuditEvent/AuditLog 保存與受控查詢 | immutable evidence、authorized projection | 改寫 Domain history |
| Billing / Charging | Plan、Subscription、BillingAccount、CostCenter 與 charging / entitlement decision | commercial charging contract | RoleAssignment、Account lifecycle、Accounting、Payment、Settlement |
| Workforce | Employment、terms/policy/calendar/published schedule | EmploymentId、versioned applicable facts | User lifecycle、actual attendance、薪資結果 |
| Work Collaboration | Organization Team/TeamMembership + Task responsibility chain | Team/Task commands/queries、scope/maintainer decisions | Organization lifecycle、Enterprise Team、Employment |
| Attendance | actual sessions、correction、Workplace eligibility、period finalization | Employment-scoped actual facts/finalized version | Workforce schedule、Payroll calculation |
| Payroll | PayPeriod、PayrollRun、PayStatement、versioned finalized result/publication | commands/projections/finalized facts | Employment/Attendance source、bank payment、Finance private model |
| Expense | receipt intake/draft/confirm/cancel | Expense command/query | accounting approval/payment/posting |
| Partner Directory | Partner/Contact/Referral | directory/referral contract | Account registration 或 Team admin |
| Announcement | lifecycle/effective publication | query/publish contract | LINE delivery authority |
| Asset | value type/denomination | AssetCode/AssetDefinition | holder eligibility、reward、設備折舊 lifecycle |
| Wallet | holding/balance projection、target holder eligibility | HolderAccountId + AssetCode projection/eligibility | reward amount、authoritative balance mutation |
| Ledger | append-only value facts、posting enforcement/idempotency | posting/query contract | upstream eligibility/reward decision、Finance accounting |
| Finance | JournalEntry/accounting posting candidate | finalized posting contract when consumer exists | Payroll recalculation |
| Procurement / Inventory / Fixed Asset Management / Sales | 各自 future candidate | 等實際 lifecycle/consumer 定案 | generic ERP catch-all |

DailyCheckIn 是既有合格 User daily reward capability，由 [DailyCheckIn rules](../../010-domain-owners/160-daily-check-in.md) 承接；不為單一既有 use case 另造通用 Reward Bounded Context。

## Account is an identity owner, not a universal business model

```text
AccountId
├─ UserId
├─ EnterpriseAccountId
├─ OrganizationAccountId
└─ BotId
```

同一 ID namespace 不意味共用 lifecycle、role 或 mutable Aggregate。Account root/facet 同 key，Enterprise/Organization 的 private model 各自演進。Principal/Holder 是最小 consumer 使用語意，不生成第二個 identity。

Current 人類 lifecycle worker 已由 Account/User 承接；`Member` literal 只在相容 protocol、storage 或尚未切換的 Attendance stream 保留。未完成 BotAccount target 仍由 [Account target rules](../../010-domain-owners/010-account.md) 擁有。

## Enterprise, Organization and Organization Team

Enterprise 擁有治理關係與 constraints，不把 Organization 當巨大 child graph。Organization 可獨立或屬一個 active Enterprise；關係不是權限繼承。

Enterprise direct participation 使用 `EnterpriseDirectAffiliation`，pending request 使用 `EnterpriseInvitation`。Effective Enterprise user 可以來自 direct affiliation 或 attached Organization 的 active OrganizationMembership；direct affiliation 不等於 Enterprise membership。Current `EnterpriseOwner` authority 另要求 active direct affiliation。

EnterpriseTeam 是 Enterprise-owned current entity；current slice 包含 Team membership 與 Team → Organization assignment。它與 Organization Team 不共用 TeamMaintainer、nested hierarchy 或 private storage。

Organization 擁有自身 lifecycle、Invitation、direct membership source、effective OrganizationMembership 與 owner eligibility；Organization Team 擁有 Team lifecycle/membership、TeamMaintainer invariant 與 Team→OrganizationAccountId。Scoped role assignment 統一由 Identity/Access 寫入。Organization 提供 qualification，不能直接寫 Organization TeamMembership；Organization Team join request 也不建立 OrganizationMembership。

`OrganizationOwner` 是 membership-level owner role，只能由 active individual effective Organization member 持有；Organization Team／Enterprise Team 不可整體成為 Owner。未來 additive/custom Organization role 是否可授予 Team，由 role-specific principal policy 明示。

Organization Team 已是 current source contract；`WorkGroup` 只在 historical／legacy protocol 語境保留，不再是待完成的 target naming migration。需要跨 aggregate invariant 時由 Application/public contract 協調，不共享 private repository。

## Identity / Access and governance ownership

Identity/Access 擁有 Identity、Principal、Role、Permission、RoleAssignment、AccessDecision；各業務 owner 定義其操作與必要資格。[授權與 Policy 契約](040-security-target.md) 決定 scope、撤權與 policy 交集，不把 membership/affiliation 當角色。

EnterpriseTeam → Organization assignment 已用 explicit membership source/provenance 落地：direct Organization membership 與一個以上 `enterprise-team` sources 可共存，effective OrganizationMembership 依 current sources 刷新；撤銷單一 source 不得破壞其他 source，且不能繞過 membership-bound OrganizationOwner invariant。Enterprise Team assignment 本身不授予 OrganizationOwner/TeamMaintainer。

Audit 與 Billing / Charging 各保留自己的語言／owner；Accounting、Payment、Settlement 不併入 Billing umbrella；只有真實 use case 成立才擴 source，不因治理 scope 存在就把 private state 移進 Enterprise。GitHub outside collaborator/resource-level access 與 EnterpriseTeam 作為 role principal 仍是 target，不用 generic Team/Member abstraction 先行模擬。

## Organization and Workforce

```text
UserId + OrganizationAccountId → EmploymentId
```

OrganizationMembership 與 Employment 是不同關係。外部協作者可有 resource access 而沒有 OrganizationMembership/Employment；active User 也不等於 Employee。是否要求 participation 才建立 Employment 由 Workforce activation decision 決定，兩種模型仍分開。

## Workforce, Attendance, Payroll

Workforce 提供 scheduled/applicable facts，Attendance 保存 actual facts，Payroll 產生 compensation result。使用的 version/source 必須可追溯；consumer 不覆寫 upstream history，不用 generic AccountId 代替 EmploymentId。

## Principal, Assistant and BotAccount

Principal 模型由 Identity/Access 擁有，Security/Application 在執行時從可信 proof、current qualification/delegation 建立。LINE Bot 的產品內 automation identity 歸 Account context 的 BotAccount；channel 與官方帳號是外部綁定。新的自主 Bot operation 在 issuer/use case 未核定前不啟用。Organization/Enterprise 是 scope，不掩蓋真正 actor。

Assistant/Agent 維持 interaction/draft/orchestration，透過 owner Application use case。BotAccount 是身份，Agent 是執行機制；兩者都不直接操作 private tables 或取得其他 Context authority。

## Split criteria for future candidates

Finance/Procurement/Inventory/Fixed Asset Management/Sales 只有在獨立語言、lifecycle、invariant、authority 與實際 consumer 成立時升格。Current Asset/Wallet/Ledger 已有 value contract，不再把它們一概標成尚無模型的 ERP candidate。

不因 folder/table/SDK、圖表對稱或「以後會拆」預建 package、service、event bus。Implementation 按 [Migration gates](../030-migrations/040-enterprise-organization-workforce-payroll.md) 驗證後逐步接入。


## Target context map

狀態：target owner/consumer relationship design；current 仍見 [Current Context Map](../../000-core/030-repository-map.md)。箭頭表示明確 contract，不表示 implicit permission inheritance 或跨 package 私有 import。

## Main flow

```text
Account → User identity / current qualification
   ├─ Enterprise → governance constraints → Organization
   ├─ Organization → participation / resource scope
   └─ Identity/Access + verified proof + current qualification/delegation
         → trusted Principal context

Organization context [Organization + Team capability] → Tasks collaboration
Organization + User → Workforce / Employment
Workforce → Attendance → Payroll → Finance

Account → Wallet holder identity
Asset → Wallet / Ledger denomination
Wallet → Ledger holder eligibility
DailyCheckIn / Attendance → Ledger authorized value decision
Ledger → Wallet balance projection
```

Organization 可不屬 Enterprise；所有 business owner 使用所需最窄 identity/decision。Account 不為每個下游都建立 wrapper/facade；只需要 ID 就傳 ID，需要 current decision 才用 public query。

## Context 與 capability contracts

| Upstream owner | Consumer | Contract | Consumer 不可推論 |
| --- | --- | --- | --- |
| Account | Enterprise / Organization | UserId、current qualification | active User 不是 admin/participation |
| Account | Identity/Access | AccountId/kind/qualification | 有 identity 不等於有效 Principal/permission |
| Enterprise | Organization | governance relation/version、policy constraint | EnterpriseAdmin 不取得 Organization private state |
| Organization | Team | OrganizationAccountId、status/participation | Organization 不成為 TeamMembership writer |
| Team | Tasks | TeamId、authoritative scope/membership/manager | Team role 不等於全域功能權限 |
| Organization | Workforce | scope/lifecycle、必要 participation decision | membership 不等於 Employment |
| Workforce | Attendance | EmploymentId、effective terms/schedule/policy | scheduled 不等於 actual |
| Workforce | Payroll | versioned compensation/applicability inputs | active Employment 不等於可 finalize |
| Attendance | Payroll | finalized AttendancePeriodVersion | Attendance 不決定 pay rate/deductions |
| Payroll | Finance | immutable finalized posting projection/fact | Finance 不重算 Payroll private calculator |
| Account | Wallet | stable holder identity/kind | 所有 kind 不自動可持有所有 Asset |
| Asset | Wallet / Ledger | denomination/display definition | Asset 不決定獎勵何時發放 |
| Wallet | Ledger | target holder eligibility contract | holder eligibility 不是 posting authorization |
| DailyCheckIn / Attendance | Ledger | 已授權 value decision、source business key | Ledger 不複製 originating reward amount policy |
| Ledger | Wallet | append-only value facts | Wallet 不另存可寫 balance |
| Organization | existing resource owners | scope contract，僅對已核定 Organization-scoped slice | 不自動改 current personal Expense/global Announcement/Project scope |

## Actor, subject, holder and scope

```text
User / gated BotAccount → PrincipalId
PrincipalId → authorized command → subject / target resource
command acts within → explicit Organization/Enterprise/Project scope
value belongs to → HolderAccountId
```

同一 AccountId 值可以有不同 consumer 使用語意，但不可把 scope account 寫成 audit actor，或把 operator bootstrap 偽裝成普通 User command。Credential、delegation 與 Domain relationship 由各 owner 驗證。

## Owner boundaries

Enterprise/Organization 以 stable keys 與 versioned decision 互動，不共享 private graph。Organization → Team 是同 context 的 aggregate/capability contract；Team 保存自己的 Organization scope，Organization 只提供 participation/lifecycle；Team lifecycle 與 Repository/Issue responsibility 分屬不同 owner；Team membership 不推導 Repository access。

Employment 表達某個 User 在 Organization 的特定工作關係。Attendance/Payroll 不從 current Organization/Team 推歷史歸屬；unknown provenance 保留，不由 Account root 補猜。

首次 Account cutover 讓 Wallet/Ledger 的 internal holder 接 Account identity，Coin 仍僅 USER；新非 USER holder capability 需獨立產品政策。Wallet 擁有 holder eligibility，Ledger enforce，Asset 維持 denomination，不多建 eligibility source of truth。

## Events, projections and consistency

Consumer 不讀 producer private table/Domain model。Sync owner query/command 足夠時不部署 event bus；需要跨程序 committed fact 才轉成 versioned integration event。Audit/history row、outbox、receipt 不自動變 Domain Event。

相同 database transaction 可保護真正跨 owner invariant，但不合併 Aggregate。Sensitive write 仍核驗 current authorization/version；AccountRelation graph 或 cache 若未證明 freshness/revocation，不作敏感 authority。

下游計算 pin 住所用 source/version，upstream correction 不覆寫已引用歷史。External delivery failure 不回滾已 commit business state；unknown result 遵守原 request readback。

## External platforms

LINE/Google/Supabase 先由 Integration/Security 驗證 proof 與 namespace，再由 Account/Data mapping 解析 human identity。AI/Redis 等沒有認證 proof 時不應被描述成「轉成 User」；它們只提供各自 provider capability，不取得任何 Domain authority。

LINE Bot 的 target automation identity 屬 BotAccount；外部官方帳號/channel binding 與人類 source User 分開解析，見 [LINE identity mapping](../../040-data/README.md)。Bot 接收／回覆人類 command 不改變實際 actor。

[Account rules](../../010-domain-owners/010-account.md)、[Public contracts](010-domain-target.md)、[Security](040-security-target.md) 定義具體使用條件。


## Target ubiquitous language

狀態：selected target language，只描述尚未完整 cutover 或跨 owner 需要一致的語意。Current User、Enterprise/Organization governance、Organization-scoped Team 已有 source；current 名稱仍由 [Current language](../../000-core/050-glossary.md) 擁有。Compatibility wire/history literal 不因 target naming 被改寫。

## Identity and actor

| Term | Owner | Meaning |
| --- | --- | --- |
| Account / AccountId | Account | stable identity root/value；不等於 credential、role、membership、Employment 或 accounting account |
| User / UserId | Account | current human product identity/lifecycle；不是 Employee |
| BotAccount / BotId | Account | selected automation identity；存在不代表 autonomous execution 已啟用 |
| AccountKind | Account | `USER | ENTERPRISE | ORGANIZATION | BOT`；一般 mutation 不轉型 |
| ExternalIdentity | Account/Data + Integration proof | provider subject 與 User binding；proof verification 不由 Account table 自行推定 |
| Principal / PrincipalId | Identity/Access | trusted actual actor context；scope account、holder、subject 不可取代 |
| HolderAccountId | Wallet/Ledger | value owner 的 AccountId usage；不等於 actor/Employment |

`Member` 是 compatibility/current Attendance literal，不是 target global identity。AccountId 只定位，不授權；既有 opaque text ID 不因 target 模型被強制轉 UUID。

## Governance and collaboration

| Term | Owner | Meaning |
| --- | --- | --- |
| EnterpriseAccountId | Account/Enterprise | Enterprise stable identity usage |
| EnterpriseInvitation | Enterprise | pending direct Enterprise invitation；接受前不是 affiliation/user authority |
| EnterpriseDirectAffiliation | Enterprise | User 與 Enterprise 的 direct participation source；可形成 unaffiliated Enterprise user |
| EnterpriseUser | Enterprise projection | 由 direct affiliation 或 attached Organization membership 推導的 effective Enterprise population |
| EnterpriseOwner | Identity/Access + Enterprise | Enterprise-scoped RoleAssignment + effective Enterprise user eligibility |
| OrganizationAccountId | Account/Organization | Organization stable scope/ownership identity usage |
| OrganizationInvitation | Organization | pending membership invitation；接受前不是 OrganizationMembership |
| OrganizationMembership | Organization | 已成立的 User participation；與 Invitation/Employment 分離 |
| OrganizationOwner | Identity/Access + Organization | active individual Organization member 的 membership-level owner RoleAssignment |
| OrganizationTeam / TeamId | Team | current Organization-scoped collaboration aggregate；不是 Account/Department/LINE group |
| TeamMembership | Team | User 與 Organization Team participation |
| TeamMaintainer | Identity/Access + Team | Organization Team-scoped RoleAssignment；與 TeamMembership 分離 |
| EnterpriseTeam | Enterprise | target Enterprise-scoped team；不是 Organization Team alias |

`WorkGroup` 只在 legacy/history/protocol literal 保留；current `Team` package 的 domain semantics 已收斂為 Organization Team。`EnterpriseMembership`、`EnterpriseAdmin`、`OrganizationAdmin`、`TeamManager` 不再是 current governance language。

## Authorization vocabulary

| Term | Owner | Meaning |
| --- | --- | --- |
| Identity | Identity/Access | 經可信 proof/mapping 確認的主體；Account 仍擁 lifecycle/link decision |
| Role | Identity/Access | scoped capability grouping；不是 membership/status/kind |
| Permission | Identity/Access | operation capability；不是 scope/identity |
| RoleAssignment | Identity/Access | typed scope 的 role grant authority；具 version/revoke |
| AccessDecision | Identity/Access | 依 Principal、current grant、scope、domain eligibility、policy 得出的當次 allow/deny |
| Policy / Rule / Ruleset | 各 business owner | versioned constraint / single rule / explicit composition；不建立 generic engine |

Current User feature permissions (`users.*`, workplaces/partners) 與 governance RoleAssignment 各自保留現有責任；名稱相近不代表可互相替代。RoleDefinition 必須明確聲明可接受的 principal kinds；Team 可持有某些 additive Organization role，不代表 Team 可以成為 `OrganizationOwner`。

## Workforce

| Term | Owner | Meaning |
| --- | --- | --- |
| Employment / EmploymentId | Workforce | User 與 Organization 的 period-scoped work relation；真正 working subject |
| Employee | Workforce | 具符合條件 Employment 的 User 描述，不是 global identity |
| EmploymentTerms | Workforce | effective/versioned work/compensation terms |
| WorkPolicyVersion | Workforce | published/versioned work policy applicability |
| CalendarEvent / HolidayArrangement | Workforce | calendar source fact／受控安排 |
| ScheduledDay / ScheduledInterval | Workforce | published planned work/rest；不等於 actual attendance |

OrganizationMembership != Employment；TeamMembership != Position/Employment。

## Attendance target

| Term | Owner | Meaning |
| --- | --- | --- |
| AttendanceSession | Attendance | actual clock-in/out fact；target scope EmploymentId |
| Workplace | Attendance | physical location + eligibility config；不是 Team |
| AttendanceCorrection | Attendance | 保留原 fact/version 的可追溯更正 |
| AttendancePeriod / AttendancePeriodVersion | Attendance | Employment + PayPeriod 的 finalized immutable Payroll input |

Current actual stream 仍 Member-compatible；只有 migration gate 完成後才以 EmploymentId 成為 current writer。

## Payroll target

| Term | Owner | Meaning |
| --- | --- | --- |
| PayPeriod | Payroll | explicit calculation period |
| PayrollRun | Payroll | Organization + PayPeriod batch lifecycle |
| PayStatement | Payroll | Employment + PayPeriod versioned result |
| PayrollInputVersion | Payroll | pinned Workforce/Attendance/rule versions |
| Earning / Deduction | Payroll | classified result lines with source/rule |
| GrossPay / NetPay | Payroll | calculated totals；不等於 payment |
| FINALIZED | Payroll | downstream 可引用的 immutable result state |
| PUBLISHED | Payroll | authorized human-readable statement publication；不等於 accounting posted/paid |

Payroll calculation、Finance posting、payment 是不同 authority。

## Value / audit / billing

Asset = value definition/denomination；Wallet = holding/balance projection；Ledger = append-only value facts。Current Ledger 不是 Finance General Ledger。Future physical equipment lifecycle 使用 Fixed Asset Management candidate，不與 Coin Asset 混用。

AuditEvent/AuditLog 是受控 evidence vocabulary，不覆寫 original Domain history。Billing / Charging 的 Plan/Subscription/BillingAccount/CostCenter 是 deferred commercial charging vocabulary；它不等於 Accounting、Payment、Settlement、Role、Organization 或 Finance account。

## Usage rules

Target term 只有在 owner、consumer、invariant/contract 已選定時使用；未完成 source/schema/runtime 必須明示 target。Current owner 已完成 cutover 後，移出「future rename」敘述；wire/history literal 仍可原樣保存以維持 compatibility/recovery。



## Target consistency boundaries

狀態：selected target invariant/transaction design，非未完成能力的 current 證據。Current Account/User、Team 等 boundary 見 [Current consistency](../../000-core/030-repository-map.md)；本頁聚焦尚需 target/cutover 的 consistency。

## Account target delta

AccountId + immutable AccountKind + correct facet 必須形成有效 identity；root/facet 同 key，wrong-kind/missing facet fail closed。BotAccount/Managed User 等 target 不把 Enterprise/Organization/Team/Employment/permission graph 塞進 Account Aggregate。ExternalIdentity provider+namespace+subject uniqueness 由 DB + transaction enforce。

Current User lifecycle/qualification 已由 Account owner 承接；target 不能為了 Account family 重新建第二個 human writer。

## Enterprise / Organization / Team

Enterprise/Organization current governance source各自保護 lifecycle/participation/version，scoped admin role由 Identity/Access RoleAssignment 表達。Enterprise relation不形成 Organization private child graph。

Team 已是 current Organization-scoped boundary；Team/TeamMembership/TeamManager invariant 不描述成「延續 WorkGroup target」。`WorkGroup` 僅在 history/compatibility 保留。EnterpriseTeam 若未來成立是 Enterprise-owned 獨立 aggregate，不重用 Organization Team writer。

## Workforce

Employment 保護 UserId + OrganizationAccountId + effective period/lifecycle/version。EmploymentTerms 同責任有效範圍不可衝突；published/confirmed correction 產生新 version。WorkPolicyVersion、Calendar、Schedule 按各自真實 invariant 分 boundary，不預先塞成巨大 Workforce Aggregate。

ScheduledDay/ScheduledInterval 保護 publication/version、non-overlap 與跨日完整時間；planned work/rest 不等於 actual Attendance。

## Attendance target

指定 EmploymentId 的 stream 保護最多一筆 open session、session non-overlap、clock-out >= clock-in、correction/history、replay/version。Current Member-compatible history 在 cutover 前原樣可解釋；不能只 rename ID 就宣稱 Employment migration。

AttendancePeriodVersion 是 Employment + PayPeriod 的 immutable finalized input。Correction/re-finalization 產生新 version；被 Payroll pin 住的舊版不可原地覆寫。

## Payroll

PayrollRun scope = OrganizationAccountId + PayPeriod，保護：

```text
DRAFT -> CALCULATING -> CALCULATED -> APPROVED -> FINALIZED
```

Input/result/rule version 必須可重建；recalculate 改變結果後重新 review/approval。PayStatement scope = EmploymentId + PayPeriod + calculation version，保護 Earning/Deduction/GrossPay/NetPay 與 PayrollInputVersion trace。

Publication 與 FINALIZED 分開；published != paid != accounting posted。PayrollRun 不把全公司 statements 拉進巨大 single Aggregate/transaction；Application 以明確 completeness contract 協調 batch state。

## Wallet / Ledger / Finance

Wallet 是 projection/eligibility boundary，不建立 writable balance aggregate；Coin current holder 仍 USER-only。Ledger 保存 immutable value facts、denomination integer units、origin idempotency；identity/domain rename 不改 V1 historical source tuple。

Finance JournalEntry 只有真實 consumer 時建立，保護 debit/credit balance、posting state/version/source；Finance 不重算 Payroll。

## Cross-boundary rule

跨 Aggregate 先證明 atomic invariant。Shared DB transaction 不等於合併 model；跨 Context atomic commit 必須有明確 transaction authority/failure/replay semantics。Provider I/O 移出長 DB lock，需要可靠 follow-up 才用 durable expectation/outbox。

[Target persistence](030-data-target.md) 擁有 locking/idempotency/recovery implementation requirements。


## Target event contracts

狀態：target event design。本文只定義已有明確target consumer的business facts；現況跨 Context event 使用原則仍以 [Current integration semantics](../../000-core/030-repository-map.md) 為準。本docs branch不代表event bus/outbox/consumer已實作。

## Event rules

- Event使用已發生、已commit的過去式business fact。
- 沒有具體consumer就不建立event。
- Domain Event不等於audit/history row、command receipt、outbox或provider webhook。
- 跨Context payload只放stable facts，不洩漏private Aggregate graph。
- Consumer若執行敏感command仍重新核驗current authorization/scope。
- Payload使用target semantic identity；Account scope與Principal actor不混用。

## AttendancePeriodFinalized

Producer：Attendance。Consumer：Payroll。

發生條件：指定 `EmploymentId + PayPeriod` 的 AttendancePeriod成功finalized並產生immutable input version。

Minimum payload：

```text
AttendancePeriodFinalized
- eventId
- occurredAt
- employmentId
- organizationAccountId
- payPeriod
- attendancePeriodVersion
```

不包含完整sessions、location evidence、authorization token或database rows。至少一次delivery可接受；consumer以eventId/business key去重。若同步owner query更簡單且沒有async consumer，本event可不部署。

## PayrollRunFinalized

Producer：Payroll。Consumer：Finance。

發生條件：PayrollRun進入FINALIZED，正式PayStatement result與input versions鎖定。

```text
PayrollRunFinalized
- eventId
- occurredAt
- enterpriseAccountId?  # only when downstream governance really needs it
- organizationAccountId
- payrollRunId
- payPeriod
- payrollVersion
- postingReference
```

金額detail預設不全部塞event；Finance優先以 payrollRunId + payrollVersion 取得 owner-approved finalized posting projection。

## PayStatementPublished

Producer：Payroll。Consumers：Notification delivery / Personal Center projection。

發生條件：指定PayStatement正式對該Employment發布，而非僅calculated/approved。

```text
PayStatementPublished
- eventId
- occurredAt
- organizationAccountId
- employmentId
- payStatementId
- payPeriod
- statementVersion
```

不在event放完整薪資明細、User provider identity或recipient token。Notification若需收件者，透過owner-approved projection解析；不讓event持有provider-specific identity authority。

## Events deliberately not created yet

目前不預建 AccountCreated、UserChanged、EnterpriseCreated/Updated、OrganizationCreated/MembershipChanged、TeamCreated/MembershipChanged、EmploymentStarted/Ended、EmployeeClockedIn/Out。Business transition不代表一定需要event；有實際consumer再定義。

## Domain Event vs Integration Event

```text
Aggregate transaction commits
        ↓
Domain business fact
        ↓
Application / outbox translation when cross-process delivery is needed
        ↓
Versioned Integration Event
        ↓
Consumer
```

Internal event與external payload不要求1:1；schema evolution/retry/ordering/dead-letter由integration/persistence owner實作。

## Ordering and replay

Consumer不依賴global total ordering；有ordering requirement用aggregate/statement version明確判斷。Duplicate delivery不得造成重複posting/notification authority transition。Replay event不恢復已撤銷current authorization。


## Target module/public contracts

狀態：target public-contract design。Account/User、Enterprise/Organization governance、Enterprise Team membership/Organization assignment provenance 與 Organization Team 的部分 contract 已成 current source；outside collaborator/resource access、EnterpriseTeam principal roles、Workforce/Payroll 等仍是 target。Bounded Context、Business Module、Code Module 不要求一對一；沿既有 packages/exports/scripts/architecture guards，不預建沒有 consumer 的 facade、adapter 或 service locator。

## Boundary rule

Owner 對 consumer 只提供必要 stable identity、current decision、command/query capability 或 committed fact。不可跨 owner 讀 private Aggregate/repository/DB row/Infrastructure 實作。ID/value 足夠時不用額外 service。

```text
Web / LINE / Agent inbound adapter
    ↓ trusted identity / intent
Application command/query
    ↓ owner Domain / outbound ports
Infrastructure adapters
```

## Account / DailyCheckIn public contracts

[Account rules](../../010-domain-owners/010-account.md) 是 identity/lifecycle business owner。允許最小 AccountId/kind resolution、UserId/qualification/version、safe self/admin summary、controlled identity-link capability 及 owner commands。

External provider proof 驗證由 Integration/Security；Account 確認 link intent，Data 保存 mapping。不公開 raw subject/token/unrestricted Account repository。Account 與 facet 共用 opaque ID；Principal/Holder 不再生新 UUID。

[DailyCheckIn](../../010-domain-owners/160-daily-check-in.md) 擁有每日簽到 command/result/day/amount；消費 User qualification 和 Ledger posting port，balance 由 Wallet 組合。不能讓 Account 繼續 export reward policy 只是換名稱。

## Principal contract

Trusted Application/Security boundary 提供 PrincipalId、actual kind、必要 qualification/delegation 與明確 acting scope。Client requested target 不是 actor；Organization/Enterprise 不能遮蔽真正 User/Bot。是否允許 Bot 由各 command allowlist 決定，沒有 runtime activation 則拒絕。

Current wire/receipt 欄位可以在 versioned cutover 前保留；不可建立 MemberId=UserId 的永久 model/export alias。Type assertion 本身不是 runtime kind/authorization 驗證。

## Enterprise / Organization / Organization Team

Enterprise 公開 EnterpriseAccountId、lifecycle/version、EnterpriseInvitation、EnterpriseDirectAffiliation/effective Enterprise user projection、EnterpriseOrganization relation/version、EnterpriseTeam membership/Organization assignment projection、caller `EnterpriseOwner` 與必要 effective policy；不回 private Organization graph。Direct affiliation 是 participation source，不是 Enterprise membership/Owner。

Organization 公開 OrganizationAccountId、lifecycle/version、OrganizationInvitation、direct membership source/effective OrganizationMembership、caller `OrganizationOwner`、effective OrganizationPolicy decision/source versions、resource-scope decision 與 owner commands；Organization aggregate 不直接寫 Organization Team/Employment。Enterprise Team-derived membership source 由 Enterprise owner mutation + Organization owner narrow source contract協調，不讓 Enterprise adapter取得 unrestricted Organization repository。

Organization Team 公開 TeamId、authoritative OrganizationAccountId、TeamMembership/TeamMaintainer qualification、safe summary 與 commands。Team 不是 Account；Team 自身保存 Organization scope relation。Membership write 與 TeamMaintainer role write 分離。

```text
Invitation ≠ Membership/Affiliation source ≠ Effective Membership ≠ RoleAssignment
```

`OrganizationOwner` 是 membership-level role，只可由 active individual effective Organization member 持有。未來 additive/custom Organization role 是否可由 Organization Team 持有，由 role-specific principal policy 決定；不能泛化成「Team 可當 Owner」。

EnterpriseTeam 是 Enterprise-owned、EnterpriseAccountId-scoped 的獨立 aggregate，不是 Organization Team alias。Current public slice提供：create Team、add/remove Team member、assign/detach Organization、detail projection。Team → Organization assignment 形成 `enterprise-team` Organization membership source；direct 與多個 Team-derived sources 可共存，source removal 只能移除自己的資格並保護 membership-bound owner invariant。

EnterpriseDirectAffiliation、EnterpriseTeamMembership、OrganizationDirectMembership、effective OrganizationMembership、Organization TeamMembership 都是 typed relations，不形成 universal Membership table；每種 relation 的 lifecycle/version、scope 與 revoke 由其 owner保存。Membership/Affiliation 不直接授權；Identity/Access 的 RoleAssignment 是 role grant authority，AccessDecision 還需 domain eligibility 與 policy。

## Adjacent ownership and design-only map

Policy 的長期 owner 按語意分流：EnterprisePolicy 由 Enterprise、OrganizationPolicy 由 Organization、WorkPolicy 由 Workforce；授權 evaluation 由 Identity/Access 擁有，Security/Application 負責執行；Audit evidence 由 [target audit](../../050-security/README.md) 擁有。Accounting、Billing / Charging、Payment、Settlement 的 canonical responsibility boundary 只由 [Glossary](../../000-core/050-glossary.md) 保存；尚無真實 commercial charging consumer 時不維護獨立 Billing proposal、package 或 schema。

若未來 source 需要落地，只沿既有 owner package/layer 分配責任，不因設計 map 預建空 module/package：

| Domain owner | 語意責任 |
| --- | --- |
| `account` | Account identity、User、profile/status/lifecycle |
| `enterprise` | Enterprise、Invitation/DirectAffiliation/effective users、EnterpriseOrganization、EnterpriseTeam membership/assignment、EnterprisePolicy |
| `organization` | Organization、Invitation/direct membership source/effective Membership、OrganizationPolicy、Organization Team scope qualification |
| `team` | current Organization Team、TeamMembership、Team collaboration |
| `identity-access` | Identity、Principal、Role、Permission、RoleAssignment、AccessDecision |
| `audit` | AuditEvent、AuditLog 的不可變保存／受控查詢契約 |
| `billing/charging` | Plan、Subscription、BillingAccount、CostCenter；只表示 commercial charging，不作 finance umbrella |

既有 `team` module 保留，不為資料夾外觀搬動 public exports 或破壞依賴方向。Enterprise Team 已由 `enterprise` owner承接，不新建第二個 generic team package。

## Workforce / Attendance / Payroll

Workforce 公開 EmploymentId 與 UserId+OrganizationAccountId 關係、effective terms/policy/calendar/published schedule versions、missing/conflict result 與 commands。Consumer 不使用 draft/private graph。

Attendance 公開 Employment-scoped current state/history/correction、Workplace 必要 eligibility、finalized AttendancePeriodVersion。Payroll 不得用「沒有 open session」推 complete，不讓 generic AccountId 取代 working relationship。

Payroll 公開 run state/version、本人有權讀的 published statement、calculation trace/missing/conflict、Finance 必要 finalized posting projection 與 commands。Consumer 不得引用 private calculator/repository，也不因 finalized 宣稱 paid/posted。

## Wallet / Ledger holder contract

Wallet target key=HolderAccountId+AssetCode，提供 derived balance 與 holder eligibility。初次 Account cutover 內部 holder 接 Account，但 Coin 仍 USER-only；擴大 kind 能力另有 policy gate。Asset 提供 definition/denomination；Ledger 保存 facts、enforce posting/idempotency 並消費 Wallet eligibility 及來源 owner 授權 decision。

No writable balance、generic update assets、第二個 holder identity 或新 ledger。V1 origin tuple、receipt fingerprint/result 不為 rename 而改寫。

## Ports / adapters / dependencies

Inbound ports 分 command/query/trusted context；requestId/expectedVersion 只按 owner replay/concurrency contract。Outbound ports 只在實際需要 persistence、upstream decision、clock/source、delivery 時出現；依 owner need 命名，不以 Supabase/LINE/SDK 污染 Domain。

Web Route Handler/Server Function/LINE webhook/Agent tool 只作 inbound adapter；具體 wiring 在最外層 composition。DB/provider adapter 不自行授予 business authority。跨 package 只使用公開 exports，不引用 dist/testing/private paths；import type 亦是依賴。

[Dependencies](../../020-architecture/040-dependency-rules.md) 保護實際方向；[Runtime entrypoints](../../020-architecture/050-runtime-architecture.md) 擁有 transport/failure/security boundary。

## Failure / read model

至少保留 not-found、not-qualified/forbidden、kind/scope-mismatch、lifecycle/version/replay conflict、missing/unresolved、upstream-unavailable、unknown-result。不能壓成 null/empty/200 或 generic 500 掩蓋語意。

Cross-context read model 只聚合 owner-approved projection，沒有 write authority；partial failure、empty、forbidden、not-implemented 分開。Authenticated viewer 不建立 `Me`／Personal Center business entity；self projection 仍回到既有 owner contract，不冒充 admin workspace。

## Cutover gate

Implementation 逐項核對 [Consumer inventory](030-data-target.md)，包含 human participant、actor/subject、value holder、delivery recipient、cache、receipt 與歷史 protocol。

Public semantic model 與 existing wire protocol 分開。改 payload/export 必須同步 consumer/validators/tests；保存舊 receipt 解釋能力不等於允許另一個 writer。Source 與 current docs、schema、remote 依 [Migration gates](../030-migrations/040-enterprise-organization-workforce-payroll.md) 放行；本文件只宣稱上述 current source 已存在，未完成 capability 仍明示 target。

