# Module boundaries

Module Boundary 回答「哪個 source owner 擁有責任與 public surface」。它不等於 Bounded Context、package 名稱或 Data Boundary；實際 mapping 由 `architecture/implementation-topology.json` 與 package exports 驗證。

## Module contract

一個可被其他 module 依賴的 owner必須能回答：

1. **Responsibility**：唯一擁有什麼程式責任。
2. **Public surface**：consumer 可使用哪些 export / port / DTO / entry point。
3. **Private implementation**：哪些 model、adapter、helper 不構成 contract。
4. **Consumer**：哪個真實 consumer 需要該 surface。
5. **Authority / failure**：結果可被信任到什麼程度，哪些檢查仍由 owner 執行。

沒有真實 consumer，不先擴大 export。

## Workspace owner

`packages/<owner>` 是正式 workspace module owner。Domain / Application / Contract / Adapter 等只描述 package內技術責任，不形成水平 owner。

跨 package consumer 只用 owner 的 `package.json#exports`。若 consumer 需要 private implementation，先檢查責任/contract 是否缺失；不得以 deep import、alias、wrapper 或 facade 繞過 boundary。

## Web modules

`apps/web/src/modules/<feature>` 擁有 feature-specific presentation、interaction、copy 與 HTTP projection；business behavior 仍由 owning package提供。

Web module 可以呈現某 Bounded Context 的一部分，也可以組合多個 owner 的 read projection；它不因 UI 邊界取得 business authority。需要 concrete cross-feature wiring 時由最外層 `app/api/_composition` 組裝，不讓 feature composition互相依賴。

## Adapter ownership

Adapter 由「它替誰的 capability 實作」決定 owner，不由技術類型決定：

- Owner-specific PostgreSQL adapter 留在該 owner。
- LINE / Google protocol adapter 留在 integration owner。
- 只有 connection、generic transport、migration runtime 等無 business authority 的 mechanism 才進 support/platform。

搬 adapter 不自動改 Data Boundary、RLS、transaction 或 schema ownership。

## Shared code

抽 shared/support 前依序問：

1. 兩邊其實是不是同一 owner？若是，放 owner public surface。
2. 是否為中立 mechanism，完全不決定 feature behavior？若是，才考慮 shared/support。
3. 是否只是目前程式長得像？若是，保留局部重複通常比錯誤抽象安全。

多處引用、純函式或通用名稱都不是共享 ownership 的充分 evidence。

## Composition

Composition 只注入 concrete dependencies，不建立第二套 business layer。Dependency 必須沿明確 function/constructor/port 傳入；下層不得使用 runtime service locator 偷抓 private dependency。

## Boundary change checklist

擴大 public surface、搬 module、合併或拆分 owner 前確認：

- 真實 consumer 被什麼 boundary 阻擋？
- Consumer 要的是 stable data、capability 還是 orchestration？
- 真正 authority owner 是誰？
- 現有 public contract 是否已足夠？
- Dependency direction 是否仍從 owner capability流向 consumer？
- 是否能直接收斂舊 surface，而不是永久保留 compatibility facade？
- Authorization、transaction、replay/version、isolation、recovery 是否保持？

## Validation

Machine owner 是 [Implementation topology](../../architecture/implementation-topology.json) 與各 `package.json#exports`；可執行 guard 見 [Architecture guards](../060-engineering/060-architecture-guards.md)。修改 boundary 時同步合法案例與最小違規反例，不以放寬 rule 讓現況通過。
