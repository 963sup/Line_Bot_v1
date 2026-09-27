# Selected security target

狀態：selected future security design，不是 current authorization/data isolation/audit implementation claim。Current contract 回 [Security](../../050-security/README.md) 與實際 owner source/tests。

## Authorization chain

```text
verified identity proof
        ↓
trusted Principal
        ↓
current qualification / explicit delegation
        ↓
scoped permission / RoleAssignment
        ↓
authoritative resource / Organization / Employment scope
        ↓
owner lifecycle / invariant / expectedVersion
```

AccountId、AccountKind、URL、UI、LINE group、provider role、RLS hit、elevated DB credential 都不能跳過本鏈。

## Actor semantics

Principal、subject、scope、holder 必須分開：

- Principal：真正 caller。
- subject：操作針對的 User/Employment/resource。
- scope：Enterprise/Organization/Team/Employment/Repository 等 authority boundary。
- holder：value owner。

Organization selection 只改 acting scope，不把 Organization/Enterprise account 冒充 human actor。Human-only relation 不因 Bot/AI/provider identity 存在而自動開放。

## Current vs target

Current typed permissions / RoleAssignments 由 [Authorization](../../050-security/030-authorization.md) 擁有；本文件不重抄 current EnterpriseOwner、OrganizationOwner、TeamMaintainer 規則。

尚未 current 的 security delta只有：

- Employment-scoped Workforce/Attendance authorization。
- Payroll calculate/approve/finalize/publish/correct 的 segregation、scope 與 self-read。
- 真實 consumer 出現後的 explicit Bot delegation。
- 需要時的新增 role principal kinds；不得因 Team 存在就泛化所有 role。

## Workforce / Attendance / Payroll

Target rules：

- Employment command/query 必須重新驗 current User qualification、Organization scope 與 Employment lifecycle。
- Attendance command 只接受合法 Employment scope；historical unresolved provenance 不授權。
- Payroll management permission、approval/finalize permission、self-read privacy 分開。
- Published PayStatement self-read 必須透過合法 User ↔ Employment 關係；OrganizationMembership、Team role 或 Enterprise scope不自動授權。
- Cross-Organization source/read/write 一律拒絕。
- Revoke/suspend/end/detach 後下一次 sensitive operation 重驗 current authority。

## Bot / Assistant

Assistant output 是 untrusted draft，不是 authority。Bot 只有在有真實 business consumer、stable Bot identity、delegation owner、scope、expiry/revoke、audit、negative tests 與 recovery 後才能成 Principal。Prompt、provider session、LINE destination 或 tool presence 不授權。

## Audit

Audit 保存 evidence，不覆寫 Domain history。最小 context：

- actual PrincipalId
- subject/resource
- scope
- operation
- request identity
- expected/current version where relevant
- result / reason
- timestamp / correlation

Audit read 本身需要 authorization；不能因能查 audit 就取得 source object、secret 或 attachment。

## Failure / privacy

至少區分 unauthenticated、not-qualified、forbidden、not-found、scope/kind mismatch、validation/lifecycle failure、version/replay conflict、upstream unavailable、unknown result。不能用 200+null、redirect 或 generic 500 隱藏。

Private projection 採 minimum necessary disclosure；browser cache、navigation state、provider payload 不成 authorization source。換帳號、revoke 或 scope change 後，舊私有 response 不得覆蓋新 state。

## Activation gate

新增 permission、role principal、delegation 或 security abstraction 前必須有真實 owner/consumer。只有「未來可能需要」「GitHub 有」「看起來較完整」不足以建立 generic IAM/policy engine。

每個 target slice至少驗：

- unauthenticated / forbidden / wrong scope / revoked
- stale version / exact replay / unknown result
- cross-tenant isolation
- browser unreachable secrets
- owner authorization 與 RLS/grants defense-in-depth 都成立

## Routing

- Current authorization：[Authorization](../../050-security/030-authorization.md)
- Scope/isolation：[Scope and data isolation](../../050-security/040-scope-and-data-isolation.md)
- Target domain：[Selected domain target](010-domain-target.md)
- Target data：[Selected data target](030-data-target.md)
- Active migration：[Migration](../030-migrations/040-enterprise-organization-workforce-payroll.md)
