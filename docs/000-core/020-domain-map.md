# Domain map

本文件是 current / selected semantic map 的 human-readable projection；cross-context structured machine truth 由 [`architecture/semantic-model.json`](../../architecture/semantic-model.json) 擁有，Strategic DDD 的 concept definition 與 decision rules 由 [Strategic design](070-strategic-design/README.md) 擁有。這裡回答「目前業務世界怎麼切、每套語言在哪裡有效、誰擁有什麼決策」，不把 package、route、table 或 provider 反推成 Domain。Current implementation 仍以 source/schema/tests 為 evidence；尚未完成的 cutover 與 future capability 只由 [Governance](../090-governance/README.md) 宣告狀態。

## Strategic chain

```text
Business Reality
      ↓
Problem Space
      ↓
Domain
      ↓
Subdomain
├─ Core
├─ Supporting
└─ Generic
      ↓
Bounded Context
      ↓
Ubiquitous Language
      ↓
Context Responsibility
      ↓
Ownership / Decision Authority
```

概念定義依序見 [Business decomposition](070-strategic-design/010-business-decomposition.md)、[Semantic modeling](070-strategic-design/020-semantic-modeling.md)、[Responsibility and ownership](070-strategic-design/030-responsibility-and-ownership.md)。這條鏈是建模順序，不是資料夾階層，也不是「一個 Subdomain = 一個 package = 一個 schema」；某一層已能描述，不代表下一層已經定案。

## Strategic maturity

本表只描述 **current semantic clarity**。Target / selected future design 仍由 [Selected domain target](../090-governance/020-proposals/010-domain-target.md) 擁有，不用 target decision 反向改寫 current。

| Layer | Current status | Canonical reading |
| --- | --- | --- |
| Business Reality | Defined | 本頁 Business reality |
| Problem Space | Defined | 本頁 Current problem-space map + Domain owners |
| Domain | Defined | Enterprise Workforce & Operations Management |
| Subdomain | Defined enough for current routing | 本頁 Current problem-space map |
| Core / Supporting / Generic | **Not fully decided for current** | 只有產品／市場 evidence 足夠時才分類；selected future direction 留 Governance |
| Bounded Context | **Mixed: Selected / Strong candidate / Candidate** | 本頁 Boundary selection state |
| Ubiquitous Language | Defined for current cross-context terms；local language 由 owner 維護 | [Glossary](050-glossary.md) + Domain owners |
| Context Responsibility | Defined where current owner / rules exist | Domain owners |
| Ownership / Decision Authority | Defined for current routing；future authority 另看 Governance | 本頁 Decision authority map |

這個狀態矩陣阻止兩種錯誤：把「已有 owner」當成「Bounded Context 已 Selected」，或把「selected future strategic direction」當成「current classification 已證實」。

## Business reality

LINE Work Assistant 面對的現實不是「做一組頁面」或「建幾個 tables」，而是讓可信操作者在明確 Enterprise／Organization 與工作責任下完成協作、任職、出勤、薪資與企業營運，並讓正式結果可授權、追溯、版本化與恢復。

產品語意以 GitHub 的成熟概念邊界作 benchmark，但不複製 Source Code Management、Git、code hosting 或 software-development-specific semantics。對齊的重點是 naming、responsibility、ownership、relationship 與 information architecture。

### Product semantic anchors

Canonical term definition 只由 [Cross-context glossary](050-glossary.md) 維護。本頁只保存從 GitHub FPT semantic model 蒸餾出的 relationship / ownership constraints，不重抄 term definition。

GitHub FPT 的高價值部分只作 benchmark，不是本產品 authority。從 `schema-users.json`、`schema-enterprise-admin.json`、`schema-orgs.json`、`schema-teams.json`、`schema-repos.json`、`schema-projects.json`、`schema-issues.json`、`schema-discussions.json` 與 `schema-reactions.json` 保留以下語意：

