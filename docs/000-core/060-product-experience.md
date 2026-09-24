# Product experience

本文件擁有跨 Domain 的 current product purpose、actor responsibility 與 mobile/admin/external-entry UX semantics。它不建立第二套 business authority；各狀態轉移仍由 owning Domain 決定。

## Product definition

## Product purpose

LINE Work Assistant 讓可信使用者從 LINE 為主的行動入口，在明確 Enterprise／Organization 與工作責任下完成協作、任職、出勤、薪資與企業營運，並能判斷結果是否真正成立。Desktop Web 提高資訊密度，但不建立第二套 business authority。

Current implementation 已由 Account/User、Enterprise／Organization governance、Organization-scoped Team、Repository/Issue、Attendance、Expense、Notifications、Partners、DailyCheckIn、Asset/Wallet/Ledger 與 Assistant 等 owner 承接。Workforce／Employment、Attendance Employment cutover 與正式 Payroll 仍是後續 target；下列 target direction 不是未實作能力的交付聲明。

## Selected target direction

```text
Account identity / human User
        ↓ supports trusted participation
Enterprise governance (optional for Organization)
        ↓
Organization business/data scope
    ├─ Team / collaboration
    └─ Workforce / Employment
          ↓
       Attendance
          ↓
        Payroll
          ↓ finalized facts, when consumer exists
        Finance
```

Enterprise 負責跨 Organization 治理；Organization 負責自身 participation/admin 與 scope；Team owner 負責 collaboration membership，不由 Organization 複製第二份 lifecycle。

Workforce 表達 User 與 Organization 的 Employment 與 versioned terms/policy/calendar/schedule；Attendance 保存 actual facts；Payroll 產生可追溯 calculation/statement；Finance 與其他 enterprise operations 按真實需求接 finalized facts。

Account 是 identity foundation，不是新通用帳號平台。Current Account identity family 由真實 User、EnterpriseAccount、OrganizationAccount responsibility 構成；LINE webhook `destination` 與 channel credentials 留在 external integration boundary，不形成 Account identity。Principal 表示真正操作者；Team/Employment 不是 Account。未來 autonomous Bot identity 若取得真實 use case，才由 [Target language](../090-governance/020-proposals/010-domain-target.md) 重新評估。

LINE MINI App/Bot/Web/Assistant/Agent 是 interaction，Supabase/Google/AI/Redis 是 integration/infrastructure。LINE integration 擁有 Bot protocol／credentials／signed destination context；Identity/Access 與各 Domain owner 擁有 actor／authority／qualification。詳見 [Account rules](../010-domain-owners/010-account.md)、[LINE channel boundaries](../030-platform/010-line.md)、[External identity mapping](../040-data/050-identity-mapping.md) 與 [Target authorization](../050-security/030-authorization.md)。不能由工具存在推定自主授權或正式寫入已開放。

## Current delivered-result baseline

目前 repository 已有實質 source/contract 的使用者結果包括 User qualification／既有 Member wire 相容流程、Organization-scoped Team/Task 協作、合格 Workplace 打卡、收據 Expense intake/draft/confirm/cancel、公告、Partner/Referral、DailyCheckIn reward 與 Assistant answer/draft。

Expense confirmed 不代表核准/付款/會計 posted；Assistant draft 不直接形成 formal write；開啟 Diary 或其他 external form 不代表本系統收到提交。完整 Workforce/Payroll 與 remote/device 驗收狀態另見 [Acceptance evidence](../090-governance/060-acceptance/README.md) 與各 gaps，不能由頁面/adapter 存在推定。

## Product invariants

- 導覽/page/button/URL 不授權；identity、participation、Employment、Team role 與 feature permission 不互推。
- Side effect 以 server durable result、version、request replay 判斷；client cache 不冒充成功。
- Loading、empty、forbidden、source failure、not-implemented 與 unknown-result 可區分。
- Provider/AI/Rich Menu/cache/projection 不成第二個 writable source of truth。
- Target identity/scope cutover 保留原 ID/ownership、history/version、authorization、reward/idempotency 與 recovery；未知歷史不猜 Organization/Employment。
- 未啟用能力明示未開放，不以假資料或空殼操作製造完成感。

## Current non-claims

未取得相應 source/test/remote/business evidence 前，不宣稱完整 Account 全 protocol cleanup、多 Enterprise/Organization production acceptance、法定工時/正式 Payroll、完整費用審批/付款/會計、故障時第二 writable truth 自動接管或自主 Agent business writer。現有 LINE bot runtime 只依 provider channel proof／signed webhook context 運作；不宣稱 autonomous Bot actor、delegation 或 business writer 已啟用。

這些是尚未完成，不是永久非目標。Non-USER wallet、Bot execution、Payroll formula 等需各自 product/security/source gate，不能因 enum/table/API 名稱存在就認為啟用。

