# Packages scope

`packages/<owner>` 是正式 Module Boundary。修改 package 前先定位 semantic owner、consumer、public contract、dependency direction 與 validation；不要從資料夾名稱反推 Bounded Context 或 Data Boundary。

## Owner

- Business meaning / owner / relationship 以 `architecture/semantic-model.json` 為 structured authority。
- 現有 module path、module kind 與 workspace dependency allowlist 以 `architecture/implementation-topology.json` 為 machine authority；本檔不維護 package inventory。
- Bounded Context、Module Boundary、Data Boundary、Consistency Boundary 可以對齊，但不得視為同一概念。
- 新 responsibility 只有在現有 owner 無法正確承接，而且具有真實 language / lifecycle / invariant / consumer 時，才考慮新的 owner 或 package。

## Boundary

- 跨 package consumer 只能使用 `package.json#exports` 公開 surface；產品 source 不依賴其他 package 的 internal、`dist` 或 testing-only path。
- `domain / application / contracts / adapters / agents / testing` 只在責任真實存在時建立；不為目錄對稱預建空 layer。
- Port / Contract 表達 consumer/application 真正需要的 capability；不得只是 SDK、SQL client 或另一 package private API 的 wrapper。
- Owner-specific adapter 留在 owner；LINE / Google 等 provider protocol 留在 integration owner；只有無 business authority 的中立 runtime mechanism 才進 `platform`。
- Consumer 不得直接讀另一 owner 的 private schema/table 來繞過 public contract。

## Invariants

- 純 placement、naming、dependency 或 boundary refactor 必須保持 [Invariant kernel](../docs/000-core/010-system.md) 的 authority、authorization/isolation、concurrency/replay、atomicity/recovery、ownership/dependency 與 evidence semantics。
- 新能力直接進真正 owner；不得用 alias、facade、compatibility package 或 pass-through service 掩蓋 responsibility 問題。
- Generated/reference data 若存在，必須能追到 canonical source；generated output、history、target design 與 current business truth 不得互相取代。

## Change rules

- 每個 `packages/<owner>/` 保有 `AGENTS.md` 與 `README.md`：前者只增加 owner-local constraint，後者只 routing；不得複製 parent、business、schema、export 或 validation truth。
- 新增、刪除或改變 workspace dependency 時，同 changeset 同步 owner `package.json`、`architecture/implementation-topology.json` 與 root `pnpm-lock.yaml`。
- 先確認根因與 owner，再決定 Delete、Merge、Simplify、Reuse、Move、Split 或 Add；change size 與 layer count 不是 architecture goal。
- 不以目錄對稱、檔案數、FPT category、GitHub Mobile surface 或「看起來像 DDD」作 package existence evidence。

## Validation

使用 root canonical commands。一般修改跑 `pnpm check`；merge / release 前跑 `pnpm validate`。能由 exports、types、architecture guards 或 tests enforcement 的規則，不在 child AGENTS 重寫第二份 truth。
