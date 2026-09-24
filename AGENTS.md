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
