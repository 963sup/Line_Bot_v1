# AGENTS.md

- 修改前核對程式、consumer、型別與測試；衝突先分辨文件過期或程式違規。
- 保留既有修改；同 checkout 不並行寫入相同檔案或建置產物。
- 問題處理先走第一性原理，對照高手做法與 repository 真實 evidence，再追到根因；只有根因、Owner、Source of Truth 與 Boundary 已確認後，才用奧卡姆剃刀刪除不必要複雜度。
- 同一概念維持單一名稱，不用 import/export alias 掩蓋責任。
- 保留 [Invariant kernel](docs/000-core/010-system.md) 的 authority、authorization/isolation、concurrency/replay、atomicity/recovery、ownership/dependency 與 evidence semantics；不以 refactor 放寬。
- 取捨順序固定：Invariant correctness/security → 第一性原理 → 高手思維（benchmark / existing best solution / repository evidence）→ 根因 → Ownership / Source of Truth / Boundary / Dependency → 奧卡姆剃刀 → Validation / Evidence → aesthetic symmetry；不得把「change 最小」或「路徑最短」本身當 architecture 目標。DDD / Hexagonal 是 responsibility / dependency model，不是 layer quota。
- 沒有量測、真實 consumer、variation 或 boundary evidence，不新增 cache、event bus、worker、wrapper、facade 或 interface hierarchy；這是根因確認後的奧卡姆剃刀結果，不是為了縮小 change surface。
- 只引用其他套件的公開 exports；產品 source 不引用 dist／testing。
- 不提交秘密或私人資料；外部寫入依既有授權。
- 分開回報靜態、測試、建置、部署、API 與實機證據；未知明示。
- merge 前依 [Commit workflow](docs/060-engineering/020-development-workflow.md) 收斂 branch history；fixup、WIP、暫時驗證與純同步 main 的過程 commit 不留在永久歷史。

從 [README](README.md) 開始，沿目標路徑讀最近的局部 AGENTS，不能放寬父層；只讀本次需要的契約與 skill。Scope owner：[`packages/`](packages/AGENTS.md)、[`scripts/`](scripts/AGENTS.md)、[`.github/`](.github/AGENTS.md)、[`.agents/`](.agents/AGENTS.md)、[`.codex/`](.codex/AGENTS.md)。更深層 AGENTS 只增加真正的 local invariant。
程式結構見 [Monorepo](docs/020-architecture/010-repository-architecture.md)，依賴規則見 [Dependencies](docs/020-architecture/040-dependency-rules.md)。Biome 是 JS／TS／JSON 檔案內 canonical syntax、safe fix 與 import ordering 的唯一 owner；修改完成後先用 mutable `pnpm format`，不手工維護第二套格式規則。Knip 是 repository reachability、dead file、unused export／dependency 的 executable owner；finding 優先 Delete／收斂 public surface／修正真實 entry，禁止用 broad ignore 掩蓋。兩者都必須通過 read-only `pnpm check`；合併／發布用 `pnpm validate`，文件用 `pnpm docs:check`；驗證範圍見 [Validation](docs/060-engineering/040-validation.md)。

模型分工與子代理調度的唯一 human-readable owner 是 [模型分工](.codex/agents/AGENTS.md)；本檔只負責 routing，不複製模型責任。

## 開發決策與完成條件

- 開工先看 Git working tree，區分本次 ownership 與既有／其他交談修改；無法歸屬的變更先保留。共用檔案或產物會衝突時先協調，不以 reset、清理或全域 formatter 覆蓋他人進度。
- 先以可觀察行為說明成功條件，再由 [Change routing](docs/000-core/040-change-routing.md) 定位 owner。跨 owner 或語意變更可用 `pnpm semantic plan "<intent>"`、`pnpm semantic context "<intent>"` 縮小閱讀範圍；產生的計畫是導覽，仍須核對實際 consumer、code 與 tests。
- 「高手思維」須落到可引用的既有解法、測試或量測：說明適用條件與本次差異。外部 benchmark 只在相關決策需要時讀取，不把每次小修擴成全庫研究，也不因外部設計較完整就照搬。
- 修 bug 先找到可重現輸入與失敗邊界；以能區分修正前後的證據驗證根因。涉及權限、狀態轉移或外部副作用時，連同拒絕、重送、部分失敗等受影響路徑檢查，不只驗 happy path。
- 可由現有契約決定的可逆實作選擇直接完成；只有缺少會改變產品語意、資料處置或外部寫入授權的資訊才提出具體問題，同時推進不受影響部分。
- 收尾核對 diff 僅含本次必要修改，依 [Validation](docs/060-engineering/040-validation.md) 執行適用入口；純 AGENTS 變更仍需 `pnpm check` 驗 tooling 與文件。回報實跑命令、結果及阻塞，不將環境錯誤寫成產品失敗或跳過檢查後宣稱通過。