## Strategic focus and stages

人力營運核心仍是 Workforce → Attendance → Payroll。先維持目前 Account/Organization/Team 與既有功能，再依 bounded vertical slice 建立 Employment 與 versioned Payroll inputs，不一次鋪滿 ERP、通用 IAM 或 reward framework。

Current／target／evidence 必須隨 source 演進同步；Supabase 遠端、Vercel 部署、API/LINE/device 各有獨立證據。[Migration stages](../090-governance/030-migrations/040-enterprise-organization-workforce-payroll.md) 擁有放行順序，不能把 target 選型標為 implementation 完成。

## Adjacent owners

- [User responsibility model](060-product-experience.md)
- [Product experience](060-product-experience.md)
- [Business modules](../010-domain-owners/README.md)
- [Domain map](020-domain-map.md)
- [Account decision](../090-governance/010-decisions/070-account-identity-design.md)
- [Governance](../090-governance/README.md)


## User responsibility model

產品層描述使用者以哪些責任參與工作，不建立全域 role 階層或把 persona 送到 server 作 authority。Authorization 仍由 Security 與各 module 擁有。

## Current identity baseline

Current 人類產品 identity 由 Account/User worker 承接，lifecycle 使用 `active | paused | suspended`。`Member`／`member_id` 仍可存在於既有 wire、receipt、storage 或 Attendance current stream，但不是第二套 current Domain identity。LINE／Google／Supabase Auth 只是 provider proof／mapping；登入成功不等於 User qualification 或任何 business role。

Current Team 已是 Organization-scoped Team/TeamMembership；TeamManager 由 Identity/Access 的 typed RoleAssignment 決定。WorkGroup 只在需追溯的 legacy/history/protocol 語境保留，不作 Team 的 current Domain alias。

## Target responsibility model

Target 中，人類產品 identity 的正式名稱是 User，Account family 另包含 EnterpriseAccount、OrganizationAccount 與 BotAccount。後兩種治理／資源 scope 不是人類登入者；Bot 執行需另外通過明確 use case／credential／delegation gate。

```text
User
├─ EnterpriseAdmin
├─ OrganizationMembership
├─ OrganizationAdmin
├─ TeamMembership
└─ Employment → Employee description

User / gated BotAccount → actual Principal
eligible Account → value holder
```

| Dimension | Product question | Owner |
| --- | --- | --- |
| User qualification | 這個 User 目前能進入哪些類型操作 | Account |
| Enterprise governance | 能否治理指定 Enterprise 與其 governance policy | Enterprise |
| Organization participation | 能否參與指定 Organization | Organization |
| Organization administration | 能否管理該 Organization lifecycle/membership | Organization + Identity/Access role assignment |
| Team collaboration | 屬哪個 Team、具何種 collaboration responsibility | Team |
| Employment | 哪段具期間的工作關係 | Workforce |
| Task responsibility | 特定 Task 的 publisher/assignee/review 責任 | Repository/Issue / Work Collaboration |
| Feature permission | 特定敏感操作是否被明確授權 | Identity/Access + capability owner |
| Workplace eligibility | current stream 的本人／target Employment 當次能否在此 Workplace 打卡 | Attendance |
| Record/value ownership | 哪些個人／組織資料或 value 歸誰 | 各 resource owner / Wallet-Ledger contract |

外部會計師可有 active User 與 OrganizationMembership 但沒有 Employment；正式員工可同時有 participation/Employment/TeamMembership，但仍不自動有 Payroll approval 或 EnterpriseAdmin。

EnterpriseAdmin 只有治理責任，不自動取得某 Organization private data。Organization workspace 切換是 view/acting scope，不代表變成 Organization 登入或隱藏真正 Principal。

## Current responsibility dimensions

目前 source 已區分 User qualification、OrganizationMembership、TeamMembership/TeamManager、Task responsibility、feature permissions、Workplace eligibility 與 Expense/Referral 等個人 owner。`members.*` permission、`membership_denied` wire code、部分 Member ID/storage 仍是相容 protocol，不因此恢復 Membership Domain owner。

Attendance current writer 仍以 Member-compatible working stream 保存 actual sessions；Employment-scoped subject 是明確 target，必須依 migration gate 切換，不能因 User/Team 已收斂就宣稱 Attendance 也已完成 Employment cutover。

## Product personas

User、Enterprise governor、Organization participant、Employee、scoped collaborator、scoped manager/reviewer、feature administrator 是產品描述，不是可直接送 server 的 authorization role。

一人可同時屬多分類與多 Organization/Employment。Bot 是 automation identity，不是自動員工／打卡者／每日簽到領取者；未啟用的 target 能力不應在 UI 模擬成功。

## UX implications