- Repository 是 container authority；Project 可以參照／管理 Repository 與 Work，但不因 planning relationship 取得 underlying content、permission 或 lifecycle authority。
- Project 是獨立 planning boundary，可管理一個或多個 Repository／Work reference；不是 Repository child，也不要求必須跨多個 Repository。
- Project Item 是 planning reference。Project-local field、iteration、view、workflow、status metadata 可以由 Project 擁有，但不得複製成 underlying Work 的第二套 business truth。
- WBS 是 Project 內的 decomposition model，`Project ≠ WBS`；Milestone 是 goal/checkpoint，不能偷換成 WBS phase 或 generic status。
- User identity 與 Enterprise／Organization／Team membership、invitation、repository collaboration、role／permission 是不同 relationship。Identity 本身不得推導 participation 或 authorization。
- Membership／Collaboration 的 role／permission 是 relationship attribute；Invitation 是 pending relationship intent。Pending role／permission、active participation 與 authorization 必須分開判斷。
- Work Item Type、Label、Milestone、state 是獨立維度；Work Item Comment 與 Reaction 是 collaboration/interaction facts，不得被偷換成 Work lifecycle、approval 或 permission。
- Project-owned Field configuration、Status Update 與 View 只擁有 planning metadata／projection；加入 Project 不轉移 underlying Work authority。Workflow／Iteration 等 capability 只有真實 consumer 出現時才進一步建模。
- Profile 是 User semantic 的 read projection；Following／Followers 是同一條 User→User follow relationship 的 outbound／inbound view；`User.repositories` 是 Repository ownership 的 inverse collection view。不得因 UI 或 collection 名稱建立重複 owner。
- Contribution benchmark 保存 observable fact、actor、context、time；Achievement 是由 qualifying events/actions 形成、投影到 Profile 的 derived recognition。GitHub public sources 未公開完整 Achievement definition／qualification／grant／progress contract，因此不得把它們當成已證實的 product model。
- Work 的 type、classification、milestone、dependency、assignee、state 與 project-local field 是可獨立演化的維度；不得為了方便塞成單一 overloaded status。
- Discussion／Comment／Poll／Reaction 是 interaction/conversation semantics；不得直接等同 Notification、business command、approval 或 authorization。
- 財務語意不以模糊的 `Billing` 當總稱；Accounting、Billing/Charging、Payment、Settlement 依責任分開。

Git／branch／commit／pull request／deployment／code scanning 等 software-development-specific FPT semantics 明確排除。上述只形成 semantic constraints；是否已有對應 runtime/schema capability 必須另外看 owner 文件與 Governance evidence。

## Problem space vs solution space

Problem Space 描述即使沒有軟體也存在的業務問題；Solution Space 才是 Bounded Context、Module、Data Boundary、API 與 adapter。

```text
Business problem
      ↓
Domain model
      ↓
Software projection

不是：

table / package / SDK
      ↓
倒推出 business domain
```

## Domain

目前整體 Domain 可概括為 **Enterprise Workforce & Operations Management**。Account identity、LINE、Supabase、Redis、Vercel 等能力支援此 Domain，但 provider 或 technical mechanism 不因存在 package 就自動成為 business Subdomain。

## Current problem-space map

這張表只回答「current repository 已能證明哪些獨立 business problems」。它不是 Bounded Context、Module Boundary 或 Core / Supporting / Generic 的替代表。

