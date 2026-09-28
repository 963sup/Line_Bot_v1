---
agent: 'agent'
description: '依 repository evidence 蒸餾全域 Markdown、釐清 authority 與唯一真相，並驗證前後差異'
---

範圍：${input:scope:填入目錄或路徑；未指定時處理整個 repository 的 Markdown}

## 目標與邊界

依目前 repository evidence 分析、蒸餾、重構並驗證 Markdown。優先順序：authority → 唯一 source of truth → 最少必要 context → responsibility / boundary → invariants / contracts → dependencies → validation evidence → machine readability → formatting。

成功是讓 Agent 更快找到真相、理解邊界、排除錯誤並完成驗證，不是單純減少檔案、bytes 或 tokens。不得為壓縮犧牲決策資訊與可讀性。

可使用環境中可用且獲授權的工具、Git、GitHub、Skills、CLI 與專案資料。工具可用不代表取得額外權限；本任務不自動授權 push、merge、部署或外部資料寫入。

本次修改限文件與必要引用修復。保留既有與他人修改，不任意更動 runtime、schema、workflow 或測試行為。發現系統缺陷時指出根因與證據，不靠改文件掩蓋。

## 1. 先確認現況與實際 consumer

- 讀取 root 與受影響目錄的 `AGENTS.md`，依 `docs/README.md` 與 `docs/facts/sources-of-truth.md` 找到 owner 和來源。子規則只增加局部約束，不複製或放寬上層規則。
- 檢查 branch、HEAD、working tree、未提交及未追蹤檔案、remote 設定與相對 main 的差異。區分本地 remote-tracking ref 與已查證的遠端狀態；無法查證就標示未知。不為盤點 reset、clean 或切換分支。
- 列出範圍內所有 Markdown、`AGENTS.md`、README，以及 `docs/`、`.github/`、`packages/`、`apps/`、`supabase/` 中的規則與知識入口。明列排除的第三方、產生物、快取與範圍外檔案。
- 先建索引，再按 owner 讀取必要內容與實際 consumer；核對 source、public exports、package manifests、workspace、schema、workflow、CI、測試與 validation scripts。不得直接批次改寫，也不把整棵引用樹一次載入。

## 2. 建立資訊地圖與基準

每份文件辨識：目的、scope、audience、owner、authority、source of truth、文件角色、入站與出站引用、與其他文件或 machine-readable source 的重複。角色可為入口、局部規則、reference、操作手冊或歷史紀錄。

從實際規範與 consumer 建立 authority hierarchy，不憑檔名推測優先級。同一事項只能有一個權威來源；其他文件提供必要導航與 scope 差異。

以以下維度判斷資訊價值；它們是分析框架，不是可憑空產生的精確分數：

| 維度 | 檢查重點 |
| --- | --- |
| Storage / Context | 有效資訊相對 bytes；有效且相關資訊相對 loaded tokens |
| Decision / Authority | 能縮小決策空間、排除錯誤、指定修改位置與不可破壞條件的內容 |
| Relevance / Retrieval | 任務相關比例、開啟文件數、跨目錄跳轉、tool calls 與 authority hops |
| Locality / Truth | 最近作用域可取得的必要知識、同一事實是否只維護一次 |
| Duplication / Ambiguity | 重複內容、需要額外猜測才能執行的敘述 |
| Validation / Fan-out | 規則能否客觀驗證，以及引用造成的必要閱讀擴散 |

記錄可重現的 before 基準：Markdown 數量、總 bytes、總 tokens、平均 tokens/file、重複內容、context fan-out、平均 authority hops、broken references、source-of-truth 重複與高歧義敘述。

固定檔案集合規則、計算方法與代表性任務路徑，供 after 比較。Tokens 需註明 tokenizer；無可用 tokenizer 則標記估算或未測，不把 bytes 當 tokens。重複與歧義需附判定方法或具體案例；fan-out 區分連結數與實際必讀依賴。不得捏造數值或改善幅度。

## 3. 修改前先輸出分析，再直接實施

簡要報告以下項目與對應路徑／證據：

