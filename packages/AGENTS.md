# Packages scope

## Owner

- `packages/<owner>` 是該責任的 module owner；先確認既有 owner、consumer、public contract 與依賴方向，再決定放置位置。
- Bounded Context、Module Boundary、Data Boundary 可以對齊，但不得因目錄或 package 名稱而假設它們是同一邊界。
- `packages/` 的完整性以 `architecture/semantic-model.json` 的真實 owner 與 `architecture/implementation-topology.json` 的 module mapping 判斷，不以 GitHub Mobile 選單、FPT category 或 Web module 數量判斷。Issue / Discussion / Label / Repository Milestone / Star 由 Repository owner 承接；WBS / Project Milestone 由 Project owner 承接；沒有新的 authority/lifecycle 就不建立同名 package。

## AGENTS routing index

`packages/` 共有 23 份 package-scope 指引：本檔是 1 份父層 scope contract，另有 22 份 owner-local AGENTS。進入 package 工作時，先讀本檔，再讀目標 owner 最近的 AGENTS；子檔只補 local constraint，不複製本檔正文。

- 父層 scope：[`packages/AGENTS.md`](AGENTS.md)
- Account：[`account/AGENTS.md`](account/AGENTS.md)
- Asset：[`asset/AGENTS.md`](asset/AGENTS.md)
- Assistant：[`assistant/AGENTS.md`](assistant/AGENTS.md)
- Attendance：[`attendance/AGENTS.md`](attendance/AGENTS.md)
- Audit：[`audit/AGENTS.md`](audit/AGENTS.md)
- Daily Check-in：[`daily-check-in/AGENTS.md`](daily-check-in/AGENTS.md)
- Enterprise：[`enterprise/AGENTS.md`](enterprise/AGENTS.md)
- Expense：[`expense/AGENTS.md`](expense/AGENTS.md)
- Google Workspace：[`google-workspace/AGENTS.md`](google-workspace/AGENTS.md)
- Identity/Access：[`identity-access/AGENTS.md`](identity-access/AGENTS.md)
- Ledger：[`ledger/AGENTS.md`](ledger/AGENTS.md)
- LINE Channel：[`line-channel/AGENTS.md`](line-channel/AGENTS.md)
- Notifications：[`notifications/AGENTS.md`](notifications/AGENTS.md)
- Organization：[`organization/AGENTS.md`](organization/AGENTS.md)
- Partners：[`partners/AGENTS.md`](partners/AGENTS.md)
- Payroll：[`payroll/AGENTS.md`](payroll/AGENTS.md)
- Platform：[`platform/AGENTS.md`](platform/AGENTS.md)
- Project：[`project/AGENTS.md`](project/AGENTS.md)
- Repository：[`repository/AGENTS.md`](repository/AGENTS.md)
- Team：[`team/AGENTS.md`](team/AGENTS.md)
- Wallet：[`wallet/AGENTS.md`](wallet/AGENTS.md)
- Workforce：[`workforce/AGENTS.md`](workforce/AGENTS.md)

## Boundary

- Consumer 只能使用各 package `package.json` 宣告的 public exports；產品 source 不得依賴其他 package 的 internal、dist 或 testing path。
- domain / application / contracts / adapters / agents 只在真實責任需要時建立；不預建空 layer、wrapper、facade 或 compatibility surface。
- 先用第一性原理確認 consumer 真正需要的 capability，再用高手思維對照既有 owner/public contract，追到 dependency 根因；只有根因確認後才用奧卡姆剃刀移除 pass-through service / manager / wrapper。Port / interface 只有真實 capability boundary、variation 或 external technology boundary 存在時才建立。
- 新能力直接進真正 owner；不得重新建立已退休的 horizontal implementation 或用 alias 掩蓋 ownership / naming 問題。

## Invariants

- 純 Module Boundary / naming / migration refactor 必須保持 [Invariant kernel](../docs/000-core/010-system.md) 的 K1–K6 semantics，不得改變 authorization、transaction、replay protection、version control、tenant/data isolation、recovery 或 evidence integrity。
- Transition facade 只可承接無行為變更遷移；新增產品能力不得依賴它作新的長期 public surface。
- 以 [GitHub GraphQL fpt data](https://github.com/github/docs/tree/main/src/graphql/data/fpt) 作為 owner platform 的結構參考：每個 `packages/<owner>` 是 capability/category owner，不是把所有 model 收進共用 schema 或 horizontal layer。
- 逆向 `fpt` 的 49-file indicator 時，package mapping 至少要回答：哪個 owner 產生 contract、哪個資料是 generated、哪個 index 導航 consumer、哪個 metadata 表示 preview/future/history、哪個 validator 保護 reference/version 完整性；不能只新增同名 JSON 或把 provider schema 直接暴露成 public API。
- Owner package 必須能獨立說明 public contract、private implementation、依賴的其他 owner contract、version/status 與 validation；跨 owner 只引用穩定 public contract，不引用另一 owner 的 schema fragment、generated private file 或 database table。
- 若建立 owner-level schema/index，source of truth、generated output、change history 與 target design 必須分開；generated output 只能由 canonical source 重建，不能反向成為 business authority。
- Category 分片不得切斷 identity、scope、authorization、version、replay、transaction 或 recovery invariant；分片是可導航與可載入的結構，不是 ownership 逃生口。

## Change rules

- Package-specific business truth 由 code、schema 與 canonical docs 擁有；本檔只描述 packages scope 的 agent change constraints。
- 每個 `packages/<owner>/` 必須同時有 `AGENTS.md` 與 `README.md`：`AGENTS.md` 只記 owner-local constraint，`README.md` 只作入口並引用 canonical truth；兩者都不得複製 parent、business、schema、export 或 validation truth。
- Change strategy 固定為：第一性原理 → 高手思維（benchmark + repository evidence）→ 根因 → Owner / Truth / Boundary → 奧卡姆剃刀 → Validation。Delete / Merge / Simplify / Reuse / Add 只能作為根因確認後的實作手段，不得提前用來限制正確解。
- 新增、刪除或改變 workspace dependency 時，`packages/*/package.json`、`architecture/implementation-topology.json` 與 root `pnpm-lock.yaml` 必須在同一變更同步；不得提交 manifest-only dependency drift。Lockfile 由 pnpm 產生／同步，不手工建立第二套 dependency truth。
- 不以目錄對稱、layer 完整或「看起來像 DDD」作 acceptance；單一檔案、function 或 callback 能清楚承擔責任時，不拆成多層 ceremony。

## Validation

- 使用 root `package.json` 的 canonical commands；一般修改跑 `pnpm check`，merge / release 前跑 `pnpm validate`。
- 能由 package exports、architecture guard、types 或 tests 機器 enforcement 的規則，不以重複 AGENTS 文字作第二套 truth。