| Problem-space area | Current owner evidence | 核心問題 |
| --- | --- | --- |
| Account identity & qualification | [Account](../010-domain-owners/010-account.md) | 建立穩定 User lifecycle，並對當次操作提供 current qualification |
| Enterprise / Organization governance | [Enterprise](../010-domain-owners/020-enterprise.md) + [Organization](../010-domain-owners/030-organization.md) | 建立治理、participation、scope 與 Organization foundation |
| Work collaboration | [Team](../010-domain-owners/070-team.md) + [Repository](../010-domain-owners/080-repository.md) | Team 維持 participation；Repository 獨立維持 access 與 Issue responsibility chain |
| Project planning foundation | [Project](../010-domain-owners/180-project.md) | Current planning data authority；runtime planning capability 尚未啟用 |
| Attendance & workplace eligibility | [Attendance](../010-domain-owners/050-attendance.md) | 保存 actual attendance facts，並判斷 workplace / clock eligibility |
| Daily check-in | [DailyCheckIn](../010-domain-owners/160-daily-check-in.md) | 合格 User 每日明確簽到、防重並形成既有 reward decision |
| Product value definition / holding / posting | [Asset](../010-domain-owners/130-asset.md) + [Wallet](../010-domain-owners/140-wallet.md) + [Ledger](../010-domain-owners/150-ledger.md) | 定義 value、持有投影與 append-only value facts；不是 accounting General Ledger |
| Expense intake | [Expense](../010-domain-owners/100-expense.md) | 收據資料形成可人工核對並確認／取消的 Expense |
| Partner directory & referrals | [Partners](../010-domain-owners/110-partners.md) | 維護 Partner/Contact directory 與 Referral lifecycle |
| Notifications | [Notifications](../010-domain-owners/090-notifications.md) | 維護 recipient-scoped inbox、read state 與 delivery projection；不擁有 source Issue/Discussion truth |

`Assistant` 目前是 interaction / orchestration 能力，不因有 module 就升格成獨立 business problem。Workforce module foundation 與 Project data authority 已是 current；Employment runtime、正式 Payroll 與 Finance 等未完成能力只看 [Governance](../090-governance/020-proposals/010-domain-target.md)。

## Subdomain strategy

Core / Supporting / Generic 是資源投入與建模深度的分類，不是安全等級，也不決定 package layout。

Current repository 已能辨識主要 problem-space areas 與 owner，但 **current Core / Supporting / Generic 並未取得足夠產品／市場 evidence 全面定案**。因此本頁不把 implementation size、文件數量、現有投入或 target proposal 當作 current classification 證據。

目前只安全保留兩層資訊：

1. **Current problem-space routing**：由本頁與各 [Domain owner](../010-domain-owners/README.md) 描述。
2. **Selected future strategic direction**：Workforce → Attendance → Payroll 是產品已選的 target focus；其 Core / Supporting / Core-adjacent 等分類只在 [Selected domain target](../090-governance/020-proposals/010-domain-target.md) 維護。

若要把某 current Subdomain 正式分類成 Core / Supporting / Generic，至少要有產品層 evidence 回答：

- 哪個 capability 直接形成主要差異化價值。
- 哪些能力改用成熟外部方案也不會削弱核心價值。
- 哪些能力值得長期累積專有 model / rule / policy。

Finance、Procurement、Inventory、Fixed Asset Management、Sales 等 future candidate 只有在出現獨立語言、lifecycle、invariant、authority 與真實 consumer 時才升格；未滿足條件時留在 Governance，不預建空 Context。

## Bounded Context

Bounded Context 是一套 Domain Model 與 Ubiquitous Language 保持一致的語意邊界。判斷一個 Context 是否成立，至少回答：

1. **Language**：核心名詞在這裡代表什麼。
2. **Model / rules**：哪些 state、transition、calculation、invariant 由它決定。
3. **Authority**：衝突時誰決定合法結果。
4. **Boundary contract**：外部只能取得哪些 stable identity、query、command 或 committed fact。

```text
Subdomain
≠ Bounded Context
≠ Module Boundary
≠ Data Boundary
≠ Consistency Boundary
```

它們可以高度對齊，但不得機械視為同一概念。

### Boundary selection state

以下狀態保留 consolidation 前 current Bounded Context baseline 的語意；`Selected` 只表示 model / language / authority boundary 已選定，不代表 migration、deployment 或 production acceptance 完成。