1. Markdown 現況與 authority hierarchy。
2. 重複或競爭中的 source of truth。
3. Context fan-out 最高、context 成本高但決策資訊少的區域。
4. 過時文件、失效路徑與錯誤引用。
5. 可刪除、可合併、應移動或拆分 authority 的內容。
6. 最小必要修改集合、預期 consumer 影響與驗證方式。

分析完成後直接執行已確定且可逆的文件修改，不再次等待例行確認。若缺少會改變產品語意、資料處置或外部寫入授權的資訊，只暫停依賴該資訊的部分。

## 4. 依資訊價值重構

| 分類 | 處理方式 |
| --- | --- |
| 保留 | Authority、owner、boundary、invariants、contracts、必要 dependencies / workflows、failure conditions、安全與部署限制、validation、無法從程式碼推導的重要決策 |
| 壓縮 | 重複解釋、冗長背景、同義規則、過量範例；合併為明確條件或簡短表格 |
| 刪除 | 已證實失效或無 consumer 的內容、重複真相、無作用提醒、被實作取代的敘述 |
| 移動 | 正確但 authority 或 locality 錯置的內容；同步修正所有受影響引用 |

先修正 authority 與競爭真相，再移除 stale / duplicate 內容、降低 fan-out、收斂 AGENTS 與 README、改善 navigation，最後才修 wording / formatting。

- 歷史與未來設計不得冒充 current contract；先確認稽核、復原、決策理由或仍有效計畫的 consumer，再決定保留、移動或刪除。
- Machine-readable source 已定義的事實，文件只寫來源、意義、修改條件與驗證方式，不複製整份設定或 schema。
- `AGENTS.md` 服務執行，保留 critical rules 與必要局部知識；README 服務用途、快速開始、入口與主要操作；任務入口放 `.github/prompts/`，Codex 角色設定放 `.codex/agents/`。
- 不建立重複 skill、Markdown review database、review manifest、byte quota 或無 consumer 的新抽象。資訊地圖與比較結果放本次回報，除非既有流程確實需要持久化產物。
- 每段至少回答：這是什麼、誰負責、真相在哪、不可破壞什麼、影響誰、下一步去哪、如何驗證成功之一。
- 將「適當、視情況、相關內容」改為可辨識的觸發條件。每個連結須有任務用途；減少無效跳轉，但不靠複製規則消除引用。
- Agent-facing 文件按實際需要選用 Authority、Responsibility、Out of Scope、Source of Truth、Invariants、Contracts、Dependencies、Change Rules、Validation、References；不強制套版或加入空 section。
- 本提示中的分類與示例不是新的產品規則；任何 schema、migration、deployment 限制都須從目前權威來源查證。

## 5. 驗證與重新量化

- 檢查 Markdown syntax、重複 heading／anchor、broken links、失效 path、已刪除文件引用，以及文件中的 command、package、workflow、schema 名稱是否存在。
- 人工對照實際 consumer 檢查 authority conflict、規則重複、AGENTS scope collision、docs 與 source / schema / workflow drift、語意缺失及新增的隱性依賴。機械檢查不等於這些語意檢查已通過。
- 執行 `pnpm docs:check`；依 `docs/rules/validation-evidence.md` 及受影響 owner 選擇其他必要檢查，merge/release 才需完整 `pnpm validate`。檢查失敗先找根因，不放寬規則或掩蓋既有問題。
- 用相同口徑產生 before / after 比較。對不能量化的維度提供前後案例與限制；未改善的指標如實列出，不為追求下降而刪除必要資訊。
- 最後檢視 diff 與 working tree，確認只改必要範圍且保留既有成果。

## 6. 完成回報

回報實際刪除／合併／移動／修改的文件、原因、authority 與 retrieval path 的改善、前後量化、執行的驗證及結果、未驗證事項與阻塞。

只有範圍內主要重複真相已消除、authority / responsibility / invariants / dependencies / validation 清楚、引用有效、文件符合目前實作且沒有語意缺失或新增隱性依賴，才能宣告完成。剩餘例外須明列，不能聲稱全庫已驗證。

分開陳述文件檢查、靜態檢查、測試、建置、部署、外部 readback 與實機驗收；未執行的項目不宣稱通過。