先取得 caller 合法 projection，再顯示正確 Organization/Employment 與可用 Team/Attendance/Payroll。只有一個合法 scope 可 UX 預選，但 server 仍驗 explicit identity/current relation。

View visibility、URL、last selected scope 不是 authority。登入換人／切 scope／revoke 後取消或隔離舊請求，晚回的舊 response 不得覆蓋新 actor state。Empty、forbidden、missing、unavailable、not-implemented 分開顯示。

Provider expired 不無故改 User/Organization/Team/Employment 狀態。Personal Center 只組合本人 owner-approved projection，不成跨組織 admin impersonation 入口。

## Canonical owners and stage status

- [Current Account](../010-domain-owners/010-account.md)、[Account target rules](../010-domain-owners/010-account.md)：current／target qualification 與 identity lifecycle。
- [Target language](../090-governance/020-proposals/010-domain-target.md)：Account/Principal/holder 與未完成 relationships。
- [Team](../010-domain-owners/070-team.md)、[Organization](../010-domain-owners/030-organization.md)、[Workforce](../010-domain-owners/040-workforce.md)：不同責任 owner。
- [Security](../050-security/README.md)：viewer／private projection 的授權與 privacy 機制；self view 不建立第二套 User locator。
- [Migration stages](../090-governance/030-migrations/040-enterprise-organization-workforce-payroll.md)：source/schema/remote/release 各自依實際 slice 驗證。


## Mobile workspace

## 目的

LINE Work Assistant 的行動體驗目標不是把所有能力塞進單一首頁，而是讓會員在手機上快速找到當下工作、完成一個明確操作，並能判斷結果是否可信。

頁面與入口不授予權限；有 internal business state 的能力仍由對應 `010-domain-owners/*` 擁有角色、狀態與操作規則，單純 external entry 則由本產品體驗與 integration owner 承接。

## 主要使用體驗

目前工作區提供的使用者工作面包括：工作台、出勤、外部工作日誌入口、任務、團隊協作、公告、合作夥伴、工作紀錄、個人資料、回饋與管理工作區。這是產品能力／入口語意，不在 Product 文件維護正式 URL 清單；URL 與 route owner 由 [Web route contract](../020-architecture/050-runtime-architecture.md) 擁有。

跨能力體驗遵守以下原則：

- 手機優先，主要流程維持清楚主次；有副作用的畫面只提供明確、可確認的主要操作。
- `loading`、真正無資料、無權限、來源失敗與尚未開放必須分開呈現；查詢失敗不得冒充空清單。
- 網路結果未知與確定失敗分開。若能力支援同命令重試，必須沿用原 requestId 與原內容，不因 UI 重試建立第二個業務命令。
- 換帳號、登入失效或角色改變後，不保留前一身分的私有畫面；較舊的非同步回應不得覆蓋新身分狀態。
- 外部表單與外部連結只表示「開啟外部服務」；開啟不等於已提交、核准、付款、建立案件或完成工作。
- callback、return page 或畫面提示只有在後端／外部權威結果可確認時才能顯示成功。

外部表單／連結的產品語意集中於 [External entries](060-product-experience.md)，不為每個外部入口建立假的 Business Module。

## 新功能啟用條件

在建立新的可提交畫面、module、資料表、通知流程或 LINE 入口前，至少要先回答：

1. 使用者要完成什麼結果。
2. 權威資料來源是什麼。
3. 資料屬於本人、團隊、專案或其他範圍中的哪一種。
4. 哪些責任可以讀取與執行操作。
5. 正式狀態轉移與完成條件是什麼。
6. 取消、拒絕、逾時、衝突、未知結果與恢復如何處理。

缺少上述條件時，只保留未決事項，不用假資料、假按鈕或空殼流程模擬已完成能力。

## 相鄰責任

- Product definition：`../010-overview/`
- 模組內流程：`../010-domain-owners/`
- LINE MINI App／LIFF：`../030-platform/010-line.md`
- LINE Rich Menu／Messaging：`../030-platform/010-line.md`
- Browser／Server／API runtime：`../020-architecture/050-runtime-architecture.md`
- Authorization：`../050-security/030-authorization.md`
- 未決設計：`../090-governance/040-gaps/`


## Admin workspace

## 目的

管理工作區的產品目標是讓具有明確管理責任的人找到資料、完成合法操作並查明結果；管理首頁只負責導覽，不建立第二套業務資料，也不把「看得到入口」當作已授權。

各管理能力沿用原 module 的權威資料與 business rule。管理畫面只組合查詢、確認與結果，不為相同業務另建管理專用資料模型。

## 目前能力狀態

已接實際業務能力的管理工作面包括：

- User 查詢／狀態管理；現有 `members.*` permission 與部分 Member wire 名稱屬相容 protocol。
- Partner directory 管理。
- Workplace 管理。
- Feature permission 管理。
- Organization-scoped Team collaboration 管理入口由 Team owner 保護其 scope／membership／manager invariant。

