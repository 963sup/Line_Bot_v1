# Supabase 整合驗證規格

本目錄先建立跨能力驗收設計；目前沒有新增 SQL／TypeScript test runner 或 CI job。單一 Owner 的既有測試維持原位置；證據範圍由 [Validation evidence](../../docs/rules/validation-evidence.md) 擁有。

## Scenario placement

| 未來測試範圍 | 必須覆蓋的行為 | 需要的環境 |
| --- | --- | --- |
| database | constraints、function、trigger、rollback、concurrent transition | 既有 Owner SQL tests；多連線行為另用 disposable PostgreSQL |
| rls | browser roles 拒絕 private schema、runtime role 邊界、跨 scope 隔離 | 真實角色與 grants；不可只用高權限 connection |
| storage | 私有存取、upload/finalize 分離、unknown outcome、刪除競爭 | File tests 加 disposable Storage integration |
| functions | credential、scope、input bounds、timeout、replay | 實際 endpoint runtime 與受控 provider stub |
| integration/auth-flow | callback、失效、重播、candidate confirmation | 受控 Auth provider／callback；另留 remote smoke |
| integration/async-flow | durable handoff、lease、重投、ack crash、recovery | 實際 queue／scheduler 與可控制 failure injection |
| integration/realtime | 撤權、重連、重複／亂序、snapshot 補讀 | 實際 Realtime endpoint 與兩個不同 scope 的合成 actor |
| integration/vector | privacy、來源版本、重建、recall | 合成 corpus、固定模型／chunking 版本與品質基準 |

## Runner 接線要求

新增可執行測試時，同一變更必須指定 runner 與 pinned dependency、確定 fixture 建立／清理、環境變數名稱、timeout、失敗退出碼與 CI routing。只讀此文件不會執行任何 integration test。

本地測試不得指向 Production；remote smoke 需 exact target、受控合成資料、授權與 readback。清理僅限該次 fixture identity，不作整庫或整個 Bucket 刪除。不提交 dump、credential、真實 personal data 或偽造通過紀錄。

## 現有命令與證據

- 文件：`pnpm docs:check`，驗證 Markdown 與本地連結。
- Schema：`pnpm schema:check`；執行範圍由既有 package tasks 決定，不自動發現本目錄未來檔案。
- 一般修改：`pnpm check`；合併前：exact-head `pnpm validate`。
- Provider readback：既有 `schema:remote verify`、`storage:remote verify` 只證明各自驗證範圍。

發布與 remote mutation 使用 [Release](../../docs/reference/operations/release.md)。Local tests、CI、provider smoke 與 LINE device acceptance 分別保存結果，不能因文件或 runner 存在而宣稱能力正常。
