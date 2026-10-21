# Repository tooling scripts

本目錄擁有 repository-level validation/toolchain operations，不擁有產品規則。一般使用 root `package.json` canonical commands。

| Script | 用途 |
| --- | --- |
| `validate.mjs` | `pnpm check` / `pnpm validate` 唯一 orchestration implementation；依 scope/group 執行 lockfile、tooling/docs/lint/architecture/schema/deadcode/typecheck/test/build。 |
| `validate.test.mjs` | 驗證 validation group completeness、fast scope classification 與 affected selection。 |
| `check-tooling.mjs` | `pnpm tooling:check`：驗證 pinned toolchain、manifest/catalog、format/reachability/workflow/agent contracts、Codex canonical instruction wiring 與 active section completeness、retired package aliases，以及 scripts README completeness。 |
| `check-tooling.test.mjs` | 驗證 tooling governance checker positive/negative cases。 |
| `check-rules.mjs` | 驗證 runtime/tool rule configuration 可解析且符合 repository execution-policy constraints。 |
| `doctor.mjs` | `pnpm tooling:doctor`：檢查 exact Node/pnpm、Git、必要 workspace dev tools（包含 ts-morph parser），env 只回報 key 是否存在。 |
| `doctor.test.mjs` | 驗證 env key parsing 與 required toolchain health evaluation。 |
| `list-skills.mjs` | `pnpm skills:list [query]`：從已安裝技能的 SKILL.md metadata 列表或搜尋技能，並確認每項技能都在 `skills-lock.json` 登錄。 |
| `list-skills.test.mjs` | 驗證技能/lockfile 配對、metadata 解析、錯誤登錄與修復案例。 |

`tooling:doctor` 是 developer environment diagnosis；`tooling:check` 是 repository contract validation。兩者 evidence 不互相替代。

`check` 在執行前列出 scope、各階段選取／略過理由及 typecheck/test workspace selection。Schema 或未追蹤檔案會保守擴大 workspace coverage；明確指定 filter 時，由呼叫者負責涵蓋所有 consumer。輸出只解釋既有選取規則，不代表驗證已通過。

`tooling:check` 擁有 list-skills、check-tooling、validate 與 deployment adapter regression tests；validation 的 `tooling:test` 補執行 doctor、WBS operator、來源查改、runtime helper 與 Contract／Execution CLI 測試，避免同一次 validation 重複執行。

`scripts/code/*.test.mjs` 驗證來源查改流程；`scripts/code/` 變更會觸發 tooling fast gates。`code` 命令、ast-grep pin 與其特定 installation build 由 `tooling:check` 檢查，doctor 讀回安裝與原生 executable 版本；不擴大全域安裝腳本或 Codex 權限。

`ts-morph` 固定為 root direct exact `27.0.2`：其 parser 使用 TypeScript 5.9.2；模組解析使用 repository TypeScript 5.9.3，兩者不交換 compiler nodes。28.x 已切換 TypeScript 6，不以升級 compiler 來配合工具。Tooling guard／doctor 只證明 dependency pin 與安裝狀態；`scripts/code/*.test.mjs` 驗證實際 facts 提取與查詢行為。輸出不建立 domain semantics 或第二份 Source of Truth。
