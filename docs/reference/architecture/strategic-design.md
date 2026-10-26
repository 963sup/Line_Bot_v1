# GitHub 非程式碼業務模型與子域策略

本文件只解釋產品取捨與閱讀路徑；current 子域分類、Owner、context status 與證據以 [semantic model](../../../architecture/semantic-model.json) 為準。GitHub 名稱及定義直接取自 [pinned FPT](../../../architecture/domain/fpt/)，不在本文件建立另一套語意或 package 清冊。

## 產品策略與範圍

2026-10-13 確認的產品方向：**企業協作為核心，獎勵與營運支援協作**。子域分類表達投資與差異化取捨，不代表 module kind、資料表歸屬或部署單位，也不改變既有 business authority。

組織治理、成員關係、協作資源與存取控制優先沿用 GitHub 的非程式碼模型。Git、Branch、Commit、Pull Request、Actions 等 code/SCM capability 不納入本次模型整理；其 pinned FPT domain truth 與既有 selected targets 仍保留，分類不代表啟用 runtime。

通用身分、權限、通知與稽核採成熟模型；本產品自己的 qualification、scope、版本與授權不變條件仍由既有 Owner enforce。LINE／Google adapter、platform 技術機制與純應用協調模組不因存在 package 就成為業務子域。

## 沿用模型的 Owner 路由

| GitHub 概念／關係 | 本產品責任入口 | 直接 FPT 來源 |
| --- | --- | --- |
| Enterprise | [Enterprise](../../owners/enterprise.md)：企業治理與 Enterprise Team | [schema-enterprise-admin.json](../../../architecture/domain/fpt/schema-enterprise-admin.json)，`Enterprise` |
| Organization | [Organization](../../owners/organization.md)：組織生命週期、邀請與成員資格 | [schema-orgs.json](../../../architecture/domain/fpt/schema-orgs.json)，`Organization` |
| Team | [Team](../../owners/team.md)：Organization 內的成員分組、Maintainer 與階層 | [schema-teams.json](../../../architecture/domain/fpt/schema-teams.json)，`Team`、`TeamMemberRole` |
| Member 關係 | Organization／Team 擁有各自 membership；個人 User 由 [Account](../../owners/account.md) 擁有 | [schema-users.json](../../../architecture/domain/fpt/schema-users.json)，`OrganizationMemberEdge`、`TeamMemberEdge`；[schema-orgs.json](../../../architecture/domain/fpt/schema-orgs.json)，`OrganizationMemberRole` |
| Collaborator 關係 | [Repository](../../owners/repository.md) 擁有直接 User／Team 存取 grant；不建立第二種個人身分 | [schema-users.json](../../../architecture/domain/fpt/schema-users.json)，`RepositoryCollaboratorEdge`；[schema-repos.json](../../../architecture/domain/fpt/schema-repos.json)，`TeamRepositoryEdge` |
| Repository | [Repository](../../owners/repository.md)：協作內容與工作資源容器；Issue／Discussion 生命週期仍歸各自 Owner | [schema-repos.json](../../../architecture/domain/fpt/schema-repos.json)，`Repository` |
| Role／Permission | 各業務 Owner 擁有角色／grant facts；[Identity & Access](../../owners/identity-access.md) 提供共用權限能力 | exact `OrganizationMemberRole`、`TeamMemberRole`、`RepositoryPermission`，不合成單一數值等級 |

Member、Collaborator 是既有模型中的關係與資格，不建立同名 package。Organization membership 不等於 Repository access；Team membership 只在 Repository 明確授予該 Team 存取時參與 effective access 計算。權限值域與各操作 policy 分開，未定義的能力 fail closed。

## 查看分類、上下文與證據

- 直接讀取 canonical semantic model、implementation topology 與 data topology 的必要 entries；不能據圖形把多個 Owner 自動合為一個 Bounded Context。
- 各 package 的 `SEMANTICS.md` 是 generated projection，不能手工當作 semantic authority。

Candidate 的 owner contract、模型與 test 路徑只支持目前已觀察到的責任邊界；有測試位置不代表測試已執行，靜態成功也不代表部署或實機驗收。沒有明確選定決策時保留原 status。

Team membership／maintainer 與 Repository 存取 grant 有不同語言與 lifecycle，因此 `work-collaboration` 保留 candidate；共同服務協作業務不足以證明它們是一套模型。其他 candidate 也不因與 GitHub 相似就自動升為 selected。

## Package 與實作判斷

依 [mandatory package resolution](../../../packages/AGENTS.md#mandatory-package-resolution) 先確認業務結果、不變條件、模型邊界、Owner 與既有 package 承接能力。現有 owners 已能承接本次模型，本次不新增、合併或搬移 package。

Aggregate、Port、Domain Event、Outbox 與 Saga 只在既有責任／不變條件需要時使用；不從 package 名稱推定 Aggregate Root，不把跨 Owner 交易畫成未實作的非同步事件，也不把 Expense confirmed 宣稱為核准、付款或入帳。

實作與驗證入口：[Hexagonal](hexagonal.md)、[dependency boundaries](../../rules/dependency-boundaries.md)、[validation evidence](../../rules/validation-evidence.md)。
