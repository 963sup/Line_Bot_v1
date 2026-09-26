# 文件約束

本目錄只保存人需要理解的 canonical knowledge；machine truth 仍由 source、manifest、schema、tests 與 provider readback 擁有。

- 先由 [Change routing](000-core/040-change-routing.md) 找 owner，再讀最少必要文件；不要先展開整套 docs。
- `000-core/` 固定只承擔五個 hot-path 問題：System、Domain Map、Repository Map、Change Routing、Glossary。方法論、外部 benchmark 與歷史材料不得在 Core 建第二套 truth。
- 一個 concept / contract 只有一個 authoritative owner；其他文件只 summary + link。README 只 routing，AGENTS 只記修改約束。
- `000–070` 只保存 current canonical knowledge；decision、proposal、migration、gap、risk、dated acceptance 放 `090-governance/`，且不得反向冒充 current。
- Current implementation 與 docs 衝突時，先判斷文件過期或 implementation 違反 architecture；不得用改文件掩蓋 code/schema 問題。
- Machine-readable semantic owner 是 `architecture/semantic-model.json`；module/data topology 分別由 `architecture/implementation-topology.json` 與 `architecture/data-topology.json` 擁有；SQL current state 由 `supabase/schemas/` 擁有。
- GitHub-like semantic benchmark 由 `architecture/semantic-benchmark.json` 與其 pinned upstream sources 擁有；產品採用與否只看 `architecture/semantic-model.json`。不要在 docs 維護第二份 49-file benchmark prose。
- Bounded Context、Module Boundary、Data Boundary、Consistency Boundary 必須分開；圖表只能投影 canonical text / machine source，不能成為第二套 authority。
- relocation 或刪除文件時，同 changeset 修正所有 repository 引用；不保留 redirect shell、alias doc、空殼或歷史 index。
- 完成 migration 後，仍成立的 truth 蒸餾回 current owner；無 recovery / regression / decision value 的過程材料交給 Git history。
- 文件中的 command、path、current claim 必須核對實際 script、exports、schema 或 tests；未知就明示未知，不杜撰 evidence。
- 不得因文件整理放寬 authorization、transaction、replay、version、tenant/data isolation、recovery、privacy 或 evidence semantics。
- 修改後執行 `pnpm docs:check`；repository-level 收尾依 root 規則執行 `pnpm check`。兩者只證明各自實際範圍。
