# Four-model cutover validation — 2026-09-14

## 範圍與版本

本輪涵蓋 UserAccount、Organization、Enterprise、Organization-scoped Team 的程式、SQL、下游 consumer 與文件同步。結果來自 Windows 本機 working tree，整理時 HEAD 為 `be66f80f43fd25d6f8411afc0f92bc0e33a4a8fd`，但包含未提交修改，不能把結果歸給該 commit 或 main。

使用既有 `scripts/pnpm.ps1 validate`；首次執行受 sandbox `spawn EPERM` 阻擋，允許子程序後完成至 test 階段並失敗。這次失敗不是 EPERM。結果節錄、失敗測試位置及原始 log SHA256 保存於 [validation evidence](../090-history/100-four-model-cutover-validation.txt)。Turbo 有使用快取；表中數字是該次輸出，不代表每項均重新執行。

## 驗證結果

| 類別 | 已觀察結果 | 限制 |
| --- | --- | --- |
| Tooling | 34/34 通過 | 本機工具與規則檢查 |
| Docs | 482 Markdown、1143 local links 通過 | 此為執行當時數量；不驗證 anchor、遠端網址或產品行為 |
| Lint | 通過 | 不代表授權或交易正確 |
| Architecture tests / change-plan tests | 4/4、8/8 通過 | 檢查器本身的測試 |
| Schema | source tests 3/3、schema contract 3/3 通過 | PGlite clean rebuild，不是遠端資料切換 |
| Architecture / deadcode | 363 modules、0 violations；deadcode 通過 | 靜態依賴圖與 consumer 掃描 |
| Typecheck | 通過 | 不涵蓋 runtime 配置、SQL fixture 或 HTTP 行為 |
| Agents / Application tests | 4/4、40/40 通過 | 依本次執行及快取輸出 |
| Infrastructure tests | 91/91 通過 | 不替代實際 PostgreSQL 多 session 競爭測試 |
| Web tests | 前置測試 3/3；主測試 54/65 通過，11 失敗 | 完整 validate 不通過 |
| Production build | 本輪完整流程未執行 | validate 在 test 失敗後停止；套件編譯通過不能替代 Next.js production build |
| Remote / deployment / LINE 實機 | 未完成本輪驗收 | 不以本機結果推定 |

## 已取得的修正經驗

下列問題在本輪審查中發現並修改；對應 Team／governance 測試納入上述 Infrastructure 結果。這些是可回歸的條件，不是另外一套產品契約。

- Team 管理命令重播不能只檢查 active membership；撤銷 TeamManager 後必須重新檢查當下有效權限。相同 requestId 不等於授權。
- UserAccount 停權與復權會使舊 role qualification version 失效。明確重新授予時須更新 user／membership versions；不能因 assignment row 仍為 active 就回報成功。
- UserAccount 與治理命令使用不同 advisory key、再反序鎖 actor／target，可能死鎖。已統一 mutation serialization key；尚無多 session 壓力測試證據。
- Domain／Application／Infrastructure 改名後，仍可能殘留相對 import、Web composition、fixture 與 dependency guard。修正 owner 必須追到 consumer，僅新增 export 不足。
- 歷史 receipt 與目前 wire 必須分開：Task 使用明確 V1 解碼與 V2 寫入；UserAccount 使用 `paused`，具名 membership 的 `pending` 保留參與狀態語意。不得批次改寫不可變歷史內容。

## 尚未通過的 Web 測試

失敗位置以 evidence 內當時輸出為準；以下只整理症狀，未將推測寫成根因：

| 測試檔案 | 症狀 |
| --- | --- |
| `access-state.test.ts` | 預期 restore，實際 error |
| `attendance-api.test.ts` | 預期識別值，實際 undefined |
| `expense-api.test.ts` | 預期結果值 1，實際 undefined |
| `line-identity-http.test.ts`、`membership-api.test.ts` | 預期 403，實際 503 |
| `mention-flow.test.ts` | 預期正常回覆，收到服務暫不可用 |
| `partners-api.test.ts`、`permissions-api.test.ts`、`sap-api.test.ts`、`user-account-management-api.test.ts`、`workplaces-api.test.ts` | 預期成功 HTTP 回應，實際 503 |

多個入口共同回傳 503，優先檢查 Account composition、fixture 注入與 current SQL consumer；這是排查順序，不是已證實根因。不可改成接受 503 或略過測試來宣稱切換完成。

## 接續與放行條件

### 同日後續驗證

推送前已修正共同來源：Web fixture 注入 `userAccountStore`（原先仍注入 `memberStore`）；UI access-state 接受 `paused`；同步 UserAccount 資格錯誤文字的測試斷言。再次執行完整 `scripts/pnpm.ps1 validate` 全部通過，Web 主測試 65/65、Application 40/40、Infrastructure 91/91，Next.js production build 通過。輸出與 hash 見 [release validation](../090-history/110-four-model-cutover-release.txt)。上述初次失敗表保留歷史結果；目前本機驗證阻塞已解除。遠端 SQL、部署與實機驗收仍未完成。

先重現上述失敗並修正共同來源，再執行受影響測試及完整 `validate`。成功後新增後續結果，保留本輪失敗紀錄；不得把本文件改成從未失敗。遠端 SQL 需另行檢查 catalog、保留資料前置條件及獨立 readback；部署與 LINE 實機驗收仍各自取得證據。

本輪沒有可靠的逐代理 token／成本統計，不以工具次數或測試耗時推算花費。可確認的流程浪費是未先編譯就交付，以及 owner／consumer 接線漏改造成的往返；後續以有編譯證據的交付、明確檔案責任及集中整合驗證降低重複工作。
