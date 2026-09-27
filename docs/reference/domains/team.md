# Team detailed reference

Low-frequency Team details. The owner boundary and invariants remain canonical in [Team](../../owners/team.md).

## Locator

TeamId 是 stable identity；Organization Team 的 human-readable locator 是 Organization `login` + Team `slug`。GitHub FPT 定義 `Organization.team(slug)` 與 `Team.slug`，GitHub REST docs 另明示 Team slug 由 Team name 產生，因此 current implementation 在 create／rename 時由 `name` deterministic derive slug，rename 會改變 slug，但不改 TeamId。Canonical authenticated route 是 `/orgs/{organizationLogin}/teams/{teamSlug}`；`/team` 仍是 collection/workbench。舊 slug 不建立 speculative redirect/history。

Current declarative contract 要求每個 Organization Team 都有 non-null slug，且同一 Organization 內唯一；create 與 rename 都由 name deterministic derive slug。Locator 只定位：direct open 仍重新驗 LINE proof、active OrganizationMembership、active TeamMembership 與 TeamMaintainer policy。

## 建立與加入

- active User 必須同時是 active OrganizationMembership，才能讀取或操作該 Organization 的 Organization Team。
- 建立 Organization Team 時，Team、建立者的 active TeamMembership 與 TeamMaintainer assignment 必須在同一交易成立；任一步失敗都不得留下半套狀態。
- 申請加入必須同時提交 `organizationAccountId` 與 `teamId`。兩者不匹配時拒絕，不能只按全域 Team ID 忽略 Organization scope。
- 加入申請先成為 pending TeamMembership；pending 參與者不能讀取 Team 私有內容。
- 曾被 removed 的參與者不能自行重新加入。
- LINE `groupId`、聊天室成員身分、URL 或 Rich Menu 入口都不是 TeamMembership 或 TeamMaintainer 證明。

## 成員移除與責任完整性

User 暫停／停權、OrganizationMembership 失效或 TeamMembership 離開／被移除後，均不得再取得該 Team 的私有讀寫能力。管理畫面可以向 effective TeamMaintainer 顯示失效狀態，以便處理責任，但失效 assignment 不授權。

若參與者仍是未完成 Issue 的 publisher 或 assignee，不可移除該 TeamMembership。必須先完成相關 Issue；首版不自動轉移責任，也不提供代理驗收或自動改派。這項限制保護 [Repository](../../owners/repository.md) 的責任鏈。

## 命令與一致性

正式 Organization Team 命令只有：

- `create-team`：只能在 actor 已有 active OrganizationMembership 的明確 Organization scope 建立 Team、creator membership 與 TeamMaintainer assignment；沒有 Organization 不存在可建立 Organization Team 的 global path。
- `rename-team`：只有 effective TeamMaintainer 可在 expectedVersion 一致時修改 Team name；Team id、Organization scope、creator identity 保持 immutable。
- `join`：建立或更新本人在該 Organization Team 的 pending 申請。
- `member`：調整 TeamMembership status，並在同一交易協調 Identity/Access 授予或撤銷 TeamMaintainer；本人退出是受限情況。

每個寫入命令必須：

- 由後端重新核驗 LINE proof、active User 與 active OrganizationMembership。
- 使用 `organizationAccountId`、`teamId` 與 `userId`；不接受 `groupId`、`memberId` 或前端宣告的 role 作相容 alias。
- 使用唯一 `requestId` 與完整 normalized command fingerprint 防止重複執行。
- 對既有 Team mutation 核對 `expectedVersion`。
- 同一 actor／`requestId` 只可重放完全相同命令並返回原 durable result；相同 ID 搭配不同內容必須拒絕。
- replay 仍重新核對 User、Organization 與最低 Team participation，不能恢復已失效的資格或授權。

交易取得共用治理 mutation lock 後才鎖 actor／target，避免雙向角色操作形成 lock inversion。這是 concurrency correctness，不代表吞吐或 production latency 已量測。

## 讀取規則

- UI 先列出本人可使用的 active Organizations，使用者明確選擇 Organization 後才列出該 scope 的 Organization Teams。
- 使用者可以看到自己在所選 Organization 尚未 removed 的 Team 摘要。
- 只有 active TeamMembership 可以讀取指定 Team 的私有內容。
- TeamMaintainer 可以看到完整 membership 狀態；一般 active participant 只看到 active participants。
- 無效 `organizationAccountId + teamId` 配對、無權限、讀取失敗與空資料必須區分。
- 遲到回應不能覆蓋新的 LINE session、Organization 或 Team selection；未知 mutation 結果保留原 `requestId` 供 exact retry。

## 驗收邊界

Repository source、current schema、local static checks、local tests、指定 Supabase readback、deployment 與 LINE mobile acceptance 是不同證據。本文件描述 current Organization Team source contract；EnterpriseTeam 已由 Enterprise owner 形成獨立 current slice，nested Organization Team 仍是 target，兩者不得互相代替。