| Context | Current boundary status | Current authority summary |
| --- | --- | --- |
| DailyCheckIn | Selected | daily business-day check-in / reward policy + atomic claim |
| Asset | Selected | value definition / denomination |
| Wallet | Selected | holder + Asset holding identity / derived balance projection |
| Ledger | Selected | append-only value facts / posting identity |
| Account | Strong candidate | User lifecycle / qualification / external identity-link confirmation |
| Attendance | Strong candidate | attendance sessions / workplace eligibility / clock reward decision |
| Expense | Strong candidate | expense intake / draft-confirm-cancel semantics |
| Partner Directory | Strong candidate | Partner / Contact / Referral lifecycle |
| Notifications | Strong candidate | recipient inbox / read-state / delivery projection |
| Work Collaboration | Candidate | Organization-scoped Team participation + Repository access / Issue responsibility |

其他 business owner 即使已有 package、schema 或文件，也不能只靠 implementation existence 自動升格成 Selected Bounded Context；需要依上面的 Language / Model / Authority / Contract 四項重新判斷。Future boundary selection 只看 Governance proposal，不覆寫 current。

## Ubiquitous Language

同一 Context 內，business conversation、docs、code、API、tests 應盡量使用同一個 canonical term。跨 Context 易混淆詞由 [Cross-context glossary](050-glossary.md) 維護；owner-local vocabulary 留在各 [Domain owner](../010-domain-owners/README.md)。

## Context responsibility

每個 owner 的 canonical 文件逐步使用 Owns / Consumes / Does Not Own，再補 invariant、policy、consistency 與 public capability；格式與判斷見 [Responsibility and ownership](070-strategic-design/030-responsibility-and-ownership.md)。

## Decision authority map

這張表回答「誰最後有權決定」，不表示 consumer 可以讀 private model，也不把 target capability 冒充 current runtime。

| Decision / truth | Authority | Current status note |
| --- | --- | --- |
| Human User lifecycle / current qualification | Account / User | Current |
| External LINE identity proof | LINE integration / security verification | 只證明 provider identity，不授予 business permission |
| Enterprise governance transition | Enterprise | Current bounded slice |
| Organization lifecycle / participation | Organization | Current bounded slice |
| Team participation / Team lifecycle | Team | Current |
| TeamMaintainer RoleAssignment writer | Identity / Access | Team 提供 business eligibility；RoleAssignment writer 不複製 Team state |
| Issue publish / accept / report / approve responsibility | Repository | Current |
| Employment validity / terms / schedule | Workforce | Selected target / current foundation；完整 activation 另看 Governance |
| Can clock-in / clock-out、Workplace eligibility、Attendance reward | Attendance | Current |
| Payroll readiness | Payroll | Current foundation |
| Formal Payroll calculation / finalization / publication | Payroll | Selected target；未完成不得冒充 current |
| Daily check-in eligibility / reward decision | DailyCheckIn | Current |
| Asset denomination | Asset | Current |
| Wallet holding / balance projection | Wallet | Current projection，不是第二 writable balance authority |
| Append-only value posting history | Ledger | Current |
| Expense intake state | Expense | Current；confirmed != approval/payment/accounting |
| Partner / Referral lifecycle | Partners | Current |
| Notification inbox / read-state / delivery projection | Notifications | Current |
| Shared cross-owner namespace scope / reservation / collision policy | Namespace | Current global-root reservation slice；owner-local name format、rename、number allocation 仍由各 owner 決定 |
| Feature permission / scoped access decision | Identity / Access + owning business policy | identity proof / membership 不自動推導 permission |
| Accounting / Payment / Settlement | 尚未有 current universal owner | 只有真實 use case / consumer 出現後才建立，不併入 Billing umbrella |

Consumer 可以讀 owner 提供的 contract，但不能重新定義 owner 的 state、policy 或 lifecycle。

## Current vs selected future

Current business semantics 直接讀 [Domain owners](../010-domain-owners/README.md)。跨 owner relationship、integration semantics 與 implementation mapping 讀 [Repository map](030-repository-map.md)。

尚未完成的 Employment、Attendance cutover、正式 Payroll、Finance 等設計維持在 [Selected domain target](../090-governance/020-proposals/010-domain-target.md) 與 migration/gap/evidence 文件；本頁不把 target naming 冒充 current runtime evidence。