目前仍明確未開放或未形成完整產品能力的管理工作面包括完整 Attendance 管理、完整 Payroll、統一 Audit 查詢與 generic system settings。

正式 URL 與 route ownership 由 [Web route contract](../020-architecture/050-runtime-architecture.md) 擁有；本文件只描述產品狀態，不維護第二份 path 清單。

未開放頁可以說明預期目的，但不得查詢私有資料、提供可提交的假操作，或用靜態 UI 暗示後端能力已存在。

## 跨模組畫面原則

管理頁採「查詢先行、必要操作逐項開放」：清單使用 stable ID；篩選／直接連結／重新整理都重驗身分與 scope；尚未登入、forbidden、empty、failure、version conflict 與 unknown result 分開；有副作用操作先顯示對象與影響並以 server durable result/receipt 判定成功。換帳號或撤權後不能沿用前一身分的私有列表／操作狀態。

## 權限

管理工作區不定義 `admin = everything`。已實作管理能力使用獨立 feature permission 或具名 scoped RoleAssignment；詳細契約見 [Feature permissions](../050-security/030-authorization.md) 與 [Target authorization](../050-security/030-authorization.md)。

TeamManager、partner reviewer、workplace manager、OrganizationAdmin 等責任只在各自範圍生效，不互相推導其他管理能力。直接開啟子頁或 API 仍需獨立授權。

## 不做事項

沒有正式需求與 owner 前，不預建通用角色編輯器、通用審批引擎、任意批次改狀態、AI 自動判定管理結果、第二套資料同步副本、任意 key-value 設定編輯器或部署／秘密／資料庫清理按鈕。

尚未落地能力的完成條件由 [Admin workspace gaps](../090-governance/040-gaps/020-admin-workspace.md) 追蹤，不在本文件宣稱實作完成。

## 相鄰責任

- Account：`../010-domain-owners/010-account.md`
- Team：`../010-domain-owners/070-team.md`
- Attendance／Workplace：`../010-domain-owners/050-attendance.md`
- Expense：`../010-domain-owners/100-expense.md`
- Partners：`../010-domain-owners/110-partners.md`
- Authorization：`../050-security/030-authorization.md`


## External entries

## Responsibility

有些產品入口只負責把使用者導向既有外部服務。這些入口是 Product Experience，不因存在 Web page / module 就自動成為 Business Module、Bounded Context 或 internal workflow。

## Current external-entry semantics

目前可觀察的外部表單入口包含：

- **Work Diary**：產品提供固定外部表單入口；本系統不保存表單回覆，也沒有可信 submission receipt、會員關聯或審核狀態。
- **Expense application external form**：LINE 入口可導向既有外部表單；它與 `010-domain-owners/100-expense.md` 的 receipt intake / draft / confirm 資料模型是不同流程，不能互相冒充狀態。
- **Leave application external form**：目前是 external entry，尚未建立 internal Leave / Employment / Calendar workflow。

其他外部表單若沒有可核驗 source、identity mapping、state machine 與 recovery contract，也沿用相同原則。

## Result semantics

對 external entry，產品只能可靠宣告：

```text
使用者要求開啟
→ 產品產生受控外部目的地
→ browser / LINE 嘗試導向
```

「開啟外部服務」不能自動顯示為：

- 已提交
- 已建立案件
- 已核准／已拒絕
- 已付款
- 已同步到本系統
- 已完成工作

若未來要顯示這些結果，必須先取得外部系統可驗證的 source / receipt、可信 identity correlation、授權與 failure/recovery semantics，再決定是否建立真正 Business Module。

## Privacy

外部連結不得為了方便追蹤就附加 Member ID、LINE user ID、session/access token 或其他未經契約定義的個人識別資料。外部 provider 自己的表單資料處理與權限由 integration / provider contract 管理。

## Owner boundary

- Product 擁有入口目的、文案與「外部結果不可被誤宣稱」的 UX 語意。
- Web / Runtime 擁有正式 route 與 browser 導向。
- LINE / Google 等 integration 擁有 provider API / URL / OAuth 等技術契約。
- Governance gaps 擁有「何時升格為 internal workflow」的未決完成條件。

目前不再維護獨立 Diary business module 文件；若 Work Diary 未來產生 internal state，再依真正模型建立新的 module owner。

## 相鄰 owner

- Mobile experience：[Mobile workspace](060-product-experience.md)
- Route contract：[Runtime architecture](../020-architecture/050-runtime-architecture.md)
- LINE Messaging：[LINE](../030-platform/010-line.md)
- Google Workspace：[Google Workspace](../030-platform/050-google-workspace.md)
- External workflow gaps：[`090-governance/040-gaps/030-external-workflows.md`](../090-governance/040-gaps/030-external-workflows.md)

